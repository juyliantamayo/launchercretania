/**
 * Tests para main.js — IPC handlers, settings, updates, patch notes
 */

const path = require("path");
const fs = require("fs-extra");

const mockMainDir = path.join(__dirname, "..", "test-tmp-main");

// ─── Mock Electron ────────────────────────────────────────────────────────────
jest.mock("electron", () => {
  const mockDir = require("path").join(__dirname, "..", "test-tmp-main");
  const mockHandlers = {};
  const mockOnHandlers = {};
  return {
    app: {
      getPath: (key) => {
        if (key === "temp") return require("path").join(mockDir, "temp");
        return mockDir;
      },
      whenReady: () => ({ then: jest.fn() }),
      on: jest.fn(),
      quit: jest.fn(),
      requestSingleInstanceLock: jest.fn().mockReturnValue(true),
      isPackaged: false
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
      once: jest.fn(), loadFile: jest.fn(), setMenu: jest.fn(), on: jest.fn(),
      close: jest.fn(), minimize: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn(), openDevTools: jest.fn(), on: jest.fn(), getURL: jest.fn() }
    })),
    ipcMain: {
      handle: (ch, fn) => { mockHandlers[ch] = fn; },
      on: (ch, fn) => { mockOnHandlers[ch] = fn; },
      _handlers: mockHandlers,
      _onHandlers: mockOnHandlers
    },
    dialog: { showOpenDialog: jest.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
    shell: { openPath: jest.fn() }
  };
});

jest.mock("child_process", () => ({
  execSync: jest.fn(() => { throw new Error("not found"); }),
  execFile: jest.fn()
}));

jest.mock("minecraft-launcher-core", () => ({
  Client: jest.fn().mockImplementation(() => ({ on: jest.fn(), launch: jest.fn() }))
}));

jest.mock("msmc", () => ({
  Auth: jest.fn().mockImplementation(() => ({ createLink: jest.fn(), refresh: jest.fn() }))
}));

// Mock de updater — fetchManifest lee manifest local en dev mode, así que lo controlamos
const mockFetchManifest = jest.fn();
jest.mock("../updater", () => {
  const actual = jest.requireActual("../updater");
  return {
    ...actual,
    fetchManifest: mockFetchManifest,
    syncMods: jest.fn().mockResolvedValue({ mods: [], manifest: {} })
  };
});

jest.mock("axios");
const axios = require("axios");

// ─── Setup ────────────────────────────────────────────────────────────────────
let ipcHandlers;

beforeAll(() => {
  fs.ensureDirSync(mockMainDir);
  require("../main");
  const { ipcMain } = require("electron");
  ipcHandlers = ipcMain._handlers;
});

beforeEach(() => {
  fs.ensureDirSync(mockMainDir);
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up only temp files, keep the dir for other tests
  const settingsFile = path.join(mockMainDir, "settings.json");
  if (fs.existsSync(settingsFile)) fs.removeSync(settingsFile);
});

afterAll(() => { fs.removeSync(mockMainDir); });

