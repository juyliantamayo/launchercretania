/**
 * Tests para updater.js — Sincronización diferencial de mods
 */

const path = require("path");
const fs = require("fs-extra");
const crypto = require("crypto");
const EventEmitter = require("events");

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Mock axios antes de importar updater
jest.mock("axios");
const axios = require("axios");

// Directorio temporal para tests
const TEST_DIR = path.join(__dirname, "..", "test-tmp-updater");
const GAME_DIR = path.join(TEST_DIR, "game");
const MODS_DIR = path.join(GAME_DIR, "mods");

// Helper: crear archivo con contenido y devolver sha1
function createFileWithContent(filePath, content) {
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  return crypto.createHash("sha1").update(Buffer.from(content)).digest("hex");
}

// Helper: calcular sha1 de un string
function sha1(content) {
  return crypto.createHash("sha1").update(Buffer.from(content)).digest("hex");
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  fs.ensureDirSync(MODS_DIR);
  jest.clearAllMocks();
});

afterEach(() => {
  fs.removeSync(TEST_DIR);
});

// Importar updater (resetear caché del módulo para cada suite si es necesario)
const { syncMods } = require("../updater");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Manifest Loading
// ═══════════════════════════════════════════════════════════════════════════════
describe("Manifest Loading", () => {
  test("descarga manifest remoto y cachea localmente", async () => {
    const manifest = {
      version: "1.0.1",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: []
    };

    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (data) => events.push(data));

    const result = await syncMods(GAME_DIR, emitter);

    expect(result.version).toBe("1.0.1");
    expect(result.minecraft).toBe("1.20.1");
    // Debe haber cacheado el manifest
    const cached = path.join(GAME_DIR, "manifest-cache.json");
    expect(fs.existsSync(cached)).toBe(true);
    const cachedData = JSON.parse(fs.readFileSync(cached, "utf-8"));
    expect(cachedData.version).toBe("1.0.1");
  });

  test("usa manifest cacheado si la descarga falla", async () => {
    // Escribir un manifest cacheado
    const cachedManifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: []
    };
    fs.writeFileSync(
      path.join(GAME_DIR, "manifest-cache.json"),
      JSON.stringify(cachedManifest)
    );

    // Hacer que la descarga falle
    axios.get.mockRejectedValueOnce(new Error("Network error"));

    const emitter = new EventEmitter();
    const result = await syncMods(GAME_DIR, emitter);

    expect(result.version).toBe("1.0.0");
  });

  test("retorna manifest mínimo si no hay manifest disponible", async () => {
    // Sin manifest remoto ni local ni cache
    axios.get.mockRejectedValueOnce(new Error("Network error"));

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (data) => events.push(data));

    const result = await syncMods(GAME_DIR, emitter);

    expect(result._noManifest).toBe(true);
    expect(result.minecraft).toBe("1.20.1");
    // Debe emitir evento done
    expect(events.some((e) => e.phase === "done")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Mod Sync - Downloads
// ═══════════════════════════════════════════════════════════════════════════════
describe("Mod Sync — Downloads", () => {
  test("descarga mods que faltan", async () => {
    const modContent = "fake-jar-content-mod-a";
    const modSha1 = sha1(modContent);

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "mod-a", file: "mods/mod-a-1.0.jar", sha1: modSha1, url: "https://example.com/mod-a-1.0.jar" }
      ]
    };

    // Mock manifest download
    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({ data: manifest });
      }
      // Mock mod download
      return Promise.resolve({ data: Buffer.from(modContent) });
    });

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (data) => events.push(data));

    await syncMods(GAME_DIR, emitter);

    // Mod debe existir
    const modPath = path.join(MODS_DIR, "mod-a-1.0.jar");
    expect(fs.existsSync(modPath)).toBe(true);

    // SHA1 debe coincidir
    const localHash = crypto.createHash("sha1").update(fs.readFileSync(modPath)).digest("hex");
    expect(localHash).toBe(modSha1);

    // Debe haber emitido progreso de descarga
    expect(events.some((e) => e.phase === "download")).toBe(true);
    expect(events.some((e) => e.phase === "done")).toBe(true);
  });

  test("no re-descarga mods con SHA1 correcto", async () => {
    const modContent = "existing-jar-content";
    const modSha1 = createFileWithContent(path.join(MODS_DIR, "mod-ok-1.0.jar"), modContent);

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "mod-ok", file: "mods/mod-ok-1.0.jar", sha1: modSha1 }
      ]
    };

    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (data) => events.push(data));

    await syncMods(GAME_DIR, emitter);

    // No debe haber descargado nada (solo 1 llamada: manifest)
    expect(axios.get).toHaveBeenCalledTimes(1);
    // Done con 0 synced
    expect(events.some((e) => e.phase === "done" && e.total === 0)).toBe(true);
  });

  test("re-descarga mods con SHA1 diferente (actualización)", async () => {
    const oldContent = "old-version";
    createFileWithContent(path.join(MODS_DIR, "mod-update-1.0.jar"), oldContent);

    const newContent = "new-version-content";
    const newSha1 = sha1(newContent);

    const manifest = {
      version: "1.0.1",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "mod-update", file: "mods/mod-update-1.0.jar", sha1: newSha1, url: "https://example.com/mod-update-1.0.jar" }
      ]
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      return Promise.resolve({ data: Buffer.from(newContent) });
    });

    const emitter = new EventEmitter();
    await syncMods(GAME_DIR, emitter);

    const localHash = crypto.createHash("sha1")
      .update(fs.readFileSync(path.join(MODS_DIR, "mod-update-1.0.jar")))
      .digest("hex");
    expect(localHash).toBe(newSha1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Mod Cleanup
// ═══════════════════════════════════════════════════════════════════════════════
describe("Mod Cleanup — Eliminar obsoletos", () => {
  test("elimina mods .jar que no están en el manifest", async () => {
    // Crear un mod obsoleto
    createFileWithContent(path.join(MODS_DIR, "obsolete-mod-1.0.jar"), "old-data");
    // Crear un mod actual
    const currentContent = "current-mod";
    const currentSha1 = createFileWithContent(path.join(MODS_DIR, "current-mod-1.0.jar"), currentContent);

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "current-mod", file: "mods/current-mod-1.0.jar", sha1: currentSha1 }
      ]
    };

    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    await syncMods(GAME_DIR, emitter);

    // Mod obsoleto eliminado
    expect(fs.existsSync(path.join(MODS_DIR, "obsolete-mod-1.0.jar"))).toBe(false);
    // Mod actual sigue
    expect(fs.existsSync(path.join(MODS_DIR, "current-mod-1.0.jar"))).toBe(true);
  });

  test("no elimina archivos que no son .jar", async () => {
    // Crear un archivo .txt (no mod)
    createFileWithContent(path.join(MODS_DIR, "config.txt"), "config data");

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: []
    };

    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    await syncMods(GAME_DIR, emitter);

    // .txt no se borra
    expect(fs.existsSync(path.join(MODS_DIR, "config.txt"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Error Handling & Resilience
// ═══════════════════════════════════════════════════════════════════════════════
describe("Error Handling & Resilience", () => {
  test("fallo en descarga individual no bloquea el resto", async () => {
    const contentA = "mod-a-data";
    const sha1A = sha1(contentA);
    const contentB = "mod-b-data";
    const sha1B = sha1(contentB);

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "mod-a", file: "mods/mod-a.jar", sha1: sha1A, url: "https://example.com/mod-a.jar" },
        { id: "mod-b", file: "mods/mod-b.jar", sha1: sha1B, url: "https://example.com/mod-b.jar" }
      ]
    };

    let callCount = 0;
    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      callCount++;
      if (url.includes("mod-a.jar")) {
        return Promise.reject(new Error("Download failed"));
      }
      return Promise.resolve({ data: Buffer.from(contentB) });
    });

    const emitter = new EventEmitter();
    const result = await syncMods(GAME_DIR, emitter);

    // mod-b debe haberse descargado correctamente
    expect(fs.existsSync(path.join(MODS_DIR, "mod-b.jar"))).toBe(true);
    // Debe reportar el fallo de mod-a
    expect(result._failedMods).toBeDefined();
    expect(result._failedMods.length).toBeGreaterThanOrEqual(1);
    expect(result._failedMods.some((f) => f.mod === "mod-a")).toBe(true);
  });

  test("ignora mods con SHA1 placeholder vacío", async () => {
    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "mod-no-sha", file: "mods/mod-no-sha.jar", sha1: "" },
        { id: "mod-placeholder", file: "mods/mod-ph.jar", sha1: "PUT_REAL_SHA1_HERE" }
      ]
    };

    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    const events = [];
    emitter.on("progress", (data) => events.push(data));

    await syncMods(GAME_DIR, emitter);

    // No debe haber intentado descargar ninguno (solo 1 llamada al manifest)
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Progress Events
// ═══════════════════════════════════════════════════════════════════════════════
describe("Progress Events", () => {
  test("emite eventos de todas las fases: verify → check → download → done", async () => {
    const content = "test-mod-data";
    const modSha1 = sha1(content);

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "event-mod", file: "mods/event-mod.jar", sha1: modSha1, url: "https://example.com/event-mod.jar" }
      ]
    };

    axios.get.mockImplementation((url) => {
      if (url.includes("manifest.json")) return Promise.resolve({ data: manifest });
      return Promise.resolve({ data: Buffer.from(content) });
    });

    const emitter = new EventEmitter();
    const phases = new Set();
    emitter.on("progress", (data) => phases.add(data.phase));

    await syncMods(GAME_DIR, emitter);

    expect(phases.has("verify")).toBe(true);
    expect(phases.has("check")).toBe(true);
    expect(phases.has("download")).toBe(true);
    expect(phases.has("done")).toBe(true);
  });

  test("emite done con totales correctos cuando no hay cambios", async () => {
    const content = "already-synced";
    const modSha1 = createFileWithContent(path.join(MODS_DIR, "synced.jar"), content);

    const manifest = {
      version: "1.0.0",
      minecraft: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.18.4",
      mods: [
        { id: "synced", file: "mods/synced.jar", sha1: modSha1 }
      ]
    };

    axios.get.mockResolvedValueOnce({ data: manifest });

    const emitter = new EventEmitter();
    const doneEvents = [];
    emitter.on("progress", (data) => {
      if (data.phase === "done") doneEvents.push(data);
    });

    await syncMods(GAME_DIR, emitter);

    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].current).toBe(0);
    expect(doneEvents[0].total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Cache-busting
// ═══════════════════════════════════════════════════════════════════════════════
describe("Cache-busting", () => {
  test("la URL del manifest incluye parámetro anti-cache", async () => {
    axios.get.mockResolvedValueOnce({
      data: { version: "1.0.0", minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] }
    });

    const emitter = new EventEmitter();
    await syncMods(GAME_DIR, emitter);

    const manifestCall = axios.get.mock.calls[0];
    expect(manifestCall[0]).toMatch(/\?t=\d+/);
    expect(manifestCall[1].headers["Cache-Control"]).toBe("no-cache");
  });
});
