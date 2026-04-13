/**
 * main.js — Proceso principal Electron + lanzador de Minecraft
 *
 * Flujo:
 *  1. Crea ventana Electron con UI
 *  2. Gestión multicuenta Microsoft
 *  3. Configuración de RAM persistente
 *  4. syncMods actualiza la carpeta de mods
 *  5. Instala Fabric Loader desde Meta API
 *  6. minecraft-launcher-core lanza el juego
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { Client } = require("minecraft-launcher-core");
const { loginMicrosoft, getAccountList, getAccountAuth, removeAccount } = require("./auth");
const { syncMods, fetchManifest, normalizeManifest } = require("./updater");
const path = require("path");
const fs = require("fs");
const fsExtra = require("fs-extra");
const zlib = require("zlib");
const axios = require("axios");
const EventEmitter = require("events");
const { execSync, execFile, spawn } = require("child_process");
const { pathToFileURL } = require("url");
const AdmZip = require("adm-zip");

// ─── RUTAS DE PERSISTENCIA ───────────────────────────────────────────────────
// Mapa de rutas usadas por el launcher.  Convención:
//   userData  → %APPDATA%\lucerion-launcher  (safe para Store y standalone)
//   appData   → %APPDATA%  (directorio raíz; gameDir puede personalizarse)
//
//  Clave                  Ruta                                     Store  Standalone
//  ---------------------  ---------------------------------------  -----  ----------
//  DEFAULT_GAME_DIR       %APPDATA%/.lucerion-minecraft            ✓      ✓
//  SETTINGS_FILE          userData/settings.json                   ✓      ✓
//  OPTIONAL_MODS_FILE     userData/optional-mods.json              ✓      ✓
//  USER_MODS_BASE         userData/user-mods/                      ✗*     ✓
//  accounts.json          userData/accounts.json   (auth.js)       ✓      ✓
//  manifest-cache.json    gameDir/manifest-cache.json              ✓      ✓
//  modpack-version-*.txt  userData/modpack-version-<id>.txt        ✓      ✓
//  JAVA_INSTALL_DIR_NAME  userData/java-runtime/                   ✓      ✓
//  LAUNCHER_UPDATE_DIR    userData/launcher-update/                ✗**    ✓
//
//  * USER_MODS_BASE existe pero nunca se lee/escribe en la variante Store.
//  ** LAUNCHER_UPDATE_DIR no se usa en Store (self-update desactivado).
const DEFAULT_GAME_DIR = path.join(app.getPath("appData"), ".lucerion-minecraft");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const OPTIONAL_MODS_FILE = path.join(app.getPath("userData"), "optional-mods.json");
const USER_MODS_BASE = path.join(app.getPath("userData"), "user-mods");
const APP_VERSION = typeof app.getVersion === "function" ? app.getVersion() : require("./package.json").version;
const DEFAULT_LAUNCHER_RELEASE_API = "https://api.github.com/repos/juyliantamayo/launchercretania/releases/latest";
const DEFAULT_LAUNCHER_ASSET = "LucerionLauncher.exe";
const LAUNCHER_UPDATE_DIR = path.join(app.getPath("userData"), "launcher-update");

// ─── BUILD VARIANT ───────────────────────────────────────────────────────────
/**
 * STORE_BUILD: true cuando el launcher fue compilado para Microsoft Store.
 * Se inyecta en package.json via `extraMetadata.storeBuild: true` al ejecutar
 * `npm run build:store` (usa electron-builder.store.json).
 *
 * Comportamiento diferenciado según canal de distribución:
 *  - Self-update del launcher:      DESACTIVADO en Store (la tienda gestiona las actualizaciones)
 *  - Reemplazo de ejecutable (.exe): DESACTIVADO en Store (incompatible con app container)
 *  - User mods JAR del usuario:     DESACTIVADO en Store (solo contenido oficial del modpack)
 *  - Overlays/funciones avanzadas:  SIMPLIFICADOS en Store (experiencia enfocada y certificable)
 *
 * La build standalone no es afectada por este flag (STORE_BUILD === false).
 */
const STORE_BUILD = !!(require("./package.json").storeBuild);
if (STORE_BUILD) {
  console.log("[main] Variante Microsoft Store activa — self-update y user mods JAR desactivados.");
}

// Adoptium JDK 17 para Windows x64 (portable zip)
const JAVA_VERSION = "21";
const JAVA_DOWNLOAD_URL = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk";
const JAVA_INSTALL_DIR_NAME = "java-runtime";

process.on("uncaughtException", (err) => {
  console.error("[main] Error no capturado:", err);
});

let win;
let launcherUpdateState = {
  status: "idle",
  currentVersion: APP_VERSION,
  remoteVersion: "",
  downloadedFile: "",
  notes: [],
  error: ""
};

// ─── MULTI-INSTANCE TRACKING ─────────────────────────────────────────────────
// Map<modpackId, { launcher: Client, pid: number|null, startTime: number }>
const runningInstances = new Map();
const pendingLaunches = new Set();

// ─── SETTINGS (RAM etc.) ──────────────────────────────────────────────────────
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("[main] Error leyendo settings:", e.message);
  }
  return { ramMin: 2, ramMax: 4, width: 1280, height: 720, gameDir: "" };
}

function saveSettings(settings) {
  try {
    fsExtra.ensureDirSync(path.dirname(SETTINGS_FILE));
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("[main] No se pudieron guardar los ajustes:", e.message);
  }
}

/** Obtiene el directorio de juego efectivo */
function getGameDir(modpackId = "") {
  const settings = loadSettings();
  let baseDir = (settings.gameDir && settings.gameDir.trim()) ? settings.gameDir.trim() : DEFAULT_GAME_DIR;
  // Si el usuario eligió una ruta custom, asegurar que siempre esté dentro de "Lucerion Launcher"
  if (baseDir !== DEFAULT_GAME_DIR && !baseDir.endsWith("Lucerion Launcher")) {
    baseDir = path.join(baseDir, "Lucerion Launcher");
  }
  if (!modpackId) return baseDir;
  // Cada modpack va en su propia subcarpeta: Lucerion Launcher/<modpackId>/
  return path.join(baseDir, modpackId);
}

function canAccessModpack(modpack, accountUuid) {
  if (!modpack) return false;
  if (modpack.public !== false) return true;
  if (!Array.isArray(modpack.allowedUuids) || modpack.allowedUuids.length === 0) return false;
  return Boolean(accountUuid && modpack.allowedUuids.includes(accountUuid));
}

function normalizeVersion(version) {
  return String(version || "0.0.0").trim().replace(/^[^\d]*/, "");
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split(".").map((part) => parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split(".").map((part) => parseInt(part, 10) || 0);
  const maxLength = Math.max(a.length, b.length);

  for (let index = 0; index < maxLength; index += 1) {
    const partA = a[index] || 0;
    const partB = b[index] || 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}

function getPackagedModpackDir() {
  const packed = path.join(process.resourcesPath || "", "my-modpack");
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, "..", "my-modpack");
}

function resolveModpackImageUrl(modpack) {
  if (!modpack || !modpack.image) return "";
  if (/^https?:\/\//i.test(modpack.image)) return modpack.image;

  const cleanedImage = String(modpack.image).replace(/^\.\//, "");
  if (modpack.baseUrl) {
    return `${String(modpack.baseUrl).replace(/\/$/, "")}/${cleanedImage}`;
  }

  const localAsset = path.join(getPackagedModpackDir(), cleanedImage);
  if (fs.existsSync(localAsset)) {
    return pathToFileURL(localAsset).toString();
  }

  return "";
}

function emitLauncherUpdateStatus(patch = {}) {
  launcherUpdateState = {
    ...launcherUpdateState,
    ...patch,
    currentVersion: APP_VERSION
  };

  if (win && !win.isDestroyed()) {
    win.webContents.send("launcher-update-status", launcherUpdateState);
  }
}

function isPackagedApp() {
  return Boolean(app.isPackaged && !process.defaultApp);
}

function scheduleLauncherReplacementOnQuit(downloadedFile) {
  // Store: el reemplazo de ejecutable es incompatible con el sandbox de Microsoft Store.
  // Las actualizaciones del launcher las gestiona la propia tienda, no el ejecutable.
  if (STORE_BUILD) return;
  if (!downloadedFile || !fs.existsSync(downloadedFile) || !isPackagedApp()) return;

  const currentExe = process.execPath;
  if (!currentExe || path.extname(currentExe).toLowerCase() !== ".exe") return;

  const currentPid = process.pid;
  const command = [
    `$target = '${currentExe.replace(/'/g, "''")}'`,
    `$source = '${downloadedFile.replace(/'/g, "''")}'`,
    `$pidToWait = ${currentPid}`,
    "while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }",
    "Copy-Item -Path $source -Destination $target -Force",
    "Start-Process -FilePath $target"
  ].join("; ");

  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });

  child.unref();
}

async function checkLauncherAutoUpdate(manifest) {
  if (!isPackagedApp()) {
    emitLauncherUpdateStatus({ status: "dev-mode" });
    return;
  }
  // Store: Microsoft Store gestiona las actualizaciones del launcher directamente.
  // El launcher no debe descargarse ni reemplazarse a sí mismo en un entorno Store.
  if (STORE_BUILD) {
    emitLauncherUpdateStatus({ status: "store-managed" });
    return;
  }

  const launcherMeta = manifest && manifest.launcher ? manifest.launcher : {};
  const releaseApiUrl = launcherMeta.releaseApiUrl || DEFAULT_LAUNCHER_RELEASE_API;
  const expectedAssetName = launcherMeta.assetName || DEFAULT_LAUNCHER_ASSET;

  try {
    emitLauncherUpdateStatus({ status: "checking", notes: launcherMeta.patchNotes || [] });
    const { data: release } = await axios.get(releaseApiUrl, {
      timeout: 15000,
      headers: {
        Accept: "application/vnd.github+json",
        "Cache-Control": "no-cache"
      }
    });

    const remoteVersion = normalizeVersion(launcherMeta.version || release.tag_name || release.name || APP_VERSION);
    if (compareVersions(remoteVersion, APP_VERSION) <= 0) {
      emitLauncherUpdateStatus({ status: "up-to-date", remoteVersion, notes: launcherMeta.patchNotes || [] });
      return;
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((entry) => entry.name === expectedAssetName)
      || assets.find((entry) => /\.exe$/i.test(entry.name));

    if (!asset || !asset.browser_download_url) {
      emitLauncherUpdateStatus({ status: "error", remoteVersion, error: "No se encontró el instalador del launcher en la release." });
      return;
    }

    await fsExtra.ensureDir(LAUNCHER_UPDATE_DIR);
    const downloadedFile = path.join(LAUNCHER_UPDATE_DIR, `${remoteVersion}-${asset.name}`);
    emitLauncherUpdateStatus({ status: "downloading", remoteVersion, notes: launcherMeta.patchNotes || [] });

    const response = await axios.get(asset.browser_download_url, {
      responseType: "stream",
      timeout: 300000,
      headers: { "Cache-Control": "no-cache" }
    });

    const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
    let downloadedBytes = 0;
    const writer = fs.createWriteStream(downloadedFile);

    await new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        emitLauncherUpdateStatus({
          status: "downloading",
          remoteVersion,
          progress: percent,
          downloadedFile,
          notes: launcherMeta.patchNotes || []
        });
      });
      response.data.on("error", reject);
      writer.on("error", reject);
      writer.on("finish", resolve);
      response.data.pipe(writer);
    });

    emitLauncherUpdateStatus({
      status: "ready",
      remoteVersion,
      downloadedFile,
      notes: launcherMeta.patchNotes || []
    });
  } catch (error) {
    emitLauncherUpdateStatus({ status: "error", error: error.message });
  }
}