// ═══════════════════════════════════════════════════════════════════════════════
describe("IPC Handlers Registration", () => {
  test("todos los handlers esenciales están registrados", () => {
    const expected = [
      "get-settings", "save-settings", "check-updates", "get-patch-notes",
      "get-launcher-update-status",
      "check-java", "install-java", "get-accounts", "remove-account",
      "login-microsoft", "launch", "select-game-dir", "open-game-dir", "open-modpack-dir",
      "download-modpack", "get-modpacks", "get-optional-mods", "save-optional-mods", "get-instance-status"
    ];
    for (const ch of expected) {
      expect(ipcHandlers[ch]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Settings (via IPC)", () => {
  test("get-settings devuelve valores por defecto", async () => {
    const result = await ipcHandlers["get-settings"]();
    expect(result).toBeDefined();
    expect(result.ramMin).toBeDefined();
    expect(result.ramMax).toBeDefined();
  });

  test("save-settings persiste y get-settings los recupera", async () => {
    const s = { ramMin: 3, ramMax: 8, width: 1920, height: 1080, gameDir: "" };
    await ipcHandlers["save-settings"](null, s);
    const loaded = await ipcHandlers["get-settings"]();
    expect(loaded.ramMin).toBe(3);
    expect(loaded.ramMax).toBe(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("check-updates IPC", () => {
  test("detecta primera ejecución", async () => {
    const vf = path.join(mockMainDir, "modpack-version-cretania.txt");
    if (fs.existsSync(vf)) fs.removeSync(vf);

    mockFetchManifest.mockResolvedValueOnce({
      manifest: { formatVersion: 2, launcher: { version: "1.0.0" }, modpacks: [{ id: "cretania", version: "1.0.1", mods: [{ id: "a" }, { id: "b" }] }] },
      isRemote: true
    });
    const r = await ipcHandlers["check-updates"](null, "cretania");
    expect(r.isFirstRun).toBe(true);
    expect(r.remoteVersion).toBe("1.0.1");
    expect(r.modCount).toBe(2);
  });

  test("detecta actualización disponible", async () => {
    fs.writeFileSync(path.join(mockMainDir, "modpack-version-cretania.txt"), "1.0.0");
    mockFetchManifest.mockResolvedValueOnce({
      manifest: { formatVersion: 2, launcher: { version: "1.0.0" }, modpacks: [{ id: "cretania", version: "1.0.1", mods: [] }] },
      isRemote: true
    });
    const r = await ipcHandlers["check-updates"](null, "cretania");
    expect(r.hasUpdate).toBe(true);
    expect(r.currentVersion).toBe("1.0.0");
  });

  test("no detecta update si versiones iguales", async () => {
    fs.writeFileSync(path.join(mockMainDir, "modpack-version-cretania.txt"), "1.0.0");
    mockFetchManifest.mockResolvedValueOnce({
      manifest: { formatVersion: 2, launcher: { version: "1.0.0" }, modpacks: [{ id: "cretania", version: "1.0.0", mods: [] }] },
      isRemote: true
    });
    const r = await ipcHandlers["check-updates"](null, "cretania");
    expect(r.hasUpdate).toBe(false);
  });

  test("maneja error de red", async () => {
    mockFetchManifest.mockRejectedValueOnce(new Error("Timeout"));
    const r = await ipcHandlers["check-updates"]();
    expect(r).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("get-patch-notes IPC", () => {
  test("devuelve patch notes del manifest", async () => {
    const pn = [{ version: "1.0.1", date: "2026-03-06", categories: [{ type: "added", title: "Nuevos", icon: "+", entries: [{ text: "Algo" }] }] }];
    mockFetchManifest.mockResolvedValueOnce({
      manifest: { formatVersion: 2, launcher: { version: "1.0.0", patchNotes: pn }, modpacks: [{ id: "cretania", version: "1.0.1", patchNotes: pn }] },
      isRemote: true
    });
    const r = await ipcHandlers["get-patch-notes"](null, "cretania");
    expect(r.version).toBe("1.0.1");
    expect(r.patchNotes).toEqual(pn);
    expect(r.launcherPatchNotes).toEqual(pn);
  });

  test("devuelve array vacío si manifest no tiene patchNotes", async () => {
    mockFetchManifest.mockResolvedValueOnce({
      manifest: { formatVersion: 2, launcher: { version: "1.0.0" }, modpacks: [{ id: "cretania", version: "1.0.0" }] },
      isRemote: true
    });
    const r = await ipcHandlers["get-patch-notes"](null, "cretania");
    expect(r.patchNotes).toEqual([]);
    expect(Array.isArray(r.launcherPatchNotes)).toBe(true);
  });

  test("maneja error total sin crash", async () => {
    mockFetchManifest.mockRejectedValueOnce(new Error("Network failure"));
    const r = await ipcHandlers["get-patch-notes"]();
    expect(r).toBeDefined();
    expect(Array.isArray(r.patchNotes)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("check-java IPC", () => {
  test("devuelve objeto con found", async () => {
    const r = await ipcHandlers["check-java"]();
    expect(r).toBeDefined();
    expect(typeof r.found).toBe("boolean");
  });
});

describe("modpacks IPC", () => {
  test("lista modpacks con estado de acceso", async () => {
    mockFetchManifest.mockResolvedValueOnce({
      manifest: {
        formatVersion: 2,
        launcher: { version: "1.0.0" },
        modpacks: [
          { id: "publico", name: "Publico", public: true, loader: "fabric", loaderType: "fabric", loaderVersion: "0.1", mods: [], optionalMods: [] },
          { id: "privado", name: "Privado", public: false, allowedUuids: ["u-1"], loader: "fabric", loaderType: "fabric", loaderVersion: "0.1", mods: [], optionalMods: [] }
        ]
      },
      isRemote: true
    });

    const result = await ipcHandlers["get-modpacks"](null, { accountUuid: "u-1" });
    expect(result.modpacks).toHaveLength(2);
    expect(result.modpacks[1].hasAccess).toBe(true);
  });
});
