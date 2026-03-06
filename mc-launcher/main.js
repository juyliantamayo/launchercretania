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
const { syncMods } = require("./updater");
const path = require("path");
const fs = require("fs");
const fsExtra = require("fs-extra");
const axios = require("axios");
const EventEmitter = require("events");
const { execSync, execFile } = require("child_process");

const DEFAULT_GAME_DIR = path.join(app.getPath("appData"), ".cretania-minecraft");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const MANIFEST_CHECK_URL = "https://github.com/juyliantamayo/launchercretania/releases/download/modpack-v1.0.0/manifest.json";

// Adoptium JDK 17 para Windows x64 (portable zip)
const JAVA_VERSION = "21";
const JAVA_DOWNLOAD_URL = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk";
const JAVA_INSTALL_DIR_NAME = "java-runtime";

process.on("uncaughtException", (err) => {
  console.error("[main] Error no capturado:", err);
});

let win;

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
  fsExtra.ensureDirSync(path.dirname(SETTINGS_FILE));
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

/** Obtiene el directorio de juego efectivo */
function getGameDir() {
  const settings = loadSettings();
  return (settings.gameDir && settings.gameDir.trim()) ? settings.gameDir.trim() : DEFAULT_GAME_DIR;
}

// ─── JAVA DETECTION ───────────────────────────────────────────────────────────
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

  // Intentar java del PATH
  const fromPath = tryJava("java");
  if (fromPath) return fromPath;

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
            const javaBin = path.join(dir, e, "bin", "java.exe");
            if (fs.existsSync(javaBin)) javaDirs.push(javaBin);
          }
        } catch {}
      }
    }
  }

  // Buscar también en el Minecraft runtime
  const mcRuntimeDir = path.join(getGameDir(), "runtime");
  if (fs.existsSync(mcRuntimeDir)) {
    try {
      const walkRuntime = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const full = path.join(dir, item.name);
          if (item.isFile() && item.name === "java.exe") javaDirs.push(full);
          else if (item.isDirectory()) walkRuntime(full);
        }
      };
      walkRuntime(mcRuntimeDir);
    } catch {}
  }

  for (const jp of javaDirs) {
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
 * @returns {object} { found: true, version: 17, path: "...java.exe" }
 */
async function installJava(onProgress = () => {}) {
  const javaBaseDir = path.join(app.getPath("userData"), JAVA_INSTALL_DIR_NAME);
  const zipPath = path.join(app.getPath("temp"), "adoptium-jdk17.zip");

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
    throw new Error("Error al extraer Java: " + err.message);
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

/** Busca java.exe recursivamente dentro de un directorio */
function findJavaExeIn(baseDir) {
  try {
    const items = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(baseDir, item.name);
      if (item.isDirectory()) {
        // Buscar en bin/java.exe directamente
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

// ─── FABRIC INSTALLER ─────────────────────────────────────────────────────────
/**
 * Descarga e instala el perfil JSON de Fabric Loader desde la API oficial.
 * Solo descarga si el archivo no existe ya.
 *
 * @param {string} gameDir   — ruta raíz de .minecraft
 * @param {string} mcVersion — ej. "1.20.1"
 * @param {string} loaderVersion — ej. "0.18.4"
 * @returns {string} nombre del perfil custom para MCLC, ej "fabric-loader-0.18.4-1.20.1"
 */
async function installFabric(gameDir, mcVersion, loaderVersion) {
  const profileName = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const versionsDir = path.join(gameDir, "versions", profileName);
  const profileJson = path.join(versionsDir, `${profileName}.json`);

  if (fs.existsSync(profileJson)) {
    console.log(`[fabric] Perfil ya existe: ${profileName}`);
    return profileName;
  }

  console.log(`[fabric] Descargando perfil: ${profileName}`);
  const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;

  try {
    const { data } = await axios.get(url, { timeout: 30_000 });
    await fsExtra.ensureDir(versionsDir);
    fs.writeFileSync(profileJson, JSON.stringify(data, null, 2));
    console.log(`[fabric] Perfil instalado: ${profileJson}`);
    return profileName;
  } catch (err) {
    console.error(`[fabric] Error descargando perfil:`, err.message);
    throw new Error(`No se pudo instalar Fabric Loader ${loaderVersion}: ${err.message}`);
  }
}

// ─── VENTANA PRINCIPAL ────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");

  win = new BrowserWindow({
    width: 920,
    height: 780,
    resizable: true,
    minWidth: 750,
    minHeight: 600,
    show: false,
    title: "Cretania Launcher",
    frame: false,
    transparent: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile("index.html");
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── IPC: WINDOW CONTROLS ────────────────────────────────────────────────────
ipcMain.on("win-minimize", () => win && win.minimize());
ipcMain.on("win-close", () => win && win.close());

// ─── IPC: SETTINGS ───────────────────────────────────────────────────────────
ipcMain.handle("get-settings", () => loadSettings());
ipcMain.handle("save-settings", (_e, settings) => {
  saveSettings(settings);
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

// ─── IPC: CHECK FOR UPDATES ─────────────────────────────────────────────────
ipcMain.handle("check-updates", async () => {
  try {
    const { data } = await axios.get(MANIFEST_CHECK_URL, { timeout: 10_000 });
    const localVersionFile = path.join(app.getPath("userData"), "modpack-version.txt");
    let localVer = "";
    if (fs.existsSync(localVersionFile)) {
      localVer = fs.readFileSync(localVersionFile, "utf-8").trim();
    }
    const remoteVer = data.version || "1.0.0";
    const hasUpdate = localVer !== "" && localVer !== remoteVer;
    const isFirstRun = localVer === "";

    // Guardar versión conocida
    fs.writeFileSync(localVersionFile, remoteVer);

    return {
      currentVersion: localVer || remoteVer,
      remoteVersion: remoteVer,
      hasUpdate,
      isFirstRun,
      modCount: data.mods ? data.mods.length : 0
    };
  } catch (err) {
    console.warn("[update-check] Error:", err.message);
    return { error: err.message, hasUpdate: false };
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
    console.error("[main] Login error:", err.message);
    throw err;
  }
});

// ─── IPC: DESCARGAR MODPACK (sin login) ──────────────────────────────────────
ipcMain.handle("download-modpack", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Elige dónde guardar el modpack",
    properties: ["openDirectory"],
    buttonLabel: "Guardar aquí"
  });

  if (canceled || !filePaths.length) return { cancelled: true };

  const destFolder = path.join(filePaths[0], "cretania-modpack");

  const emitter = new EventEmitter();
  emitter.on("progress", (data) => {
    if (win && !win.isDestroyed()) win.webContents.send("progress", data);
  });

  await syncMods(destFolder, emitter);
  return { cancelled: false, folder: destFolder };
});

// ─── IPC: LANZAR JUEGO ──────────────────────────────────────────────────────
ipcMain.handle("launch", async (_event, { authData, accountUuid }) => {
  // 0. Obtener directorio de juego
  const GAME_DIR = getGameDir();

  // 1. Auth — por token fresco o cuenta guardada
  let auth;
  if (authData) {
    auth = authData;
  } else if (accountUuid) {
    setStatus(win, "Refrescando sesión…");
    const account = await getAccountAuth(accountUuid);
    auth = account.mclc;
  } else {
    throw new Error("Se requiere una cuenta Microsoft para jugar.");
  }

  // 1.5 Detectar Java 21+ — si no existe, instalarlo automáticamente
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

  // 2. Sync mods
  const emitter = new EventEmitter();
  emitter.on("progress", (data) => {
    if (win && !win.isDestroyed()) win.webContents.send("progress", data);
  });

  let manifest;
  try {
    manifest = await syncMods(GAME_DIR, emitter);
  } catch (err) {
    console.warn("[main] Error al actualizar mods:", err.message);
    if (win && !win.isDestroyed()) {
      win.webContents.send("progress", { phase: "done", current: 0, total: 0 });
      win.webContents.send("log", "[UPDATER] Error sincronizando mods: " + err.message);
    }
    // Use default manifest so the game can still launch with whatever mods are on disk
    manifest = { minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
  }

  // Report if manifest was unavailable
  if (manifest._noManifest) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("log",
        "[UPDATER] ⚠ No se pudo obtener la lista de mods. Los mods existentes se mantendrán pero no se verificará ni descargará nada nuevo.");
    }
  }

  // Report failed mods to user (syncMods now continues past individual failures)
  if (manifest._failedMods && manifest._failedMods.length > 0) {
    const failedNames = manifest._failedMods.map(f => f.mod).join(", ");
    console.warn("[main] Mods que fallaron:", failedNames);
    if (win && !win.isDestroyed()) {
      win.webContents.send("log",
        `[UPDATER] ⚠ ${manifest._failedMods.length} mod(s) no se pudieron descargar: ${failedNames}`);
      win.webContents.send("log",
        "[UPDATER] Se reintentará en el próximo lanzamiento. El juego iniciará con los mods disponibles.");
      win.webContents.send("progress", {
        phase: "status",
        message: `⚠ ${manifest._failedMods.length} mod(s) fallaron. Se reintentará luego.`
      });
    }
  }

  // 3. Crear directorio
  await fsExtra.ensureDir(GAME_DIR);

  // 4. Leer settings de RAM
  const settings = loadSettings();

  // 5. Instalar Fabric Loader si es necesario
  const mcVersion = manifest.minecraft || "1.20.1";
  const loaderVersion = manifest.loaderVersion || "0.18.4";
  let fabricProfileName = null;

  if (manifest.loader === "fabric" && loaderVersion) {
    try {
      setStatus(win, "Verificando Fabric Loader…");
      fabricProfileName = await installFabric(GAME_DIR, mcVersion, loaderVersion);
    } catch (err) {
      console.error("[main] Error instalando Fabric:", err.message);
      throw new Error("No se pudo instalar Fabric Loader: " + err.message);
    }
  }

  // 6. Lanzar Minecraft
  const launcher = new Client();

  launcher.on("debug", (msg) => {
    console.log("[MC debug]", msg);
    if (win && !win.isDestroyed()) win.webContents.send("log", msg);
  });
  launcher.on("data", (msg) => {
    console.log("[MC data]", msg);
    if (win && !win.isDestroyed()) win.webContents.send("log", msg);
  });
  launcher.on("close", (code) => {
    console.log("[MC] Cerrado con código:", code);
    if (win && !win.isDestroyed()) win.webContents.send("mc-closed", code);
  });

  const launchOpts = {
    authorization: auth,
    root: GAME_DIR,
    javaPath: javaInfo.path !== "java" ? javaInfo.path : undefined,
    version: {
      number: mcVersion,
      type: "release"
    },
    memory: {
      max: settings.ramMax + "G",
      min: settings.ramMin + "G"
    },
    window: {
      width: settings.width || 1280,
      height: settings.height || 720
    },
    overrides: {
      gameDirectory: GAME_DIR
    }
  };

  // Fabric: usar version.custom con el perfil instalado
  if (fabricProfileName) {
    launchOpts.version.custom = fabricProfileName;
  } else if (manifest.loader === "forge" && manifest.loaderVersion) {
    launchOpts.forge = manifest.loaderVersion;
  }

  console.log("[main] Lanzando MC:", JSON.stringify({
    version: launchOpts.version.number,
    custom: launchOpts.version.custom || "(vanilla)",
    ram: `${settings.ramMin}-${settings.ramMax}G`,
    loader: manifest.loader,
    loaderVersion: loaderVersion
  }));

  launcher.launch(launchOpts);
  return { ok: true };
});

/** Helper para enviar estado a la ventana */
function setStatus(window, msg) {
  if (window && !window.isDestroyed()) {
    window.webContents.send("progress", { phase: "status", message: msg });
  }
}
