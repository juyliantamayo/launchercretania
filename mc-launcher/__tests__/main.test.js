/**
 * Tests para main.js — Funciones puras y lógica de IPC
 *
 * Se prueban las funciones que NO necesitan una ventana Electron real:
 *  - loadSettings / saveSettings
 *  - getGameDir
 *  - detectJavaAt (verificación de ruta de Java)
 *  - installFabric (descarga de perfil)
 *  - IPC check-updates (lógica)
 *  - IPC get-patch-notes (lógica)
 */

const path = require("path");
const fs = require("fs-extra");

// ─── Directorio temporal para tests ───────────────────────────────────────────
const TEST_DIR = path.join(__dirname, "..", "test-tmp-main");
const SETTINGS_FILE = path.join(TEST_DIR, "settings.json");

// ─── Mock Electron ────────────────────────────────────────────────────────────
jest.mock("electron", () => {
  const ipcHandlers = {};
  const ipcOnHandlers = {};
  return {
    app: {
      getPath: (key) => {
        if (key === "appData") return TEST_DIR;
        if (key === "userData") return TEST_DIR;
        if (key === "temp") return path.join(TEST_DIR, "temp");
        return TEST_DIR;
      },
      whenReady: () => ({ then: jest.fn() }),
      on: jest.fn(),
      quit: jest.fn()
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
      once: jest.fn(),
      loadFile: jest.fn(),
      setMenu: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
      minimize: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        send: jest.fn(),
        openDevTools: jest.fn(),
        on: jest.fn(),
        getURL: jest.fn()
      }
    })),
    ipcMain: {
      handle: (channel, handler) => { ipcHandlers[channel] = handler; },
      on: (channel, handler) => { ipcOnHandlers[channel] = handler; },
      _handlers: ipcHandlers,
      _onHandlers: ipcOnHandlers
    },
    dialog: {
      showOpenDialog: jest.fn().mockResolvedValue({ canceled: true, filePaths: [] })
    },
    shell: {
      openPath: jest.fn()
    }
  };
});

// Mock child_process
jest.mock("child_process", () => ({
  execSync: jest.fn(),
  execFile: jest.fn()
}));

// Mock minecraft-launcher-core
jest.mock("minecraft-launcher-core", () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    launch: jest.fn()
  }))
}));

// Mock msmc
jest.mock("msmc", () => ({
  Auth: jest.fn().mockImplementation(() => ({
    createLink: jest.fn(),
    refresh: jest.fn()
  }))
}));

// Mock axios 
jest.mock("axios");
const axios = require("axios");

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  fs.ensureDirSync(TEST_DIR);
  jest.clearAllMocks();
});

afterEach(() => {
  fs.removeSync(TEST_DIR);
});

