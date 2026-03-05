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

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { Client } = require("minecraft-launcher-core");
const { loginMicrosoft, getAccountList, getAccountAuth, removeAccount } = require("./auth");
const { syncMods } = require("./updater");
const path = require("path");
const fs = require("fs");
const fsExtra = require("fs-extra");
const axios = require("axios");
const EventEmitter = require("events");

const GAME_DIR = path.join(app.getPath("appData"), ".cretania-minecraft");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

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
  return { ramMin: 2, ramMax: 4, width: 1280, height: 720 };
}

function saveSettings(settings) {
  fsExtra.ensureDirSync(path.dirname(SETTINGS_FILE));
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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
  const iconPath = path.join(__dirname, "assets", "icon.ico");

  win = new BrowserWindow({
    width: 820,
    height: 600,
    resizable: false,
    title: "Cretania Launcher",
    frame: false,
    transparent: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

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
  // 1. Auth — por token fresco o cuenta guardada
  let auth;
  if (authData) {
    auth = authData;
  } else if (accountUuid) {
    const account = getAccountAuth(accountUuid);
    auth = account.mclc;
  } else {
    throw new Error("Se requiere autenticación con cuenta Microsoft.");
  }

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
    }
    manifest = { minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
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
      if (win && !win.isDestroyed()) {
        win.webContents.send("progress", { phase: "check", current: 0, total: 0 });
      }
      setStatus(win, "Verificando Fabric Loader…");
      fabricProfileName = await installFabric(GAME_DIR, mcVersion, loaderVersion);
    } catch (err) {
      console.error("[main] Error instalando Fabric:", err.message);
      if (win && !win.isDestroyed()) {
        win.webContents.send("progress", { phase: "done", current: 0, total: 0 });
      }
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
