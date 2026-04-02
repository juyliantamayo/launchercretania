/**
 * preload.js — Context Bridge para aislamiento de seguridad
 *
 * Expone SOLO las funciones IPC necesarias al renderer (index.html)
 * a través de window.cretania, sin dar acceso a Node.js ni a ipcRenderer directamente.
 */

const { contextBridge, ipcRenderer } = require("electron");

// Lista blanca de canales permitidos — cualquier canal no listado aquí es bloqueado
const INVOKE_CHANNELS = [
  "get-settings",
  "save-settings",
  "get-launcher-update-status",
  "apply-launcher-update",
  "get-app-flags",
  "select-game-dir",
  "open-game-dir",
  "open-modpack-dir",
  "get-accounts",
  "remove-account",
  "login-microsoft",
  "check-updates",
  "get-modpacks",
  "get-optional-mods",
  "save-optional-mods",
  "pick-and-upload-user-mod",
  "delete-user-mod",
  "get-instance-status",
  "kill-instance",
  "launch",
  "download-modpack",
  "sync-mods-only",
  "check-java",
  "install-java",
  "get-patch-notes",
  // multi-modpack
  "get-modpacks",
  "get-optional-mods",
  "save-optional-mods",
  "pick-and-upload-user-mod",
  "delete-user-mod",
  "get-instance-status"
];

const SEND_CHANNELS = [
  "win-minimize",
  "win-maximize",
  "win-close"
];

const ON_CHANNELS = [
  "progress",
  "log",
  "mc-closed",
  "java-install-progress",
  "launcher-update-status"
];

contextBridge.exposeInMainWorld("cretania", {
  /** Llamada async al main process (request/response) */
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`Canal IPC no permitido: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /** Envío sin respuesta al main process */
  send: (channel, ...args) => {
    if (!SEND_CHANNELS.includes(channel)) {
      throw new Error(`Canal IPC no permitido: ${channel}`);
    }
    ipcRenderer.send(channel, ...args);
  },

  /** Escuchar eventos del main process */
  on: (channel, callback) => {
    if (!ON_CHANNELS.includes(channel)) {
      throw new Error(`Canal IPC no permitido: ${channel}`);
    }
    // Envolver callback para no exponer el objeto event de Electron
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    // Retornar función para desuscribirse
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