// ─── OPTIONAL MODS PREFERENCES ───────────────────────────────────────────────
function loadOptionalMods() {
  try {
    if (fs.existsSync(OPTIONAL_MODS_FILE)) {
      return JSON.parse(fs.readFileSync(OPTIONAL_MODS_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("[main] Error leyendo optional-mods:", e.message);
  }
  return {};
}

function saveOptionalMods(data) {
  fsExtra.ensureDirSync(path.dirname(OPTIONAL_MODS_FILE));
  fs.writeFileSync(OPTIONAL_MODS_FILE, JSON.stringify(data, null, 2));
}

// ─── USER MODS (uploaded JARs) ────────────────────────────────────────────────
function getUserModsDir(modpackId) {
  return path.join(USER_MODS_BASE, modpackId || "default");
}

/** Parse a single entry from a ZIP/JAR without external deps. Returns string content or null. */
function readZipEntry(filePath, entryName) {
  try {
    const buf = fs.readFileSync(filePath);
    // Locate End of Central Directory record
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) return null;
    const numEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset   = buf.readUInt32LE(eocdOffset + 16);
    let pos = cdOffset;
    for (let i = 0; i < numEntries; i++) {
      if (buf.readUInt32LE(pos) !== 0x02014b50) break;
      const method      = buf.readUInt16LE(pos + 10);
      const compSize    = buf.readUInt32LE(pos + 20);
      const fnLen       = buf.readUInt16LE(pos + 28);
      const extraLen    = buf.readUInt16LE(pos + 30);
      const commentLen  = buf.readUInt16LE(pos + 32);
      const localOffset = buf.readUInt32LE(pos + 42);
      const name        = buf.toString("utf8", pos + 46, pos + 46 + fnLen);
      pos += 46 + fnLen + extraLen + commentLen;
      if (name !== entryName) continue;
      const lhFnLen    = buf.readUInt16LE(localOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + lhFnLen + lhExtraLen;
      const data = buf.slice(dataOffset, dataOffset + compSize);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
      return null;
    }
    return null;
  } catch { return null; }
}

function readJarMeta(jarPath) {
  const basename = path.basename(jarPath, ".jar");
  let name = basename, description = "", version = "";
  try {
    const raw = readZipEntry(jarPath, "fabric.mod.json");
    if (raw) {
      const meta = JSON.parse(raw);
      name        = meta.name || basename;
      description = meta.description || "";
      version     = meta.version || "";
    }
  } catch {}
  return { name, description, version };
}

function listUserMods(modpackId) {
  const dir = getUserModsDir(modpackId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".jar"))
    .map(f => {
      const meta = readJarMeta(path.join(dir, f));
      return { id: "__user__" + f, file: f, source: "user",
               name: meta.name, description: meta.description,
               version: meta.version, category: "user" };
    });
}


/**
 * Busca Java 21+ en el sistema.
 * Retorna { found, version, path } o { found: false, error }
 */
function detectJava() {
  // 0. Primero verificar Java instalado por el launcher
  const launcherJavaDir = path.join(app.getPath("userData"), JAVA_INSTALL_DIR_NAME);
  if (fs.existsSync(launcherJavaDir)) {
    const localJava = findJavaExeIn(launcherJavaDir);
    if (localJava) {
      const check = detectJavaAt(localJava);
      if (check && check.found) return check;
    }
  }

  // 1. Intentar "java -version" del PATH
  const tryJava = (cmd) => {
    try {
      const output = execSync(`"${cmd}" -version 2>&1`, { encoding: "utf-8", timeout: 10_000 });
      const match = output.match(/version "(\d+)(?:\.(\d+))?/);
      if (match) {
        const major = parseInt(match[1]);
        if (major >= 21) return { found: true, version: major, path: cmd };
      }
    } catch {}
    return null;
  };

  // Intentar javaw del PATH (sin consola), luego java como fallback
  const fromJavaw = tryJava("javaw");
  if (fromJavaw) return fromJavaw;
  const fromPath = tryJava("java");
  if (fromPath) return { ...fromPath, path: preferJavaw(fromPath.path) };

  // 2. Buscar en rutas comunes de Windows
  const programFiles = [
    process.env.PROGRAMFILES || "C:\\Program Files",
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
    path.join(process.env.LOCALAPPDATA || "", "Programs")
  ];

  const javaDirs = [];
  for (const pf of programFiles) {
    for (const sub of ["Java", "Eclipse Adoptium", "AdoptOpenJDK", "Microsoft", "Zulu", "BellSoft"]) {
      const dir = path.join(pf, sub);
      if (fs.existsSync(dir)) {
        try {
          const entries = fs.readdirSync(dir);
          for (const e of entries) {
            const javawBin = path.join(dir, e, "bin", "javaw.exe");
            if (fs.existsSync(javawBin)) { javaDirs.push(javawBin); continue; }
            const javaBin = path.join(dir, e, "bin", "java.exe");
            if (fs.existsSync(javaBin)) javaDirs.push(javaBin);
          }
        } catch {}
      }
    }
  }

  // Buscar también en el Minecraft runtime (directorio base + por defecto)
  const runtimeCandidates = [path.join(DEFAULT_GAME_DIR, "runtime")];
  try {
    const customDir = getGameDir();
    if (customDir !== DEFAULT_GAME_DIR) runtimeCandidates.push(path.join(customDir, "runtime"));
  } catch {}
  for (const mcRuntimeDir of runtimeCandidates) {
    if (fs.existsSync(mcRuntimeDir)) {
      try {
        const walkRuntime = (dir) => {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const full = path.join(dir, item.name);
            if (item.isFile() && (item.name === "javaw.exe" || item.name === "java.exe")) javaDirs.push(full);
            else if (item.isDirectory()) walkRuntime(full);
          }
        };
        walkRuntime(mcRuntimeDir);
      } catch {}
    }
  }

  // Preferir javaw.exe para evitar ventana de consola
  const javawDirs = javaDirs.map(preferJavaw);
  // Deduplicar
  const uniqueDirs = [...new Set(javawDirs)];
  for (const jp of uniqueDirs) {
    const result = tryJava(jp);
    if (result) return result;
  }

  return { found: false, error: "Java 21 o superior no encontrado." };
}

// ─── JAVA AUTO-INSTALLER ──────────────────────────────────────────────────────
/**
 * Descarga e instala Java 21 (Adoptium Temurin) como portable en la carpeta del launcher.
 * Usa la API de Adoptium para obtener el .zip, lo extrae sin necesidad de permisos admin.
 *
 * @param {Function} onProgress — callback(percentage, message) para informar progreso
 * @returns {object} { found: true, version: 21, path: "...java.exe" }
 */
async function installJava(onProgress = () => {}) {
  const javaBaseDir = path.join(app.getPath("userData"), JAVA_INSTALL_DIR_NAME);
  const zipPath = path.join(app.getPath("temp"), "adoptium-jdk21.zip");

  // Si ya hay una instalación local previa, verificar
  if (fs.existsSync(javaBaseDir)) {
    const localJava = findJavaExeIn(javaBaseDir);
    if (localJava) {
      const check = detectJavaAt(localJava);
      if (check && check.found) {
        console.log("[java-installer] Java local ya existe:", localJava);
        return check;
      }
    }
  }

  onProgress(0, "Descargando Java 21 (Adoptium Temurin)…");
  console.log("[java-installer] Descargando desde Adoptium API…");

  // Descargar el .zip con progreso
  const response = await axios.get(JAVA_DOWNLOAD_URL, {
    responseType: "stream",
    timeout: 300_000, // 5 min timeout
    maxRedirects: 5
  });

  const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
  let downloadedBytes = 0;

  await fsExtra.ensureDir(path.dirname(zipPath));
  const writer = fs.createWriteStream(zipPath);

  await new Promise((resolve, reject) => {
    response.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0) {
        const pct = Math.round((downloadedBytes / totalBytes) * 70); // 0-70% for download
        const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMb = (totalBytes / 1024 / 1024).toFixed(0);
        onProgress(pct, `Descargando Java 21… ${mb}/${totalMb} MB`);
      }
    });
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  console.log(`[java-installer] Descargado: ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`);
  onProgress(70, "Extrayendo Java 21…");

  // Extraer con PowerShell (disponible en Windows 10+)
  await fsExtra.ensureDir(javaBaseDir);

  // Limpiar instalación anterior si existe
  try {
    const existing = fs.readdirSync(javaBaseDir);
    for (const item of existing) {
      await fsExtra.remove(path.join(javaBaseDir, item));
    }
  } catch {}

  try {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${javaBaseDir}' -Force"`,
      { timeout: 120_000, windowsHide: true }
    );
  } catch (err) {
    const isPermission = /access|denied|permission/i.test(err.message);
    const isAntivirus = /block|virus|quarantine|defender/i.test(err.message);
    let hint = "";
    if (isPermission) hint = " Tu antivirus o permisos del sistema pueden estar bloqueando la extracción.";
    else if (isAntivirus) hint = " Tu antivirus puede estar bloqueando la extracción. Añade una excepción para la carpeta del launcher.";
    throw new Error(
      "Error al extraer Java." + hint + "\n" +
      "Si el problema persiste, instálalo manualmente desde https://adoptium.net/\n" +
      "Detalle: " + err.message
    );
  }

  onProgress(90, "Verificando instalación de Java…");

  // Limpiar zip descargado
  try { fs.unlinkSync(zipPath); } catch {}

  // Buscar java.exe dentro de la carpeta extraída
  const javaExe = findJavaExeIn(javaBaseDir);
  if (!javaExe) {
    throw new Error("No se encontró java.exe después de la extracción.");
  }

  // Verificar que funciona
  const result = detectJavaAt(javaExe);
  if (!result || !result.found) {
    throw new Error("Java instalado pero no responde correctamente.");
  }

  onProgress(100, `Java ${result.version} instalado correctamente.`);
  console.log(`[java-installer] Java ${result.version} instalado en: ${javaExe}`);
  return result;
}

