/**
 * auth.js — Autenticación Microsoft con multicuenta
 * Compatible con msmc v5 — usa OAuth manual para compatibilidad con builds empaquetados
 *
 * Estrategias de login:
 *   loginMicrosoftStandalone() — build directa / portable
 *   loginMicrosoftStore()      — variante Microsoft Store (misma base; separada para evolucionar)
 *   loginMicrosoft()           — selector; elige estrategia según STORE_BUILD
 *
 * Por qué separar las estrategias:
 *   Si Microsoft Store vuelve a rechazar el flujo OAuth window-based, la estrategia Store
 *   puede adaptarse (p.ej. MSAL/WinRT, protocolo ms-xboxlive) sin tocar standalone.
 *   El acoplamiento a una única implementación rígida fue un riesgo real de regresión.
 */

const { Auth } = require("msmc");
const { BrowserWindow } = require("electron");
const fs = require("fs-extra");
const path = require("path");

// Detectar variante de build (si storeBuild:true fue inyectado via extraMetadata)
const STORE_BUILD = !!(require("./package.json").storeBuild);

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
 * Login con cuenta Microsoft — VARIANTE STANDALONE.
 * Abre manualmente una BrowserWindow para OAuth (compatible con builds empaquetados).
 *
 * Logs detallados en cada etapa del flujo para facilitar diagnóstico:
 *   - Creación del link OAuth
 *   - Apertura de ventana
 *   - Cada redirect/navegación observada
 *   - URL final capturada
 *   - Timeout, cierre prematuro o error de proveedor
 *   - Llamadas a authManager.login() y xboxManager.getMinecraft()
 *
 * Errores diferenciados:
 *   - Ventana cerrada por el usuario
 *   - Timeout de 120s
 *   - Redirect inválido / sin código (error del proveedor OAuth)
 *   - Error de red en authManager.login()
 *   - Error de red/perfil en getMinecraft()
 *
 * @returns {{ mclc: object, profile: { name: string, uuid: string } }}
 */
async function loginMicrosoftStandalone() {
  const authManager = new Auth("select_account");

  console.log("[auth:standalone] Iniciando flujo OAuth de Microsoft…");

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Tiempo de espera agotado (120s). Cierra la ventana e inténtalo de nuevo.")),
      120_000
    )
  );

  const login = (async () => {
    let redirectUrl;
    try {
      redirectUrl = authManager.createLink();
      console.log("[auth:standalone] URL OAuth generada:", redirectUrl.substring(0, 80) + "…");
    } catch (err) {
      throw new Error("No se pudo crear el enlace OAuth de Microsoft: " + (err.message || String(err)));
    }

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
      console.log("[auth:standalone] Abriendo ventana de login…");
      authWindow.loadURL(redirectUrl);

      let resolved = false;

      /**
       * Intenta extraer el auth code de una URL de callback.
       * Distingue entre: código válido, error del proveedor, URL irrelevante.
       */
      function tryExtractCode(url) {
        if (!url) return;
        if (!url.startsWith(authManager.token.redirect)) return;

        console.log("[auth:standalone] Callback OAuth capturado:", url.substring(0, 100));

        const params = new URLSearchParams(url.substring(url.indexOf("?") + 1));
        const code = params.get("code");
        const oauthError = params.get("error");
        const errorDesc = params.get("error_description");

        if (code) {
          console.log("[auth:standalone] Código OAuth recibido OK.");
          resolved = true;
          resolve(code);
          try { authWindow.close(); } catch {}
        } else if (oauthError) {
          // Error explícito del proveedor OAuth (ej: access_denied, server_error)
          const humanMsg = errorDesc
            ? errorDesc.replace(/\+/g, " ")
            : oauthError;
          console.error("[auth:standalone] Error del proveedor OAuth:", oauthError, "—", humanMsg);
          resolved = true;
          reject(new Error("Microsoft rechazó el acceso: " + humanMsg));
          try { authWindow.close(); } catch {}
        }
        // Si no hay ni code ni error, la URL es una redirección intermedia — ignorar
      }

      authWindow.on("close", () => {
        if (!resolved) {
          console.warn("[auth:standalone] Ventana cerrada por el usuario antes de completar login.");
          reject(new Error(
            "Inicio de sesión cancelado. Cerraste la ventana antes de completar el proceso."
          ));
        }
      });

      // Captura de callbacks — cuatro eventos para mayor cobertura en todos los flujos OAuth
      authWindow.webContents.on("did-finish-load", () => {
        const loc = authWindow.webContents.getURL();
        console.log("[auth:standalone] Página cargada:", loc.substring(0, 100));
        tryExtractCode(loc);
      });

      authWindow.webContents.on("will-redirect", (_ev, url) => {
        console.log("[auth:standalone] will-redirect →", url.substring(0, 100));
        tryExtractCode(url);
      });

      authWindow.webContents.on("will-navigate", (_ev, url) => {
        console.log("[auth:standalone] will-navigate →", url.substring(0, 100));
        tryExtractCode(url);
      });

      authWindow.webContents.on("did-navigate", (_ev, url) => {
        console.log("[auth:standalone] did-navigate →", url.substring(0, 100));
        tryExtractCode(url);
      });
    });

    // ── Fase 2: intercambiar código por token Xbox/Minecraft ─────────────────
    console.log("[auth:standalone] Código obtenido. Autenticando con Xbox Live…");
    let xboxManager;
    try {
      xboxManager = await authManager.login(authCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[auth:standalone] Error en authManager.login():", msg);
      throw new Error("Error al validar con Xbox Live: " + msg);
    }

    console.log("[auth:standalone] Xbox OK. Obteniendo perfil de Minecraft…");
    let token;
    try {
      token = await xboxManager.getMinecraft();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[auth:standalone] Error en xboxManager.getMinecraft():", msg);
      throw new Error("Error al obtener perfil de Minecraft: " + msg);
    }

    return { token, xboxManager };
  })();

  const { token, xboxManager } = await Promise.race([login, timeout]);

  const mclcAuth = token.mclc();
  const profile = {
    name: token.profile.name,
    uuid: token.profile.id
  };

  console.log("[auth:standalone] Sesión premium OK:", profile.name, "UUID:", profile.uuid);

  let msmcData = null;
  try {
    msmcData = xboxManager.save();
  } catch (e) {
    console.warn("[auth:standalone] No se pudo guardar datos msmc para refresh:", e.message);
  }

  addAccount(profile, mclcAuth, false, msmcData);
  return { mclc: mclcAuth, profile };
}