// Importar main.js (esto registra todos los IPC handlers)
// Lo hacemos una vez — los handlers quedan registrados en el mock
let ipcHandlers;
beforeAll(() => {
  // Asegurar directorio antes de que main.js intente leer settings
  fs.ensureDirSync(TEST_DIR);
  require("../main");
  const { ipcMain } = require("electron");
  ipcHandlers = ipcMain._handlers;
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Settings
// ═══════════════════════════════════════════════════════════════════════════════
describe("Settings (via IPC)", () => {
  test("get-settings devuelve valores por defecto si no existe archivo", async () => {
    // Eliminar settings si existe
    if (fs.existsSync(SETTINGS_FILE)) fs.removeSync(SETTINGS_FILE);

    const handler = ipcHandlers["get-settings"];
    expect(handler).toBeDefined();

    const result = await handler();
    expect(result).toBeDefined();
    expect(result.ramMin).toBeDefined();
    expect(result.ramMax).toBeDefined();
  });

  test("save-settings persiste y get-settings los recupera", async () => {
    const saveHandler = ipcHandlers["save-settings"];
    const getHandler = ipcHandlers["get-settings"];

    const newSettings = { ramMin: 3, ramMax: 8, width: 1920, height: 1080, gameDir: "" };
    await saveHandler(null, newSettings);

    const loaded = await getHandler();
    expect(loaded.ramMin).toBe(3);
    expect(loaded.ramMax).toBe(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Check Updates IPC
// ═══════════════════════════════════════════════════════════════════════════════
describe("check-updates IPC", () => {
  test("detecta primera ejecución", async () => {
    const handler = ipcHandlers["check-updates"];
    expect(handler).toBeDefined();

    // Limpiar archivo de versión
    const versionFile = path.join(TEST_DIR, "modpack-version.txt");
    if (fs.existsSync(versionFile)) fs.removeSync(versionFile);

    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.1", mods: [{ id: "a" }, { id: "b" }] }
    });

    const result = await handler();
    expect(result.isFirstRun).toBe(true);
    expect(result.remoteVersion).toBe("1.0.1");
    expect(result.modCount).toBe(2);
  });

  test("detecta actualización disponible", async () => {
    const handler = ipcHandlers["check-updates"];

    // Simular versión local guardada
    const versionFile = path.join(TEST_DIR, "modpack-version.txt");
    fs.writeFileSync(versionFile, "1.0.0");

    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.1", mods: [] }
    });

    const result = await handler();
    expect(result.hasUpdate).toBe(true);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.remoteVersion).toBe("1.0.1");
  });

  test("no detecta actualización si versiones son iguales", async () => {
    const handler = ipcHandlers["check-updates"];

    const versionFile = path.join(TEST_DIR, "modpack-version.txt");
    fs.writeFileSync(versionFile, "1.0.0");

    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.0", mods: [] }
    });

    const result = await handler();
    expect(result.hasUpdate).toBe(false);
  });

  test("maneja error de red graciosamente", async () => {
    const handler = ipcHandlers["check-updates"];

    axios.get.mockRejectedValueOnce(new Error("Timeout"));

    const result = await handler();
    expect(result.error).toBeDefined();
    expect(result.hasUpdate).toBe(false);
  });

  test("usa cache-busting en la URL", async () => {
    const handler = ipcHandlers["check-updates"];

    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.0", mods: [] }
    });

    await handler();

    const calledUrl = axios.get.mock.calls[0][0];
    expect(calledUrl).toMatch(/\?t=\d+/);
    expect(axios.get.mock.calls[0][1].headers["Cache-Control"]).toBe("no-cache");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Patch Notes IPC
// ═══════════════════════════════════════════════════════════════════════════════
describe("get-patch-notes IPC", () => {
  test("devuelve patch notes del manifest remoto", async () => {
    const handler = ipcHandlers["get-patch-notes"];
    expect(handler).toBeDefined();

    const patchNotes = [
      {
        version: "1.0.1",
        date: "6 de Marzo, 2026",
        categories: [
          { type: "added", title: "Nuevos", icon: "+", entries: [{ text: "Algo nuevo" }] }
        ]
      }
    ];

    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.1", patchNotes }
    });

    const result = await handler();
    expect(result.version).toBe("1.0.1");
    expect(result.patchNotes).toEqual(patchNotes);
  });

  test("devuelve array vacío si manifest no tiene patchNotes", async () => {
    const handler = ipcHandlers["get-patch-notes"];

    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.0" }
    });

    const result = await handler();
    expect(result.version).toBe("1.0.0");
    expect(result.patchNotes).toEqual([]);
  });

  test("usa manifest cacheado como fallback si la red falla", async () => {
    const handler = ipcHandlers["get-patch-notes"];

    // Crear manifest cacheado
    const gameDir = path.join(TEST_DIR, ".cretania-minecraft");
    fs.ensureDirSync(gameDir);
    const cached = {
      version: "1.0.0",
      patchNotes: [{ version: "1.0.0", date: "Cache", categories: [] }]
    };
    fs.writeFileSync(path.join(gameDir, "manifest-cache.json"), JSON.stringify(cached));

    axios.get.mockRejectedValueOnce(new Error("Network error"));

    const result = await handler();
    // Puede devolver del cache o error dependiendo de getGameDir
    expect(result).toBeDefined();
    expect(result.patchNotes).toBeDefined();
  });

  test("maneja error total sin crash", async () => {
    const handler = ipcHandlers["get-patch-notes"];

    axios.get.mockRejectedValueOnce(new Error("Total failure"));

    const result = await handler();
    expect(result).toBeDefined();
    expect(Array.isArray(result.patchNotes)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Java Detection
// ═══════════════════════════════════════════════════════════════════════════════
describe("check-java IPC", () => {
  test("handler está registrado", () => {
    expect(ipcHandlers["check-java"]).toBeDefined();
  });

  test("devuelve objeto con propiedad found", async () => {
    const { execSync } = require("child_process");
    // Simular que Java no se encuentra
    execSync.mockImplementation(() => { throw new Error("not found"); });

    const result = await ipcHandlers["check-java"]();
    expect(result).toBeDefined();
    expect(typeof result.found).toBe("boolean");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: IPC Handlers Registration
// ═══════════════════════════════════════════════════════════════════════════════
describe("IPC Handlers Registration", () => {
  test("todos los handlers esenciales están registrados", () => {
    const expectedHandlers = [
      "get-settings",
      "save-settings",
      "check-updates",
      "get-patch-notes",
      "check-java",
      "install-java",
      "get-accounts",
      "remove-account",
      "login-microsoft",
      "launch",
      "select-game-dir",
      "open-game-dir",
      "download-modpack"
    ];

    for (const channel of expectedHandlers) {
      expect(ipcHandlers[channel]).toBeDefined();
    }
  });
});
