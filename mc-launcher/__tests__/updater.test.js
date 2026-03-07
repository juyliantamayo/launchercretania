/**
 * Tests para updater.js — Sincronización diferencial de mods
 */

const path = require("path");
const fs = require("fs-extra");
const crypto = require("crypto");
const EventEmitter = require("events");

jest.mock("axios");
const axios = require("axios");

const TEST_DIR = path.join(__dirname, "..", "test-tmp-updater");
const GAME_DIR = path.join(TEST_DIR, "game");
const MODS_DIR = path.join(GAME_DIR, "mods");

function sha1(content) {
  return crypto.createHash("sha1").update(Buffer.from(content)).digest("hex");
}

function createTestFile(filePath, content) {
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  return sha1(content);
}

beforeEach(() => {
  fs.ensureDirSync(MODS_DIR);
  jest.clearAllMocks();
});

afterEach(() => {
  fs.removeSync(TEST_DIR);
});

const { syncMods } = require("../updater");

// ═══════════════════════════════════════════════════════════════════════════════
describe("Manifest Loading", () => {
  test("descarga manifest remoto y cachea localmente", async () => {
    const manifest = { version: "1.0.1", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    const result = await syncMods(GAME_DIR, emitter);

    expect(result.version).toBe("1.0.1");
    expect(fs.existsSync(path.join(GAME_DIR, "manifest-cache.json"))).toBe(true);
  });

  test("usa manifest cacheado si la descarga falla", async () => {
    const cached = { version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
    fs.writeFileSync(path.join(GAME_DIR, "manifest-cache.json"), JSON.stringify(cached));
    axios.get.mockRejectedValueOnce(new Error("Network error"));

    const result = await syncMods(GAME_DIR, new EventEmitter());
    expect(result.version).toBe("1.0.0");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Mod Sync — Downloads", () => {
  test("descarga mods que faltan", async () => {
    const modContent = "fake-jar-content-mod-a";
    const modSha1 = sha1(modContent);
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [{ id: "mod-a", file: "mods/mod-a-1.0.jar", sha1: modSha1, url: "https://example.com/mod-a-1.0.jar" }]
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      return Promise.resolve({ data: Buffer.from(modContent) });
    });

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (d) => events.push(d));
    await syncMods(GAME_DIR, emitter);

    expect(fs.existsSync(path.join(MODS_DIR, "mod-a-1.0.jar"))).toBe(true);
    const localHash = crypto.createHash("sha1").update(fs.readFileSync(path.join(MODS_DIR, "mod-a-1.0.jar"))).digest("hex");
    expect(localHash).toBe(modSha1);
    expect(events.some((e) => e.phase === "download")).toBe(true);
    expect(events.some((e) => e.phase === "done")).toBe(true);
  });

  test("no re-descarga mods con SHA1 correcto", async () => {
    const content = "existing-jar";
    const hash = createTestFile(path.join(MODS_DIR, "mod-ok.jar"), content);
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [{ id: "mod-ok", file: "mods/mod-ok.jar", sha1: hash }]
    };
    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (d) => events.push(d));
    await syncMods(GAME_DIR, emitter);

    // Only 1 call (manifest). No mod downloads.
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.phase === "done" && e.total === 0)).toBe(true);
  });

  test("re-descarga mods con SHA1 diferente (actualización)", async () => {
    createTestFile(path.join(MODS_DIR, "mod-up.jar"), "old-version");
    const newContent = "new-version-content";
    const newHash = sha1(newContent);
    const manifest = {
      version: "1.0.1", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [{ id: "mod-up", file: "mods/mod-up.jar", sha1: newHash, url: "https://example.com/mod-up.jar" }]
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      return Promise.resolve({ data: Buffer.from(newContent) });
    });

    await syncMods(GAME_DIR, new EventEmitter());
    const localHash = crypto.createHash("sha1").update(fs.readFileSync(path.join(MODS_DIR, "mod-up.jar"))).digest("hex");
    expect(localHash).toBe(newHash);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Mod Cleanup — Eliminar obsoletos", () => {
  test("elimina mods .jar que no están en el manifest", async () => {
    createTestFile(path.join(MODS_DIR, "obsolete.jar"), "old");
    const currentHash = createTestFile(path.join(MODS_DIR, "current.jar"), "curr");
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [{ id: "current", file: "mods/current.jar", sha1: currentHash }]
    };
    axios.get.mockResolvedValueOnce({ data: manifest });
    await syncMods(GAME_DIR, new EventEmitter());

    expect(fs.existsSync(path.join(MODS_DIR, "obsolete.jar"))).toBe(false);
    expect(fs.existsSync(path.join(MODS_DIR, "current.jar"))).toBe(true);
  });

  test("no elimina archivos que no son .jar", async () => {
    createTestFile(path.join(MODS_DIR, "config.txt"), "data");
    const manifest = { version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
    axios.get.mockResolvedValueOnce({ data: manifest });
    await syncMods(GAME_DIR, new EventEmitter());
    expect(fs.existsSync(path.join(MODS_DIR, "config.txt"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Error Handling & Resilience", () => {
  test("fallo individual no bloquea el resto", async () => {
    const contentB = "mod-b-data";
    const hashB = sha1(contentB);
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [
        { id: "mod-a", file: "mods/mod-a.jar", sha1: sha1("mod-a-data"), url: "https://example.com/mod-a.jar" },
        { id: "mod-b", file: "mods/mod-b.jar", sha1: hashB, url: "https://example.com/mod-b.jar" }
      ]
    };
    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      if (url.includes("mod-a.jar")) return Promise.reject(new Error("Download failed"));
      return Promise.resolve({ data: Buffer.from(contentB) });
    });

    const result = await syncMods(GAME_DIR, new EventEmitter());
    expect(fs.existsSync(path.join(MODS_DIR, "mod-b.jar"))).toBe(true);
    expect(result._failedMods).toBeDefined();
    expect(result._failedMods.some((f) => f.mod === "mod-a")).toBe(true);
  });

  test("ignora mods con SHA1 placeholder vacío", async () => {
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [
        { id: "no-sha", file: "mods/no-sha.jar", sha1: "" },
        { id: "placeholder", file: "mods/ph.jar", sha1: "PUT_REAL_SHA1_HERE" }
      ]
    };
    axios.get.mockResolvedValueOnce({ data: manifest });
    await syncMods(GAME_DIR, new EventEmitter());
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Progress Events", () => {
  test("emite fases: verify → check → download → done", async () => {
    const content = "test-mod";
    const hash = sha1(content);
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [{ id: "ev-mod", file: "mods/ev-mod.jar", sha1: hash, url: "https://example.com/ev-mod.jar" }]
    };
    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      return Promise.resolve({ data: Buffer.from(content) });
    });

    const phases = new Set();
    const emitter = new EventEmitter();
    emitter.on("progress", (d) => phases.add(d.phase));
    await syncMods(GAME_DIR, emitter);

    expect(phases.has("verify")).toBe(true);
    expect(phases.has("check")).toBe(true);
    expect(phases.has("download")).toBe(true);
    expect(phases.has("done")).toBe(true);
  });

  test("done con totales 0 cuando todo está sincronizado", async () => {
    const content = "already-synced";
    const hash = createTestFile(path.join(MODS_DIR, "synced.jar"), content);
    const manifest = {
      version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4",
      mods: [{ id: "synced", file: "mods/synced.jar", sha1: hash }]
    };
    axios.get.mockResolvedValueOnce({ data: manifest });

    const doneEvents = [];
    const emitter = new EventEmitter();
    emitter.on("progress", (d) => { if (d.phase === "done") doneEvents.push(d); });
    await syncMods(GAME_DIR, emitter);

    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Cache-busting", () => {
  test("URL incluye parámetro anti-cache", async () => {
    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] }
    });
    await syncMods(GAME_DIR, new EventEmitter());

    expect(axios.get.mock.calls[0][0]).toMatch(/\?t=\d+/);
    expect(axios.get.mock.calls[0][1].headers["Cache-Control"]).toBe("no-cache");
  });
});