/** Prefiere javaw.exe (sin consola) sobre java.exe */
function preferJavaw(javaExePath) {
  if (!javaExePath) return javaExePath;
  const javawPath = javaExePath.replace(/java\.exe$/i, "javaw.exe");
  if (javawPath !== javaExePath && fs.existsSync(javawPath)) return javawPath;
  return javaExePath;
}

/** Busca javaw.exe (o java.exe) recursivamente dentro de un directorio */
function findJavaExeIn(baseDir) {
  try {
    const items = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(baseDir, item.name);
      if (item.isDirectory()) {
        // Buscar en bin/ — preferir javaw.exe sobre java.exe
        const javawBin = path.join(full, "bin", "javaw.exe");
        if (fs.existsSync(javawBin)) return javawBin;
        const javaBin = path.join(full, "bin", "java.exe");
        if (fs.existsSync(javaBin)) return javaBin;
        // Recursivo un nivel más
        const deeper = findJavaExeIn(full);
        if (deeper) return deeper;
      }
    }
  } catch {}
  return null;
}

/** Verifica una ruta específica de java */
function detectJavaAt(javaPath) {
  try {
    const output = execSync(`"${javaPath}" -version 2>&1`, { encoding: "utf-8", timeout: 10_000 });
    const match = output.match(/version "(\d+)(?:\.(\d+))?/);
    if (match) {
      const major = parseInt(match[1]);
      if (major >= 21) return { found: true, version: major, path: javaPath };
    }
  } catch {}
  return null;
}

// ─── DIAGNÓSTICO DE ERRORES DE RED ────────────────────────────────────────────
/**
 * Traduce errores de red (axios/Node) a mensajes legibles para el usuario.
 */
function diagnoseNetworkError(err) {
  const code = err.code || "";
  const msg = err.message || "";
  if (code === "ENOTFOUND")
    return "Sin conexión a Internet o el servidor no responde (DNS no encontrado).";
  if (code === "ECONNREFUSED")
    return "El servidor rechazó la conexión. Puede estar en mantenimiento.";
  if (code === "ECONNRESET" || code === "ECONNABORTED")
    return "La conexión se interrumpió. Verifica tu conexión a Internet e inténtalo de nuevo.";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || msg.includes("timeout"))
    return "Tiempo de espera agotado. Tu conexión podría ser lenta o el servidor no responde.";
  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "CERT_HAS_EXPIRED" ||
      msg.includes("certificate") || msg.includes("SSL"))
    return "Error de certificado SSL. Si usas una red corporativa o VPN, puede estar interfiriendo.";
  if (code === "ENOSPC")
    return "No hay espacio suficiente en disco para completar la descarga.";
  if (code === "EACCES" || code === "EPERM")
    return "Permisos insuficientes. Intenta ejecutar como administrador o elige otra carpeta.";
  if (err.response && err.response.status === 401)
    return "Sesión expirada o credenciales inválidas. Vuelve a iniciar sesión.";
  if (err.response && err.response.status === 403)
    return "Acceso denegado por el servidor. Verifica tu cuenta o permisos.";
  if (err.response && err.response.status === 404)
    return "El recurso solicitado no fue encontrado en el servidor (404).";
  if (err.response && err.response.status === 429)
    return "Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.";
  if (err.response && err.response.status >= 500)
    return `Error del servidor (${err.response.status}). Inténtalo de nuevo más tarde.`;
  return msg;
}

// ─── VALIDACIÓN PRE-LANZAMIENTO ──────────────────────────────────────────────
/**
 * Verifica condiciones básicas antes de lanzar el juego:
 *  - Ruta no excede MAX_PATH de Windows (260 chars)
 *  - El directorio de juego es escribible
 *  - Hay espacio libre mínimo en disco (1 GB)
 */
async function validatePreLaunch(gameDir) {
  // Validar longitud de ruta en Windows
  if (process.platform === "win32" && gameDir.length > 240) {
    throw new Error(
      `La ruta del juego es demasiado larga (${gameDir.length} caracteres). ` +
      "Windows tiene un límite de 260 caracteres. Elige una ruta más corta en Configuración."
    );
  }

  // Validar que el directorio sea escribible
  await fsExtra.ensureDir(gameDir);
  const testFile = path.join(gameDir, ".launcher-write-test");
  try {
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
  } catch (e) {
    throw new Error(
      "No se puede escribir en la carpeta del juego. " +
      "Verifica los permisos o elige otra carpeta en Configuración.\n" +
      "Ruta: " + gameDir
    );
  }

  // Validar espacio libre (>1 GB)
  try {
    const stats = fs.statfsSync(gameDir);
    const freeBytes = stats.bavail * stats.bsize;
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    if (freeGB < 1) {
      throw new Error(
        `Espacio en disco insuficiente (${freeGB.toFixed(1)} GB libre). ` +
        "Se necesita al menos 1 GB libre para descargar y ejecutar el juego."
      );
    }
  } catch (e) {
    // statfsSync puede no estar disponible en Node < 18.15; ignorar si falla
    if (e.message.includes("Espacio en disco")) throw e;
  }
}

// ─── VC++ REDISTRIBUTABLE AUTO-INSTALL ───────────────────────────────────────
/**
 * Verifica si Visual C++ Redistributable 2015-2022 x64 está instalado.
 * Si no, lo descarga en un directorio temporal y lo instala en silencio.
 * Se llama una vez por sesión antes de lanzar el juego.
 */
