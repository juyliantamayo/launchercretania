/**
 * auth.js — Autenticación Microsoft con multicuenta
 * Compatible con msmc v5 — usa OAuth manual para compatibilidad con builds empaquetados
 */

const { Auth } = require("msmc");
const { BrowserWindow } = require("electron");
const fs = require("fs-extra");
const path = require("path");

// Archivo donde se guardan las cuentas (tokens)
const ACCOUNTS_FILE = path.join(
  require("electron").app
    ? require("electron").app.getPath("userData")
    : __dirname,
  "accounts.json"
);

/** Lee las cuentas guardadas */
function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("[auth] Error leyendo cuentas:", e.message);
  }
  return [];
}

/** Guarda las cuentas */
function saveAccounts(accounts) {
  fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

/**
 * Login con cuenta Microsoft (premium).
 * Abre manualmente una BrowserWindow para OAuth (compatible con builds empaquetados).
 * @returns {object} { mclc, profile: { name, uuid } }
 */
async function loginMicrosoft() {
  const authManager = new Auth("select_account");

  // Timeout de 120s
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Tiempo de espera agotado. Inténtalo de nuevo.")), 120_000)
  );

  const login = (async () => {
    // Crear el link OAuth manualmente
    const redirect = authManager.createLink();

    // Abrir ventana OAuth manualmente (no depende de msmc dynamic imports)
    const authCode = await new Promise((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 650,
        resizable: false,
        title: "Iniciar sesión — Microsoft",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      authWindow.setMenu(null);
      authWindow.loadURL(redirect);

      let resolved = false;

      authWindow.on("close", () => {
        if (!resolved) {
          reject(new Error("Ventana cerrada sin completar login."));
        }
      });

      authWindow.webContents.on("did-finish-load", () => {
        const loc = authWindow.webContents.getURL();
        if (loc.startsWith(authManager.token.redirect)) {
          const urlParams = new URLSearchParams(loc.substring(loc.indexOf("?") + 1));
          const code = urlParams.get("code");
          if (code) {
            resolved = true;
            resolve(code);
            try { authWindow.close(); } catch {}
          }
        }
      });

      // También capturar redirects sin full load
      authWindow.webContents.on("will-redirect", (_event, url) => {
        if (url.startsWith(authManager.token.redirect)) {
          const urlParams = new URLSearchParams(url.substring(url.indexOf("?") + 1));
          const code = urlParams.get("code");
          if (code) {
            resolved = true;
            resolve(code);
            try { authWindow.close(); } catch {}
          }
        }
      });
    });

    // Pasar el code a msmc para obtener el token de Minecraft
    const xboxManager = await authManager.login(authCode);
    const token = await xboxManager.getMinecraft();
    return { token, xboxManager };
  })();

  const { token, xboxManager } = await Promise.race([login, timeout]);

  const mclcAuth = token.mclc();
  const profile = {
    name: token.profile.name,
    uuid: token.profile.id
  };

  console.log("[auth] Sesión premium OK:", profile.name);

  // Guardar cuenta en la lista — incluir datos msmc para poder refrescar el token
  let msmcData = null;
  try {
    msmcData = xboxManager.save();
  } catch (e) {
    console.warn("[auth] No se pudo guardar datos msmc para refresh:", e.message);
  }

  addAccount(profile, mclcAuth, false, msmcData);

  return { mclc: mclcAuth, profile };
}

/**
 * Añade o actualiza una cuenta en el almacenamiento local
 */
function addAccount(profile, mclcAuth, offline = false, msmcData = null) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.uuid === profile.uuid);

  const entry = {
    uuid: profile.uuid,
    name: profile.name,
    mclc: mclcAuth,
    msmcData: msmcData || (idx >= 0 ? accounts[idx].msmcData : null),
    offline: offline,
    lastUsed: Date.now()
  };

  if (idx >= 0) {
    accounts[idx] = entry;
  } else {
    accounts.push(entry);
  }

  saveAccounts(accounts);
}

/**
 * Elimina una cuenta guardada
 */
function removeAccount(uuid) {
  const accounts = loadAccounts().filter((a) => a.uuid !== uuid);
  saveAccounts(accounts);
  return accounts;
}

/**
 * Obtiene la lista de cuentas guardadas (sin tokens sensibles para la UI)
 */
function getAccountList() {
  return loadAccounts().map((a) => ({
    uuid: a.uuid,
    name: a.name,
    offline: a.offline || false,
    lastUsed: a.lastUsed
  }));
}

/**
 * Obtiene los datos mclc de una cuenta guardada para relanzar.
 * Intenta refrescar el token automáticamente si hay datos msmc guardados.
 */
async function getAccountAuth(uuid) {
  const accounts = loadAccounts();
  const account = accounts.find((a) => a.uuid === uuid);
  if (!account) throw new Error("Cuenta no encontrada");

  // Intentar refrescar el token con datos msmc guardados
  if (account.msmcData) {
    try {
      console.log("[auth] Refrescando token para:", account.name);
      const authManager = new Auth("select_account");
      const xboxManager = await authManager.refresh(account.msmcData);
      const token = await xboxManager.getMinecraft();
      const freshMclc = token.mclc();

      // Guardar datos actualizados
      let newMsmcData = null;
      try { newMsmcData = xboxManager.save(); } catch {}

      account.mclc = freshMclc;
      account.msmcData = newMsmcData || account.msmcData;
      account.lastUsed = Date.now();
      saveAccounts(accounts);

      console.log("[auth] Token refrescado OK para:", account.name);
      return { mclc: freshMclc, profile: { name: account.name, uuid: account.uuid } };
    } catch (err) {
      console.warn("[auth] No se pudo refrescar token:", err.message);
      // Usar token guardado como fallback
    }
  }

  // Usar token cacheado
  console.log("[auth] Usando token cacheado para:", account.name);
  account.lastUsed = Date.now();
  saveAccounts(accounts);

  return { mclc: account.mclc, profile: { name: account.name, uuid: account.uuid } };
}

module.exports = {
  loginMicrosoft,
  getAccountList,
  getAccountAuth,
  removeAccount,
  loadAccounts
};
