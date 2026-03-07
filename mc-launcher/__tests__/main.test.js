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
      quit: jest.fn()
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
      "check-java", "install-java", "get-accounts", "remove-account",
      "login-microsoft", "launch", "select-game-dir", "open-game-dir", "download-modpack"
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
    const vf = path.join(mockMainDir, "modpack-version.txt");
    if (fs.existsSync(vf)) fs.removeSync(vf);

    axios.get.mockResolvedValueOnce({ data: { version: "1.0.1", mods: [{ id: "a" }, { id: "b" }] } });
    const r = await ipcHandlers["check-updates"]();
    expect(r.isFirstRun).toBe(true);
    expect(r.remoteVersion).toBe("1.0.1");
    expect(r.modCount).toBe(2);
  });

  test("detecta actualización disponible", async () => {
    fs.writeFileSync(path.join(mockMainDir, "modpack-version.txt"), "1.0.0");
    axios.get.mockResolvedValueOnce({ data: { version: "1.0.1", mods: [] } });
    const r = await ipcHandlers["check-updates"]();
    expect(r.hasUpdate).toBe(true);
    expect(r.currentVersion).toBe("1.0.0");
  });

  test("no detecta update si versiones iguales", async () => {
    fs.writeFileSync(path.join(mockMainDir, "modpack-version.txt"), "1.0.0");
    axios.get.mockResolvedValueOnce({ data: { version: "1.0.0", mods: [] } });
    const r = await ipcHandlers["check-updates"]();
    expect(r.hasUpdate).toBe(false);
  });

  test("maneja error de red", async () => {
    axios.get.mockRejectedValueOnce(new Error("Timeout"));
    const r = await ipcHandlers["check-updates"]();
    expect(r.error).toBeDefined();
    expect(r.hasUpdate).toBe(false);
  });

  test("usa cache-busting", async () => {
    axios.get.mockResolvedValueOnce({ data: { version: "1.0.0", mods: [] } });
    await ipcHandlers["check-updates"]();
    expect(axios.get.mock.calls[0][0]).toMatch(/\?t=\d+/);
    expect(axios.get.mock.calls[0][1].headers["Cache-Control"]).toBe("no-cache");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("get-patch-notes IPC", () => {
  test("devuelve patch notes del manifest", async () => {
    const pn = [{ version: "1.0.1", date: "2026-03-06", categories: [{ type: "added", title: "Nuevos", icon: "+", entries: [{ text: "Algo" }] }] }];
    axios.get.mockResolvedValueOnce({ data: { version: "1.0.1", patchNotes: pn } });
    const r = await ipcHandlers["get-patch-notes"]();
    expect(r.version).toBe("1.0.1");
    expect(r.patchNotes).toEqual(pn);
  });

  test("devuelve array vacío si manifest no tiene patchNotes", async () => {
    axios.get.mockResolvedValueOnce({ data: { version: "1.0.0" } });
    const r = await ipcHandlers["get-patch-notes"]();
    expect(r.patchNotes).toEqual([]);
  });

  test("maneja error total sin crash", async () => {
    axios.get.mockRejectedValueOnce(new Error("Network failure"));
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