let _vcRedistChecked = false;
async function ensureVcRedist(sendStatus) {
  if (_vcRedistChecked) return;
  _vcRedistChecked = true;

  const isInstalled = () => {
    const keys = [
      "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64"
    ];
    for (const key of keys) {
      try {
        const out = execSync(`reg query "${key}" /v Installed`, { stdio: "pipe" }).toString();
        if (/0x1/i.test(out)) return true;
      } catch { /* key no existe */ }
    }
    return false;
  };

  if (isInstalled()) return;

  sendStatus("Instalando Visual C++ Redistributable (requerido por Minecraft)…");
  console.log("[vcredist] No detectado — descargando e instalando…");

  const tmpDir = path.join(app.getPath("temp"), "lucerion-launcher");
  fsExtra.ensureDirSync(tmpDir);
  const installerPath = path.join(tmpDir, "vc_redist.x64.exe");

  try {
    const url = "https://aka.ms/vs/17/release/vc_redist.x64.exe";
    const response = await axios.get(url, { responseType: "stream", timeout: 120000 });
    await new Promise((resolve, reject) => {
      const out = require("fs").createWriteStream(installerPath);
      response.data.pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
    });

    await new Promise((resolve, reject) => {
      execFile(installerPath, ["/install", "/quiet", "/norestart"], { timeout: 120000 }, (err, stdout, stderr) => {
        // Código 0 = éxito, 1638 = ya instalado, 3010 = requiere reinicio (igual válido)
        if (!err || [0, 1638, 3010].includes(err.code)) resolve();
        else reject(err);
      });
    });

    console.log("[vcredist] Instalación completada.");
    sendStatus("Visual C++ Redistributable instalado correctamente.");
  } catch (err) {
    console.warn("[vcredist] No se pudo instalar automáticamente:", err.message);
    sendStatus("⚠ No se pudo instalar Visual C++ Redistributable. Puede que Minecraft no inicie.");
  }
}

// ─── NATIVE DLL EXTRACTION (MC >= 1.19) ──────────────────────────────────────
/**
 * Pre-extrae DLLs nativas de LWJGL desde los JARs en libraries/.
 * Para MC >= 1.19, minecraft-launcher-core no extrae natives y solo apunta
 * -Djava.library.path al directorio raíz del juego (donde no hay DLLs).
 * LWJGL intenta auto-extraer desde classpath a un dir temporal, pero esto
 * falla en muchos sistemas (permisos, rutas largas, antivirus) causando
 * exit code 0xC0000135 (STATUS_DLL_NOT_FOUND).
 *
 * Esta función extrae proactivamente las DLLs a natives/<version>/ para
 * que -Djava.library.path y -Dorg.lwjgl.librarypath apunten correctamente.
 */
function extractNativesIfNeeded(gameDir, mcVersion) {
  const minor = parseInt(mcVersion.split(".")[1]);
  if (isNaN(minor) || minor < 19) return null;

  const nativesDir = path.join(gameDir, "natives", mcVersion);
  const librariesDir = path.join(gameDir, "libraries");

  if (!fs.existsSync(librariesDir)) return nativesDir; // Se creará tras la descarga de MCLC

  const nativeJars = [];
  const walk = (dir) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.includes("natives-windows") && entry.name.endsWith(".jar")) {
          nativeJars.push(full);
        }
      }
    } catch {}
  };
  walk(librariesDir);

  if (nativeJars.length === 0) return nativesDir;

  fsExtra.ensureDirSync(nativesDir);
  let extracted = 0;

  for (const jarPath of nativeJars) {
    try {
      const zip = new AdmZip(jarPath);
      for (const entry of zip.getEntries()) {
        if (!entry.isDirectory && entry.entryName.endsWith(".dll")) {
          const dllName = path.basename(entry.entryName);
          const destPath = path.join(nativesDir, dllName);
          if (!fs.existsSync(destPath)) {
            fs.writeFileSync(destPath, entry.getData());
            extracted++;
          }
        }
      }
    } catch (e) {
      console.warn("[natives] Error extrayendo:", path.basename(jarPath), e.message);
    }
  }

  if (extracted > 0) {
    console.log(`[natives] ${extracted} DLLs extraídas a: ${nativesDir}`);
  }
  return nativesDir;
}

// ─── LOADER INSTALLERS ───────────────────────────────────────────────────────

/**
 * axios.get con reintentos y backoff exponencial.
 * @param {string} url
 * @param {object} opts  opciones axios (timeout, etc.)
 * @param {number} retries  número de reintentos adicionales (default 2 → 3 intentos total)
 */