/**
 * Login para variante Microsoft Store.
 *
 * Actualmente delega a loginMicrosoftStandalone() porque el flujo OAuth window-based
 * es válido también en el sandbox de Store.
 *
 * Esta capa existe para poder adaptar el login Store de forma independiente si la
 * certificación vuelve a rechazar el método actual — sin riesgo de regresión en standalone.
 * Posibles evoluciones futuras:
 *   - MSAL + protocolo ms-xboxlive://
 *   - WebAuthenticationBroker (WinRT via node-addon)
 *   - Ventana con user-agent personalizado para mejorar compatibilidad con Store sandbox
 *
 * @returns {{ mclc: object, profile: { name: string, uuid: string } }}
 */
async function loginMicrosoftStore() {
  console.log("[auth:store] Iniciando flujo OAuth (variante Store)…");
  // Usa la misma implementación standalone (OAuth manual).
  // La separación de namespace permite cambiar esta estrategia de forma independiente.
  return loginMicrosoftStandalone();
}

/**
 * Selector de estrategia de login Microsoft.
 * Elige loginMicrosoftStandalone o loginMicrosoftStore según la variante de build.
 * @returns {{ mclc: object, profile: { name: string, uuid: string } }}
 */
async function loginMicrosoft() {
  return STORE_BUILD ? loginMicrosoftStore() : loginMicrosoftStandalone();
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
      // Token expirado y no se pudo refrescar — NO usar token viejo
      // porque causará "AuthHybrid: Could not verify your Minecraft account"
      throw new Error(
        "Tu sesión de Microsoft ha expirado y no se pudo renovar. " +
        "Elimina la cuenta y vuelve a iniciar sesión."
      );
    }
  }

  // Sin datos msmc para refrescar — token probablemente expirado
  console.warn("[auth] Sin datos msmc para refrescar, token puede estar expirado:", account.name);
  throw new Error(
    "No se puede verificar tu cuenta de Microsoft. " +
    "Elimina la cuenta y vuelve a iniciar sesión."
  );
}

module.exports = {
  loginMicrosoft,
  getAccountList,
  getAccountAuth,
  removeAccount,
  loadAccounts
};
