/**
 * auth.js — Autenticación Microsoft con multicuenta
 * Compatible con msmc v5
 */

const { Auth } = require("msmc");
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
 * Abre ventana de Microsoft OAuth en Electron con timeout.
 * @returns {object} { mclc, profile: { name, uuid } }
 */
async function loginMicrosoft() {
  const authManager = new Auth("select_account");

  // Timeout de 120s para evitar que se quede colgado
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Tiempo de espera agotado. Inténtalo de nuevo.")), 120_000)
  );

  const login = (async () => {
    const xboxManager = await authManager.launch("electron");
    const token = await xboxManager.getMinecraft();
    return token;
  })();

  const token = await Promise.race([login, timeout]);

  const mclcAuth = token.mclc();
  const profile = {
    name: token.profile.name,
    uuid: token.profile.id
  };

  console.log("[auth] Sesión premium OK:", profile.name);

  // Guardar cuenta en la lista
  addAccount(profile, mclcAuth);

  return { mclc: mclcAuth, profile };
}

/**
 * Añade o actualiza una cuenta en el almacenamiento local
 */
function addAccount(profile, mclcAuth) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.uuid === profile.uuid);

  const entry = {
    uuid: profile.uuid,
    name: profile.name,
    mclc: mclcAuth,
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
    lastUsed: a.lastUsed
  }));
}

/**
 * Obtiene los datos mclc de una cuenta guardada para relanzar
 */
function getAccountAuth(uuid) {
  const accounts = loadAccounts();
  const account = accounts.find((a) => a.uuid === uuid);
  if (!account) throw new Error("Cuenta no encontrada");

  // Actualizar lastUsed
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