async function axiosGetWithRetry(url, opts = {}, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, opts);
    } catch (err) {
      lastErr = err;
      const isNetwork = ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET", "ECONNABORTED", "ECONNREFUSED"].includes(err.code || "")
        || (err.response && err.response.status >= 500);
      if (!isNetwork || attempt === retries) break;
      const delay = 3000 * (attempt + 1);
      console.warn(`[net] Intento ${attempt + 1} fallido (${err.code || err.message}). Reintentando en ${delay / 1000}s…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Descarga las librerías de un perfil Fabric/Quilt al directorio libraries/ */
async function downloadProfileLibraries(gameDir, profileJson) {
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profileJson, "utf8"));
  } catch { return; }
  const libs = profile.libraries;
  if (!Array.isArray(libs)) return;

  for (const lib of libs) {
    if (!lib.name || !lib.url) continue;                // solo librerías con URL custom
    const parts = lib.name.split(":");                   // group:artifact:version
    if (parts.length < 3) continue;
    const [group, artifact, version] = parts;
    const groupPath = group.replace(/\./g, "/");
    const jarName   = `${artifact}-${version}.jar`;
    const relPath   = path.join(groupPath, artifact, version, jarName);
    const destPath  = path.join(gameDir, "libraries", relPath);
    if (fs.existsSync(destPath)) continue;               // ya existe

    const jarUrl = lib.url.replace(/\/$/, "") + "/" + relPath.replace(/\\/g, "/");
    console.log(`[libs] Descargando ${lib.name} → ${destPath}`);
    try {
      const resp = await axios.get(jarUrl, { responseType: "arraybuffer", timeout: 30_000 });
      await fsExtra.ensureDir(path.dirname(destPath));
      fs.writeFileSync(destPath, Buffer.from(resp.data));
    } catch (err) {
      console.warn(`[libs] Error descargando ${lib.name}: ${err.message}`);
    }
  }
}

/** Instala Fabric desde meta.fabricmc.net */
async function installFabric(gameDir, mcVersion, loaderVersion) {
  const profileName = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const versionsDir = path.join(gameDir, "versions", profileName);
  const profileJson = path.join(versionsDir, `${profileName}.json`);
  if (fs.existsSync(profileJson)) {
    // Perfil ya existe — asegurar que las libs estén descargadas
    await downloadProfileLibraries(gameDir, profileJson);
    return profileName;
  }
  console.log(`[fabric] Descargando perfil: ${profileName}`);
  const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
  try {
    const { data } = await axiosGetWithRetry(url, { timeout: 30_000 });
    await fsExtra.ensureDir(versionsDir);
    fs.writeFileSync(profileJson, JSON.stringify(data, null, 2));
    await downloadProfileLibraries(gameDir, profileJson);
    return profileName;
  } catch (err) {
    const hint = (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT")
      ? " El servidor de Fabric (meta.fabricmc.net) no responde. Verifica tu conexión, desactiva el firewall/antivirus temporalmente o usa una VPN."
      : "";
    throw new Error(`No se pudo instalar Fabric Loader ${loaderVersion}: ${err.message}.${hint}`);
  }
}

/** Instala Quilt desde meta.quiltmc.org */
async function installQuilt(gameDir, mcVersion, loaderVersion) {
  const profileName = `quilt-loader-${loaderVersion}-${mcVersion}`;
  const versionsDir = path.join(gameDir, "versions", profileName);
  const profileJson = path.join(versionsDir, `${profileName}.json`);
  if (fs.existsSync(profileJson)) {
    await downloadProfileLibraries(gameDir, profileJson);
    return profileName;
  }
  console.log(`[quilt] Descargando perfil: ${profileName}`);
  const url = `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
  try {
    const { data } = await axiosGetWithRetry(url, { timeout: 30_000 });
    await fsExtra.ensureDir(versionsDir);
    fs.writeFileSync(profileJson, JSON.stringify(data, null, 2));
    await downloadProfileLibraries(gameDir, profileJson);
    return profileName;
  } catch (err) {
    const hint = (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT")
      ? " El servidor de Quilt (meta.quiltmc.org) no responde. Verifica tu conexión, desactiva el firewall/antivirus temporalmente o usa una VPN."
      : "";
    throw new Error(`No se pudo instalar Quilt Loader ${loaderVersion}: ${err.message}.${hint}`);
  }
}

/** Instala NeoForge — usa el JSON de versión ya instalado en versions/ (igual que Forge) */
async function installNeoForge(gameDir, mcVersion, loaderVersion) {
  // NeoForge se distribuye como <mcVersion>-neoforge-<loaderVersion>
  // minecraft-launcher-core lo trata como forge; el usuario debe haber corrido el installer
  // o puede usarse el campo customProfile para apuntar a un perfil ya instalado.
  const profileName = `${mcVersion}-neoforge-${loaderVersion}`;
  const versionsDir = path.join(gameDir, "versions", profileName);
  const profileJson = path.join(versionsDir, `${profileName}.json`);
  if (fs.existsSync(profileJson)) {
    console.log(`[neoforge] Perfil ya existe: ${profileName}`);
    return profileName;
  }
  throw new Error(
    `NeoForge ${loaderVersion} no está instalado en ${gameDir}. ` +
    `Ejecuta el installer de NeoForge primero y vuelve a lanzar.`
  );
}

/**
 * Resuelve el loader de un modpack y devuelve el customProfile para MCLC
 * o null para vanilla/forge (que MCLC resuelve con opts.forge).
 *
 * loaderType puede ser: "fabric" | "quilt" | "neoforge" | "forge" | "vanilla" | "custom"
 * Si loaderType es "custom", se usa directamente loaderVersion como nombre de perfil.
 */
async function resolveLoader(gameDir, modpack, statusCb = () => {}) {
  const loaderType = (modpack.loaderType || modpack.loader || "fabric").toLowerCase();
  const loaderVersion = modpack.loaderVersion || "";
  const mcVersion = modpack.minecraft || "1.20.1";

  switch (loaderType) {
    case "fabric": {
      statusCb("Verificando Fabric Loader…");
      const profile = await installFabric(gameDir, mcVersion, loaderVersion);
      return { customProfile: profile, forgeVersion: null };
    }
    case "quilt": {
      statusCb("Verificando Quilt Loader…");
      const profile = await installQuilt(gameDir, mcVersion, loaderVersion);
      return { customProfile: profile, forgeVersion: null };
    }
    case "neoforge": {
      statusCb("Verificando NeoForge…");
      const profile = await installNeoForge(gameDir, mcVersion, loaderVersion);
      return { customProfile: profile, forgeVersion: null };
    }
    case "forge": {
      statusCb("Verificando Forge…");
      // Check if forge profile is already installed in versions/
      const forgeProfileName = `${mcVersion}-forge-${loaderVersion}`;
      const forgeProfileJson = path.join(gameDir, "versions", forgeProfileName, `${forgeProfileName}.json`);
      if (fs.existsSync(forgeProfileJson)) {
        console.log(`[forge] Perfil ya instalado: ${forgeProfileName}`);
        return { customProfile: forgeProfileName, forgeVersion: null };
      }
      // Download forge installer jar so MCLC can install it
      const forgeInstallerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`;
      const installersDir = path.join(app.getPath("userData"), "forge-installers");
      await fsExtra.ensureDir(installersDir);
      const installerPath = path.join(installersDir, `forge-${mcVersion}-${loaderVersion}-installer.jar`);
      if (!fs.existsSync(installerPath)) {
        statusCb(`Descargando instalador Forge ${loaderVersion}…`);
        console.log(`[forge] Descargando instalador: ${forgeInstallerUrl}`);
        const resp = await axios.get(forgeInstallerUrl, { responseType: "arraybuffer", timeout: 120000 });
        fs.writeFileSync(installerPath, Buffer.from(resp.data));
      }
      return { customProfile: null, forgeVersion: installerPath };
    }
    case "custom": {
      // loaderVersion IS the full custom profile name already installed in versions/
      if (!loaderVersion) throw new Error("loaderType=custom pero no hay loaderVersion (nombre de perfil)");
      const profileJson = path.join(gameDir, "versions", loaderVersion, `${loaderVersion}.json`);
      if (!fs.existsSync(profileJson)) {
        throw new Error(`Perfil custom "${loaderVersion}" no encontrado en ${gameDir}/versions/`);
      }
      return { customProfile: loaderVersion, forgeVersion: null };
    }
    case "vanilla":
    default:
      return { customProfile: null, forgeVersion: null };
  }
}

// ─── VENTANA PRINCIPAL ────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");

  win = new BrowserWindow({
    width: 1040,
    height: 700,
    resizable: true,
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: "Lucerion Launcher",
    frame: false,
    transparent: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.once("ready-to-show", () => {
    win.show();
    emitLauncherUpdateStatus({});
  });
  win.loadFile("index.html");
  // win.webContents.openDevTools();
}

// ─── SINGLE-INSTANCE LOCK ─────────────────────────────────────────────────────
// La Store requiere que solo haya una instancia activa del launcher.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  createWindow();
  try {
    const { manifest } = await fetchManifest(getGameDir());
    await checkLauncherAutoUpdate(manifest);
  } catch (error) {
    emitLauncherUpdateStatus({ status: "error", error: error.message });
  }
  // Periodic re-check every 30 minutes
  setInterval(async () => {
    try {
      if (launcherUpdateState.status === "ready") return; // already downloaded
      const { manifest } = await fetchManifest(getGameDir());
      await checkLauncherAutoUpdate(manifest);
    } catch {}
  }, 30 * 60 * 1000);
});

app.on("before-quit", () => {
  if (launcherUpdateState.status === "ready" && launcherUpdateState.downloadedFile) {
    scheduleLauncherReplacementOnQuit(launcherUpdateState.downloadedFile);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── IPC: WINDOW CONTROLS ────────────────────────────────────────────────────
ipcMain.on("win-minimize", () => win && win.minimize());
ipcMain.on("win-maximize", () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on("win-close",    () => win && win.close());

// ─── IPC: SETTINGS ───────────────────────────────────────────────────────────
ipcMain.handle("get-settings", () => loadSettings());
ipcMain.handle("save-settings", (_e, settings) => {
  saveSettings(settings);
  return { ok: true };
});
ipcMain.handle("get-launcher-update-status", () => launcherUpdateState);

// Expone flags de la variante de build al renderer para ajustar la UI según canal
ipcMain.handle("get-app-flags", () => ({
  storeBuild: STORE_BUILD,
  appVersion: APP_VERSION
}));

ipcMain.handle("apply-launcher-update", () => {
  // Store: el launcher no es responsable de aplicar actualizaciones en esta variante
  if (STORE_BUILD) return { ok: false, reason: "store-managed" };
  if (launcherUpdateState.status === "ready" && launcherUpdateState.downloadedFile) {
    scheduleLauncherReplacementOnQuit(launcherUpdateState.downloadedFile);
    app.relaunch();
    app.quit();
  }
  return { ok: true };
});

// ─── IPC: GAME DIRECTORY ─────────────────────────────────────────────────────
ipcMain.handle("select-game-dir", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Selecciona la carpeta de instalación del modpack",
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: "Seleccionar carpeta"
  });
  if (canceled || !filePaths.length) return { cancelled: true };
  return { cancelled: false, path: filePaths[0] };
});

ipcMain.handle("open-game-dir", () => {
  const dir = getGameDir();
  fsExtra.ensureDirSync(dir);
  shell.openPath(dir);
  return { ok: true };
});

ipcMain.handle("open-modpack-dir", (_e, modpackId) => {
  const dir = getGameDir(modpackId);
  fsExtra.ensureDirSync(dir);
  shell.openPath(dir);
  return { ok: true, path: dir };
});

// ─── IPC: JAVA DETECTION ────────────────────────────────────────────────────
ipcMain.handle("check-java", () => {
  return detectJava();
});

// ─── IPC: JAVA INSTALL ──────────────────────────────────────────────────────
ipcMain.handle("install-java", async () => {
  try {
    const result = await installJava((pct, msg) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("java-install-progress", { percent: pct, message: msg });
      }
    });
    return result;
  } catch (err) {
    console.error("[main] Error instalando Java:", err.message);
    throw err;
  }
});

// ─── IPC: MODPACKS (list, access control) ────────────────────────────────────
ipcMain.handle("get-modpacks", async (_e, { accountUuid } = {}) => {
  try {
    const GAME_DIR = getGameDir();
    const { manifest } = await fetchManifest(GAME_DIR);
    if (!manifest) return { modpacks: [], error: "No se pudo obtener el manifest" };

    const modpacks = manifest.modpacks
      .filter(mp => mp.public !== false || canAccessModpack(mp, accountUuid))
      .map(mp => ({
        id: mp.id,
        name: mp.name,
        subtitle: mp.subtitle || "",
        description: mp.description || "",
        gallery: Array.isArray(mp.gallery) ? mp.gallery : [],
        image: mp.image || "",
        imageUrl: resolveModpackImageUrl(mp),
        public: mp.public !== false,
        version: mp.version,
        minecraft: mp.minecraft,
        loader: mp.loader,
        loaderType: mp.loaderType || mp.loader,
        loaderVersion: mp.loaderVersion,
        modCount: (mp.mods || []).length,
        optionalModCount: (mp.optionalMods || []).length,
        hasAccess: canAccessModpack(mp, accountUuid),
        allowUserMods: Boolean(mp.allowUserMods)
      }));
    return { modpacks };
  } catch (err) {
    console.warn("[main] Error obteniendo modpacks:", err.message);
    return { modpacks: [], error: err.message };
  }
});

// ─── IPC: OPTIONAL MODS ─────────────────────────────────────────────────────
ipcMain.handle("get-optional-mods", async (_e, { modpackId } = {}) => {
  try {
    const GAME_DIR = getGameDir();
    const { manifest } = await fetchManifest(GAME_DIR);

    const modpack = manifest
      ? (manifest.modpacks.find(mp => mp.id === modpackId) || manifest.modpacks[0])
      : null;

    const prefs = loadOptionalMods();
    const modpackPrefs = prefs[modpackId || (modpack && modpack.id) || "default"] || {};

    const manifestMods = modpack
      ? (modpack.optionalMods || []).map(m => ({
          id: m.id,
          name: m.name || m.id,
          description: m.description || "",
          category: m.category || "general",
          source: "manifest",
          defaultEnabled: m.defaultEnabled || false,
          enabled: modpackPrefs[m.id] !== undefined ? modpackPrefs[m.id] : (m.defaultEnabled || false)
        }))
      : [];

    // Store: user mods (JARs locales del usuario) desactivados — solo contenido oficial
    const userMods = STORE_BUILD ? [] : listUserMods(modpackId).map(m => ({
      ...m,
      defaultEnabled: false,
      enabled: modpackPrefs[m.id] !== undefined ? modpackPrefs[m.id] : false
    }));

    return { mods: [...manifestMods, ...userMods] };
  } catch (err) {
    console.warn("[main] Error obteniendo mods opcionales:", err.message);
    return { mods: [], error: err.message };
  }
});

ipcMain.handle("save-optional-mods", (_e, { modpackId, modId, enabled }) => {
  const prefs = loadOptionalMods();
  if (!prefs[modpackId]) prefs[modpackId] = {};
  prefs[modpackId][modId] = enabled;
  saveOptionalMods(prefs);
  return { ok: true };
});

ipcMain.handle("pick-and-upload-user-mod", async (_e, { modpackId } = {}) => {
  // Store: importación de mods locales desactivada — solo contenido oficial del modpack
  if (STORE_BUILD) {
    return {
      ok: false,
      reason: "not-available-in-store",
      message: "La importación de mods locales no está disponible en la versión de Microsoft Store."
    };
  }
  const result = await dialog.showOpenDialog(win, {
    title: "Seleccionar mod JAR",
    filters: [{ name: "Mod JAR", extensions: ["jar"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const srcPath = result.filePaths[0];
  const filename = path.basename(srcPath);
  const dir = getUserModsDir(modpackId);
  fsExtra.ensureDirSync(dir);
  const destPath = path.join(dir, filename);
  fs.copyFileSync(srcPath, destPath);
  const meta = readJarMeta(destPath);
  return {
    ok: true,
    mod: { id: "__user__" + filename, file: filename, source: "user",
           name: meta.name, description: meta.description,
           version: meta.version, category: "user",
           defaultEnabled: false, enabled: false }
  };
});

ipcMain.handle("delete-user-mod", (_e, { modpackId, file } = {}) => {
  // Store: gestión de user mods desactivada
  if (STORE_BUILD) return { ok: false, reason: "not-available-in-store" };
  const jarPath = path.join(getUserModsDir(modpackId), file);
  if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath);
  return { ok: true };
});

// ─── IPC: PATCH NOTES (from manifest) ────────────────────────────────────────
ipcMain.handle("get-patch-notes", async (_e, modpackId) => {
  try {
    const { manifest: norm } = await fetchManifest(getGameDir());
    if (!norm) {
      return { version: "", patchNotes: [], launcherVersion: APP_VERSION, launcherPatchNotes: [] };
    }
    const mp = (modpackId ? norm.modpacks.find(m => m.id === modpackId) : norm.modpacks[0]) || norm.modpacks[0];
    return {
      version: mp ? mp.version : "1.0.0",
      patchNotes: mp ? (mp.patchNotes || []) : [],
      launcherVersion: (norm.launcher && norm.launcher.version) || APP_VERSION,
      launcherPatchNotes: (norm.launcher && norm.launcher.patchNotes) || []
    };
  } catch (err) {
    const gameDir = getGameDir();
    const cached = path.join(gameDir, "manifest-cache.json");
    if (fs.existsSync(cached)) {
      try {
        const data = normalizeManifest(JSON.parse(fs.readFileSync(cached, "utf-8")));
        const mp = (modpackId ? data.modpacks.find(m => m.id === modpackId) : data.modpacks[0]) || data.modpacks[0];
        return {
          version: mp ? mp.version : "1.0.0",
          patchNotes: mp ? (mp.patchNotes || []) : [],
          launcherVersion: (data.launcher && data.launcher.version) || APP_VERSION,
          launcherPatchNotes: (data.launcher && data.launcher.patchNotes) || []
        };
      } catch (_) {}
    }
    return { version: "", patchNotes: [], launcherVersion: APP_VERSION, launcherPatchNotes: [], error: err.message };
  }
});

// ─── IPC: CHECK FOR UPDATES ─────────────────────────────────────────────────
ipcMain.handle("check-updates", async (_e, modpackId) => {
  try {
    const { manifest: norm } = await fetchManifest(getGameDir());
    if (!norm) {
      return { error: "No se pudo obtener el manifest", hasUpdate: false };
    }
    const mp = (modpackId ? norm.modpacks.find(m => m.id === modpackId) : norm.modpacks[0]) || norm.modpacks[0];
    const remoteVer = mp ? mp.version : "1.0.0";
    const versionKey = `modpack-version-${mp ? mp.id : "default"}.txt`;
    const localVersionFile = path.join(app.getPath("userData"), versionKey);
    let localVer = "";
    if (fs.existsSync(localVersionFile)) localVer = fs.readFileSync(localVersionFile, "utf-8").trim();
    const hasUpdate = localVer !== "" && localVer !== remoteVer;
    const isFirstRun = localVer === "";
    fs.writeFileSync(localVersionFile, remoteVer);
    return {
      currentVersion: localVer || remoteVer,
      remoteVersion: remoteVer,
      hasUpdate,
      isFirstRun,
      modCount: mp ? (mp.mods || []).length : 0
    };
  } catch (err) {
    console.warn("[update-check] Error:", err.message);
    return { error: err.message, hasUpdate: false };
  }
});

// ─── IPC: INSTANCE STATUS ────────────────────────────────────────────────────
ipcMain.handle("get-instance-status", () => {
  const result = {};
  for (const [id, inst] of runningInstances) {
    result[id] = { running: true, startTime: inst.startTime };
  }
  return result;
});

// ─── IPC: KILL INSTANCE ──────────────────────────────────────────────────────
ipcMain.handle("kill-instance", (_e, modpackId) => {
  const inst = runningInstances.get(modpackId);
  if (!inst) return { ok: false, error: "Instancia no encontrada" };
  try {
    const proc = inst.process;
    if (proc && !proc.killed) {
      if (process.platform === "win32" && proc.pid) {
        // taskkill /F /T mata el árbol completo de procesos (Java + hijos)
        try {
          execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true });
        } catch {
          proc.kill();
        }
      } else {
        proc.kill("SIGKILL");
      }
    }
    runningInstances.delete(modpackId);
    if (win && !win.isDestroyed()) {
      win.webContents.send("mc-closed", { code: null, modpackId });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── IPC: ACCOUNTS ───────────────────────────────────────────────────────────
ipcMain.handle("get-accounts", () => getAccountList());
ipcMain.handle("remove-account", (_e, uuid) => removeAccount(uuid));

ipcMain.handle("login-microsoft", async () => {
  try {
    const result = await loginMicrosoft();
    return result;
  } catch (err) {
    // Normalizar siempre a Error con message legible para evitar [object Object] en la UI
    const msg = err instanceof Error
      ? err.message
      : (typeof err === "string" ? err : JSON.stringify(err));
    console.error("[main] Login error:", msg, "\nDetalle completo:", err);
    throw new Error(msg);
  }
});

// ─── IPC: DESCARGAR MODPACK (sin login) ──────────────────────────────────────
ipcMain.handle("download-modpack", async (_e, { modpackId, enabledOptionalMods } = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Elige dónde guardar el modpack",
    properties: ["openDirectory"],
    buttonLabel: "Guardar aquí"
  });

  if (canceled || !filePaths.length) return { cancelled: true };

  const folderName = modpackId ? `cretania-${modpackId}` : "cretania-modpack";
  const destFolder = path.join(filePaths[0], folderName);

  const emitter = new EventEmitter();
  emitter.on("progress", (data) => {
    if (win && !win.isDestroyed()) win.webContents.send("progress", data);
  });

  await syncMods(destFolder, emitter, { modpackId, enabledOptionalMods: enabledOptionalMods || [] });
  return { cancelled: false, folder: destFolder };
});

// ─── IPC: SYNC MODS ONLY (sin login, sin lanzar) ───────────────────────────
ipcMain.handle("sync-mods-only", async (_e, { modpackId, enabledOptionalMods } = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Selecciona la carpeta de instalación del modpack",
    properties: ["openDirectory"],
    buttonLabel: "Seleccionar carpeta"
  });

  if (canceled || !filePaths.length) return { ok: false, cancelled: true };

  const GAME_DIR = path.join(filePaths[0], modpackId || "modpack");
  await fsExtra.ensureDir(GAME_DIR);

  const emitter = new EventEmitter();
  emitter.on("progress", (data) => {
    if (win && !win.isDestroyed()) win.webContents.send("progress", { ...data, modpackId });
  });

  const manifest = await syncMods(GAME_DIR, emitter, {
    modpackId,
    enabledOptionalMods: enabledOptionalMods || []
  });

  return { ok: true, folder: GAME_DIR, modCount: (manifest.mods || []).length };
});

// ─── IPC: LANZAR JUEGO ──────────────────────────────────────────────────────
ipcMain.handle("launch", async (_event, { authData, accountUuid, modpackId, enabledOptionalMods }) => {
  const requestedInstanceKey = modpackId || "default";
  if (pendingLaunches.has(requestedInstanceKey) || runningInstances.has(requestedInstanceKey)) {
    throw new Error("Ya hay un lanzamiento o una instancia activa para este modpack.");
  }

  pendingLaunches.add(requestedInstanceKey);

  try {
    const GAME_DIR = getGameDir(modpackId);

    // ── Validación pre-lanzamiento (ruta, permisos, disco) ──
    setStatus(win, "Verificando sistema…");
    await validatePreLaunch(GAME_DIR);

    const { manifest: manifestData } = await fetchManifest(GAME_DIR);
    const requestedModpack = manifestData
      ? (manifestData.modpacks.find((entry) => entry.id === modpackId) || manifestData.modpacks[0])
      : null;

    if (requestedModpack && !canAccessModpack(requestedModpack, accountUuid)) {
      throw new Error("Esta cuenta no tiene acceso a este modpack.");
    }

    let auth;
    if (authData) {
      auth = authData;
    } else if (accountUuid) {
      setStatus(win, "Refrescando sesión…");
      try {
        const account = await getAccountAuth(accountUuid);
        auth = account.mclc;
      } catch (authErr) {
        throw new Error(
          "Error al validar tu sesión: " + diagnoseNetworkError(authErr) +
          "\nIntenta cerrar sesión y volver a iniciarla."
        );
      }
    } else {
      throw new Error("Se requiere una cuenta Microsoft para jugar.");
    }

    setStatus(win, "Verificando Java…");
    let javaInfo = detectJava();
    if (!javaInfo.found) {
      console.log("[main] Java no encontrado, instalando automáticamente…");
      setStatus(win, "Java 21 no encontrado. Instalando automáticamente…");
      try {
        javaInfo = await installJava((pct, msg) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("java-install-progress", { percent: pct, message: msg });
          }
        });
      } catch (err) {
        throw new Error(
          "No se pudo instalar Java 21 automáticamente: " + err.message +
          "\nInstálalo manualmente desde https://adoptium.net/"
        );
      }
    }
    console.log(`[main] Java ${javaInfo.version} encontrado: ${javaInfo.path}`);

    const emitter = new EventEmitter();
    const instanceKey = modpackId || (requestedModpack ? requestedModpack.id : "default");
    emitter.on("progress", (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("progress", { ...data, modpackId: instanceKey });
      }
    });

    // Separate manifest optional mods from user-uploaded mods
    const allEnabled      = enabledOptionalMods || [];
    const manifestOptIds  = allEnabled.filter(id => !id.startsWith("__user__"));
    // Store: los user mods JAR no se procesan — solo contenido oficial del modpack
    const userModIds      = STORE_BUILD ? [] : allEnabled.filter(id => id.startsWith("__user__"));
    const userModsDir     = getUserModsDir(modpackId);
    const userModFiles    = userModIds
      .map(id => id.replace("__user__", ""))
      .filter(f => fs.existsSync(path.join(userModsDir, f)));

    let manifest;
    try {
      // Timeout global de 10 minutos para evitar que syncMods cuelgue la app
      const SYNC_TIMEOUT = 10 * 60 * 1000;
      manifest = await Promise.race([
        syncMods(GAME_DIR, emitter, {
          modpackId,
          enabledOptionalMods: manifestOptIds,
          userModFiles
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(
            "La sincronización de mods tardó demasiado (más de 10 minutos). " +
            "Verifica tu conexión a Internet e inténtalo de nuevo."
          )), SYNC_TIMEOUT)
        )
      ]);
    } catch (err) {
      const userMsg = diagnoseNetworkError(err);
      console.warn("[main] Error al actualizar mods:", err.message);
      if (win && !win.isDestroyed()) {
        win.webContents.send("progress", { phase: "done", current: 0, total: 0 });
        win.webContents.send("log", "[UPDATER] Error sincronizando mods: " + userMsg);
      }
      manifest = { minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
    }

    // Copy enabled user-uploaded JARs into the game mods folder
    for (const filename of userModFiles) {
      try {
        fs.copyFileSync(
          path.join(userModsDir, filename),
          path.join(GAME_DIR, "mods", filename)
        );
        console.log("[main] User mod copiado:", filename);
      } catch (e) {
        console.warn("[main] No se pudo copiar user mod:", filename, e.message);
      }
    }

    if (manifest._noManifest && win && !win.isDestroyed()) {
      win.webContents.send(
        "log",
        "[UPDATER] ⚠ No se pudo obtener la lista de mods. Los mods existentes se mantendrán pero no se verificará ni descargará nada nuevo."
      );
    }

    if (manifest._failedMods && manifest._failedMods.length > 0) {
      const failedNames = manifest._failedMods.map((entry) => entry.mod).join(", ");
      const failedPreview = manifest._failedMods.slice(0, 12).map((entry) => entry.mod).join(", ");
      const remainingFailed = manifest._failedMods.length - Math.min(manifest._failedMods.length, 12);
      const distinctErrors = [...new Set(manifest._failedMods.map((entry) => entry.error).filter(Boolean))];
      console.warn("[main] Mods que fallaron:", failedNames);
      if (win && !win.isDestroyed()) {
        win.webContents.send(
          "log",
          `[UPDATER] ⚠ ${manifest._failedMods.length} mod(s) no se pudieron descargar: ${failedPreview}${remainingFailed > 0 ? ` y ${remainingFailed} mas` : ""}`
        );
        if (distinctErrors.length > 0) {
          win.webContents.send(
            "log",
            `[UPDATER] Motivos detectados: ${distinctErrors.slice(0, 3).join(" | ")}`
          );
        }
        win.webContents.send(
          "log",
          "[UPDATER] Se reintentará en el próximo lanzamiento. El juego iniciará con los mods disponibles."
        );
        win.webContents.send("progress", {
          phase: "status",
          message: `⚠ ${manifest._failedMods.length} mod(s) fallaron. Se reintentará luego.`
        });
      }
    }

    await fsExtra.ensureDir(GAME_DIR);

    // ── Crear carpetas necesarias para shaderpacks y config ──
    await fsExtra.ensureDir(path.join(GAME_DIR, "shaderpacks"));
    await fsExtra.ensureDir(path.join(GAME_DIR, "config"));
    await fsExtra.ensureDir(path.join(GAME_DIR, "resourcepacks"));

    const settings = loadSettings();
    const mcVersion = manifest.minecraft || "1.20.1";

    let loaderResult = { customProfile: null, forgeVersion: null };
    try {
      loaderResult = await resolveLoader(GAME_DIR, manifest, (msg) => setStatus(win, msg));
    } catch (err) {
      console.error("[main] Error resolviendo loader:", err.message);
      throw new Error("No se pudo instalar el loader: " + err.message);
    }

    const launcher = new Client();

    // Patrones de spam conocidos — se loguean en consola interna pero no se muestran al usuario
    const LOG_SPAM_PATTERNS = [
      /Attempted to access MapManager before it was setup/,
    ];
    const isSpam = (msg) => LOG_SPAM_PATTERNS.some(p => p.test(msg));

    launcher.on("debug", (msg) => {
      console.log("[MC debug]", msg);
      if (win && !win.isDestroyed() && !isSpam(msg)) win.webContents.send("log", msg);
    });
    launcher.on("data", (msg) => {
      console.log("[MC data]", msg);
      if (win && !win.isDestroyed() && !isSpam(msg)) win.webContents.send("log", msg);
    });
    launcher.on("close", (code) => {
      console.log(`[MC:${instanceKey}] Cerrado con código:`, code);
      runningInstances.delete(instanceKey);

      let diagnostic = null;

      // 3221225781 = 0xC0000135 = STATUS_DLL_NOT_FOUND
      if (code === 3221225781 || code === -1073741515) {
        diagnostic = {
          id: "dll-not-found",
          title: "DLL no encontrada (0xC0000135)",
          message: "Una librería nativa no pudo cargarse. Posibles soluciones:\n" +
                   "1. Instala Visual C++ Redistributable x64 desde el enlace de abajo.\n" +
                   "2. Si ya lo tienes, elimina la carpeta 'natives' dentro del directorio de juego y vuelve a lanzar.\n" +
                   "3. Verifica que tu antivirus no esté bloqueando archivos DLL del launcher.",
          url: "https://aka.ms/vs/17/release/vc_redist.x64.exe"
        };
        console.warn(`[MC:${instanceKey}] Código 0xC0000135 — DLL no encontrada`);
      }

      // -805306369 = 0xCFFFFFFF — GPU driver timeout (TDR)
      if (!diagnostic && (code === -805306369 || code === 3489660927)) {
        diagnostic = {
          id: "gpu-tdr",
          title: "Timeout del driver gráfico (TDR)",
          message: "El driver de tu tarjeta gráfica dejó de responder. Soluciones:\n" +
                   "1. Actualiza los drivers de tu GPU (NVIDIA/AMD/Intel).\n" +
                   "2. Reduce la distancia de renderizado y gráficos en las opciones de Minecraft.\n" +
                   "3. Si usas shaders, desactívalos temporalmente.\n" +
                   "4. Cierra otras aplicaciones que usen la GPU (navegador, streaming, etc)."
        };
        console.warn(`[MC:${instanceKey}] GPU TDR timeout — código ${code}`);
      }

      // -1073740791 = 0xC0000409 — Stack buffer overrun (corrupción de memoria)
      if (!diagnostic && (code === -1073740791 || code === 3221226505)) {
        diagnostic = {
          id: "stack-overrun",
          title: "Error de memoria (0xC0000409)",
          message: "Minecraft cerró por un error de memoria. Posibles soluciones:\n" +
                   "1. Asigna más RAM al juego en Configuración (recomendado: 4-6 GB).\n" +
                   "2. Actualiza los drivers de tu tarjeta gráfica.\n" +
                   "3. Cierra programas pesados antes de jugar."
        };
        console.warn(`[MC:${instanceKey}] Stack buffer overrun — código ${code}`);
      }

      // -1073741819 = 0xC0000005 — Access violation
      if (!diagnostic && (code === -1073741819 || code === 3221225477)) {
        diagnostic = {
          id: "access-violation",
          title: "Violación de acceso (0xC0000005)",
          message: "Minecraft cerró por un error de acceso a memoria. Soluciones:\n" +
                   "1. Actualiza los drivers de tu tarjeta gráfica.\n" +
                   "2. Verifica que tu antivirus no esté interfiriendo con Minecraft.\n" +
                   "3. Intenta borrar la carpeta 'natives' del directorio del juego y vuelve a lanzar."
        };
        console.warn(`[MC:${instanceKey}] Access violation — código ${code}`);
      }

      // Exit code 1 con crash en código nativo — buscar hs_err_pid*.log
      if (code === 1 && !diagnostic) {
        try {
          const crashDir = GAME_DIR;
          const crashFiles = fs.readdirSync(crashDir)
            .filter(f => f.startsWith("hs_err_pid") && f.endsWith(".log"))
            .map(f => ({ name: f, time: fs.statSync(path.join(crashDir, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
          if (crashFiles.length > 0) {
            const latestCrash = path.join(crashDir, crashFiles[0].name);
            const crashContent = fs.readFileSync(latestCrash, "utf8").substring(0, 4000);
            const isNativeCrash = crashContent.includes("outside the Java Virtual Machine in native code");
            const problematicFrame = crashContent.match(/# Problematic frame:\n# (.+)/);
            const frameName = problematicFrame ? problematicFrame[1].trim() : "";
            const isGpuCrash = /ig\d+icd|nvoglv|atio|amdxx|opengl|lwjgl.*opengl|gl\.dll/i.test(frameName + crashContent.substring(0, 2000));

            if (isNativeCrash || isGpuCrash) {
              diagnostic = {
                id: "jvm-native-crash",
                title: "Crash en código nativo (drivers gráficos)",
                message: "La JVM crasheó en una librería nativa" +
                         (frameName ? ` (${frameName})` : "") + ".\n" +
                         "Esto suele ser un problema de drivers de GPU. Soluciones:\n" +
                         "1. Actualiza los drivers de tu tarjeta gráfica (NVIDIA/AMD/Intel).\n" +
                         "2. Si usas un portátil con GPU integrada, asegúrate de que Minecraft use la GPU dedicada.\n" +
                         "3. Prueba añadir el argumento JVM: -Dorg.lwjgl.opengl.explicitInit=true",
                crashLog: latestCrash
              };
              console.warn(`[MC:${instanceKey}] JVM native crash — ${frameName || "ver " + crashFiles[0].name}`);
            }
          }
        } catch (e) {
          console.warn("[main] Error buscando crash logs:", e.message);
        }
      }

      // Exit code -1 suele ser OutOfMemoryError
      if (code === -1 && !diagnostic) {
        diagnostic = {
          id: "oom-likely",
          title: "Posible falta de memoria (OutOfMemory)",
          message: "Minecraft cerró inesperadamente (código -1). Esto suele indicar falta de RAM.\n" +
                   "Soluciones:\n" +
                   "1. Aumenta la RAM asignada en Configuración (recomendado: 4-6 GB).\n" +
                   "2. Cierra navegadores y otras aplicaciones pesadas antes de jugar.\n" +
                   "3. Si el problema persiste, revisa los logs en la carpeta del juego."
        };
        console.warn(`[MC:${instanceKey}] Exit code -1 — posible OOM`);
      }

      // Crash genérico con código no-cero y sin diagnóstico específico + crash-reports/
      if (code !== 0 && code !== null && !diagnostic) {
        try {
          const crashReportsDir = path.join(GAME_DIR, "crash-reports");
          if (fs.existsSync(crashReportsDir)) {
            const reports = fs.readdirSync(crashReportsDir)
              .filter(f => f.endsWith(".txt"))
              .map(f => ({ name: f, time: fs.statSync(path.join(crashReportsDir, f)).mtimeMs }))
              .sort((a, b) => b.time - a.time);
            // Solo considerar reportes recientes (últimos 60 segundos)
            if (reports.length > 0 && (Date.now() - reports[0].time) < 60_000) {
              const reportPath = path.join(crashReportsDir, reports[0].name);
              const reportContent = fs.readFileSync(reportPath, "utf8").substring(0, 2000);
              const descMatch = reportContent.match(/Description: (.+)/);
              const desc = descMatch ? descMatch[1].trim() : "";
              diagnostic = {
                id: "mc-crash-report",
                title: "Minecraft generó un crash report",
                message: (desc ? `Causa: ${desc}\n` : "") +
                         "Revisa el archivo de crash para más detalles.",
                crashLog: reportPath
              };
              console.warn(`[MC:${instanceKey}] Crash report encontrado: ${reports[0].name}`);
            }
          }
        } catch (e) {
          console.warn("[main] Error buscando crash-reports:", e.message);
        }
      }

      if (win && !win.isDestroyed()) win.webContents.send("mc-closed", { code, modpackId: instanceKey, diagnostic });
    });

    // Asegurar que siempre usamos javaw (sin consola) si está disponible
    const resolvedJava = javaInfo.path !== "java" ? preferJavaw(javaInfo.path) : "javaw";

    const launchOpts = {
      authorization: auth,
      root: GAME_DIR,
      javaPath: resolvedJava,
      version: {
        number: mcVersion,
        type: "release"
      },
      memory: {
        max: (requestedModpack && requestedModpack.ramMax ? requestedModpack.ramMax : settings.ramMax) + "G",
        min: (requestedModpack && requestedModpack.ramMin ? requestedModpack.ramMin : settings.ramMin) + "G"
      },
      window: {
        width: settings.width || 1280,
        height: settings.height || 720
      },
      overrides: {
        gameDirectory: GAME_DIR
      }
    };

    // Aplicar jvmArgs personalizados del modpack (ej: para Lite 4GB)
    if (requestedModpack && requestedModpack.jvmArgs) {
      const extraArgs = String(requestedModpack.jvmArgs).trim().split(/\s+/).filter(Boolean);
      launchOpts.customArgs = extraArgs;
      console.log("[main] jvmArgs del modpack aplicados:", String(requestedModpack.jvmArgs).substring(0, 80));
    }

    // ── Pre-extraer natives para MC >= 1.19 ──
    // MCLC no extrae natives para >= 1.19 y apunta -Djava.library.path al root del juego.
    // Esto causa 0xC0000135 cuando LWJGL no logra auto-extraer DLLs al dir temporal.
    const nativesDir = extractNativesIfNeeded(GAME_DIR, mcVersion);
    if (nativesDir) {
      launchOpts.customArgs = (launchOpts.customArgs || []).concat([
        `-Dorg.lwjgl.librarypath=${nativesDir}`,
        `-Djava.library.path=${nativesDir}`
      ]);
      console.log("[main] Natives path configurado:", nativesDir);
    }

    if (loaderResult.customProfile) {
      launchOpts.version.custom = loaderResult.customProfile;
    } else if (loaderResult.forgeVersion) {
      // forgeVersion is a path to the installer JAR; pass it directly to MCLC
      launchOpts.forge = loaderResult.forgeVersion;
    }

    const loaderType = (manifest.loaderType || manifest.loader || "fabric").toLowerCase();
    console.log("[main] Lanzando MC:", JSON.stringify({
      instance: instanceKey,
      version: mcVersion,
      loader: loaderType,
      profile: loaderResult.customProfile || "(vanilla/forge)",
      ram: `${settings.ramMin}-${settings.ramMax}G`
    }));

    await ensureVcRedist((msg) => {
      if (win && !win.isDestroyed()) win.webContents.send("progress", { phase: "status", message: msg });
    });

    const mcProcess = await launcher.launch(launchOpts);
    runningInstances.set(instanceKey, { launcher, process: mcProcess, startTime: Date.now() });
    return { ok: true, modpackId: instanceKey };
  } finally {
    pendingLaunches.delete(requestedInstanceKey);
  }
});

/** Helper para enviar estado a la ventana */
function setStatus(window, msg) {
  if (window && !window.isDestroyed()) {
    window.webContents.send("progress", { phase: "status", message: msg });
  }
}
