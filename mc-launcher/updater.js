/**
 * updater.js — Actualizador diferencial de contenido del modpack
 *
 * Soporta:
 *  - Modpacks múltiples con backward compatibility
 *  - Mods opcionales
 *  - Mods, resourcepacks, datasources, datapacks y archivos de folders/
 *  - Descarga/copia diferencial por SHA1
 *  - Limpieza de archivos obsoletos administrados por el launcher
 */

const axios = require("axios");
const fs = require("fs-extra");
const crypto = require("crypto");
const path = require("path");
const EventEmitter = require("events");
const { parseManifestPayload } = require("./manifest-crypto");

function isDevMode() {
  try { return !require("electron").app.isPackaged; } catch { return false; }
}

const MANIFEST_URL =
  process.env.MANIFEST_URL ||
  "https://github.com/juyliantamayo/launchercretania/releases/download/modpack-v1.0.0/manifest.enc";

const LOCAL_MODPACK_DIR = (() => {
  const packed = path.join(process.resourcesPath || "", "my-modpack");
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, "..", "my-modpack");
})();

const MAX_PARALLEL = 3;
const MAX_RETRIES = 3;
const SYNC_STATE_FILE = ".launcher-sync-state.json";

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getRemoteManifestCandidates() {
  if (!MANIFEST_URL) return [];

  if (MANIFEST_URL.endsWith("manifest.enc")) {
    return uniqueValues([MANIFEST_URL, MANIFEST_URL.replace(/manifest\.enc$/, "manifest.json")]);
  }

  if (MANIFEST_URL.endsWith("manifest.json")) {
    return uniqueValues([MANIFEST_URL.replace(/manifest\.json$/, "manifest.enc"), MANIFEST_URL]);
  }

  return [MANIFEST_URL];
}

function getLocalManifestCandidates() {
  return uniqueValues([
    path.join(LOCAL_MODPACK_DIR, "manifest.enc"),
    path.join(LOCAL_MODPACK_DIR, "manifest.json")
  ]);
}

function getManifestBaseUrl(manifestUrl) {
  return String(manifestUrl || "").replace(/\/manifest\.(enc|json)(\?.*)?$/i, "");
}

function sha1File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha1").update(data).digest("hex");
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeManifest(data) {
  const launcher = data.launcher || {};

  if (data.formatVersion === 2 && Array.isArray(data.modpacks)) {
    return {
      ...data,
      launcher: {
        version: launcher.version || "1.0.0",
      assetName: launcher.assetName || "LucerionLauncher.exe",
      releaseApiUrl: launcher.releaseApiUrl || "",
      patchNotes: Array.isArray(launcher.patchNotes) ? launcher.patchNotes : []
      }
    };
  }

  return {
    formatVersion: 2,
    launcher: {
      version: launcher.version || data.launcherVersion || "1.0.0",
      assetName: launcher.assetName || "LucerionLauncher.exe",
      releaseApiUrl: launcher.releaseApiUrl || "",
      patchNotes: Array.isArray(launcher.patchNotes) ? launcher.patchNotes : []
    },
    modpacks: [{
      id: "default",
      name: data.name || "Modpack",
      subtitle: "",
      image: "",
      public: true,
      allowedUuids: [],
      baseUrl: "",
      version: data.version || "1.0.0",
      minecraft: data.minecraft || "1.20.1",
      loader: data.loader || "fabric",
      loaderType: data.loaderType || data.loader || "fabric",
      loaderVersion: data.loaderVersion || "0.18.4",
      mods: data.mods || [],
      optionalMods: data.optionalMods || [],
      resourcepacks: data.resourcepacks || [],
      datasources: data.datasources || [],
      datapacks: data.datapacks || [],
      folders: data.folders || [],
      patchNotes: data.patchNotes || []
    }]
  };
}

async function fetchManifest(gameDir, emitter = new EventEmitter()) {
  const remoteCandidates = getRemoteManifestCandidates();
  const isRemote = !isDevMode() && remoteCandidates.length > 0 && !remoteCandidates[0].includes("TU_USUARIO");
  const cachedManifestPath = path.join(gameDir, "manifest-cache.json");
  let raw;

  if (isRemote) {
    emitter.emit("progress", { phase: "status", message: "Descargando lista de archivos..." });

    for (const candidate of remoteCandidates) {
      try {
        const manifestUrl = `${candidate}${candidate.includes("?") ? "&" : "?"}t=${Date.now()}`;
        const { data } = await axios.get(manifestUrl, {
          timeout: 15000,
          headers: { "Cache-Control": "no-cache" }
        });
        raw = parseManifestPayload(data);
        try {
          await fs.ensureDir(gameDir);
          fs.writeFileSync(cachedManifestPath, JSON.stringify(raw, null, 2));
        } catch (cacheErr) {
          console.warn("[updater] No se pudo cachear manifest:", cacheErr.message);
        }
        break;
      } catch (err) {
        console.warn(`[updater] No se pudo descargar manifest remoto (${candidate}):`, err.message);
      }
    }

    if (!raw) {
      emitter.emit("progress", { phase: "status", message: "⚠ Error descargando manifest remoto." });
      if (fs.existsSync(cachedManifestPath)) {
        emitter.emit("progress", { phase: "status", message: "Usando manifest cacheado..." });
        raw = JSON.parse(fs.readFileSync(cachedManifestPath, "utf-8"));
      }
    }
  }

  if (!raw) {
    for (const localManifest of getLocalManifestCandidates()) {
      if (fs.existsSync(localManifest)) {
        emitter.emit("progress", { phase: "status", message: "Usando manifest local..." });
        raw = parseManifestPayload(fs.readFileSync(localManifest, "utf-8"));
        break;
      }
    }
  }

  if (!raw) {
    emitter.emit("progress", { phase: "status", message: "⚠ No se pudo obtener la lista de archivos." });
    emitter.emit("progress", { phase: "done", current: 0, total: 0 });
    return { manifest: null, isRemote };
  }

  return { manifest: normalizeManifest(raw), isRemote };
}

async function downloadWithRetry(url, destPath, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000
      });
      await fs.ensureDir(path.dirname(destPath));
      fs.writeFileSync(destPath, Buffer.from(response.data));
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.warn(`[updater] Reintento ${attempt}/${retries} para ${url} en ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`No se pudo descargar ${url}: ${lastError.message}`);
}

async function limitedParallel(tasks, limit) {
  const results = [];
  const running = new Set();

  for (const task of tasks) {
    const promise = task()
      .then((value) => {
        running.delete(promise);
        return { status: "fulfilled", value };
      })
      .catch((reason) => {
        running.delete(promise);
        return { status: "rejected", reason };
      });

    running.add(promise);
    results.push(promise);

    if (running.size >= limit) {
      await Promise.race(running);
    }
  }

  return Promise.all(results);
}

function loadSyncState(gameDir) {
  const statePath = path.join(gameDir, SYNC_STATE_FILE);
  try {
    if (fs.existsSync(statePath)) {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      return Array.isArray(parsed.files) ? parsed.files : [];
    }
  } catch (err) {
    console.warn("[updater] No se pudo leer sync-state:", err.message);
  }
  return [];
}

function saveSyncState(gameDir, files) {
  const statePath = path.join(gameDir, SYNC_STATE_FILE);
  fs.writeFileSync(statePath, JSON.stringify({ files }, null, 2));
}

async function removeEmptyParents(targetPath, stopDir) {
  let currentDir = path.dirname(targetPath);
  const rootDir = path.resolve(stopDir);

  while (currentDir.startsWith(rootDir) && currentDir !== rootDir) {
    try {
      const entries = await fs.readdir(currentDir);
      if (entries.length > 0) return;
      await fs.remove(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      return;
    }
  }
}

function createSyncEntries(modpack, enabledOptionalMods) {
  const enabledSet = new Set(enabledOptionalMods || []);
  const entries = [];

  const pushEntries = (items, kind, targetResolver) => {
    for (const item of items || []) {
      const file = normalizePath(item.file);
      entries.push({
        ...item,
        kind,
        file,
        targetRelativePath: targetResolver(file)
      });
    }
  };

  pushEntries(modpack.mods || [], "mods", (file) => `mods/${path.basename(file)}`);
  pushEntries(
    (modpack.optionalMods || []).filter((item) => enabledSet.has(item.id)),
    "mods",
    (file) => `mods/${path.basename(file)}`
  );
  pushEntries(modpack.resourcepacks || [], "resourcepacks", (file) => normalizePath(file));
  pushEntries(modpack.datasources || [], "datasources", (file) => normalizePath(file));
  pushEntries(modpack.datapacks || [], "datapacks", (file) => normalizePath(file));
  pushEntries(modpack.folders || [], "folders", (file) => normalizePath(file).replace(/^folders\//, ""));

  return entries;
}

async function syncMods(gameDir, emitter = new EventEmitter(), options = {}) {
  const { modpackId, enabledOptionalMods = [], userModFiles = [] } = options;
  const { manifest: fullManifest, isRemote } = await fetchManifest(gameDir, emitter);

  if (!fullManifest) {
    return { minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [], _noManifest: true };
  }

  let modpack = modpackId
    ? fullManifest.modpacks.find((entry) => entry.id === modpackId)
    : fullManifest.modpacks[0];

  if (!modpack) modpack = fullManifest.modpacks[0];
  if (!modpack) {
    emitter.emit("progress", { phase: "done", current: 0, total: 0 });
    return { minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [], _noManifest: true };
  }

  const baseUrl = modpack.baseUrl || getManifestBaseUrl(MANIFEST_URL);
  const syncEntries = createSyncEntries(modpack, enabledOptionalMods);
  const managedFiles = new Set(syncEntries.map((entry) => entry.targetRelativePath));
  const previousManagedFiles = loadSyncState(gameDir);
  const appliedFiles = new Set();

  const manifest = {
    version: modpack.version,
    minecraft: modpack.minecraft,
    loader: modpack.loader,
    loaderType: modpack.loaderType || modpack.loader,
    loaderVersion: modpack.loaderVersion,
    mods: syncEntries.filter((entry) => entry.kind === "mods"),
    resourcepacks: syncEntries.filter((entry) => entry.kind === "resourcepacks"),
    datasources: syncEntries.filter((entry) => entry.kind === "datasources"),
    datapacks: syncEntries.filter((entry) => entry.kind === "datapacks"),
    folders: syncEntries.filter((entry) => entry.kind === "folders"),
    patchNotes: modpack.patchNotes,
    _modpackId: modpack.id
  };

  await fs.ensureDir(gameDir);
  await fs.ensureDir(path.join(gameDir, "mods"));

  const expectedModFiles = new Set(
    manifest.mods.map((entry) => path.basename(entry.file))
  );
  // Add user-uploaded JARs so they are never deleted by sync
  for (const f of userModFiles) expectedModFiles.add(f);

  const localModFiles = await fs.readdir(path.join(gameDir, "mods"));
  for (const file of localModFiles) {
    if (file.endsWith(".jar") && !expectedModFiles.has(file)) {
      console.log("[updater] Eliminando mod obsoleto:", file);
      await fs.remove(path.join(gameDir, "mods", file));
    }
  }

  for (const staleRelativePath of previousManagedFiles) {
    if (managedFiles.has(staleRelativePath)) continue;
    const absolutePath = path.join(gameDir, staleRelativePath);
    if (await fs.pathExists(absolutePath)) {
      console.log("[updater] Eliminando archivo obsoleto:", staleRelativePath);
      await fs.remove(absolutePath);
      await removeEmptyParents(absolutePath, gameDir);
    }
  }

  const validEntries = syncEntries.filter(
    (entry) => entry.sha1 && !String(entry.sha1).includes("PUT_REAL") && String(entry.sha1).trim() !== ""
  );

  emitter.emit("progress", {
    phase: "verify",
    current: 0,
    total: validEntries.length,
    mod: ""
  });

  const toSync = [];
  for (let index = 0; index < validEntries.length; index++) {
    const entry = validEntries[index];
    const destPath = path.join(gameDir, entry.targetRelativePath);
    let needsSync = true;

    if (await fs.pathExists(destPath)) {
      const localHash = sha1File(destPath);
      needsSync = localHash.toLowerCase() !== String(entry.sha1).toLowerCase();
      if (!needsSync) appliedFiles.add(entry.targetRelativePath);
    }

    if (needsSync) toSync.push(entry);

    if ((index + 1) % 5 === 0 || index === validEntries.length - 1) {
      emitter.emit("progress", {
        phase: "verify",
        current: index + 1,
        total: validEntries.length,
        mod: entry.id,
        pending: toSync.length
      });
    }
  }

  emitter.emit("progress", {
    phase: "check",
    current: 0,
    total: toSync.length
  });

  if (toSync.length === 0) {
    saveSyncState(gameDir, Array.from(managedFiles).sort());
    console.log("[updater] Todo actualizado. Sin cambios necesarios.");
    emitter.emit("progress", { phase: "done", current: 0, total: 0 });
    return manifest;
  }

  console.log(`[updater] Sincronizando ${toSync.length} archivo(s)...`);

  let synced = 0;
  const failed = [];

  await limitedParallel(
    toSync.map((entry) => async () => {
      const destPath = path.join(gameDir, entry.targetRelativePath);
      try {
        if (isRemote) {
          const url = entry.url || `${baseUrl}/${path.basename(entry.file)}`;
          console.log("[updater] Descargando:", entry.id, "→", url);
          await downloadWithRetry(url, destPath);
        } else {
          const sourcePath = path.join(LOCAL_MODPACK_DIR, entry.file);
          if (!await fs.pathExists(sourcePath)) {
            throw new Error(`Archivo no encontrado localmente: ${sourcePath}`);
          }
          console.log("[updater] Copiando:", entry.id, "→", destPath);
          await fs.ensureDir(path.dirname(destPath));
          await fs.copy(sourcePath, destPath, { overwrite: true });
        }

        const resultHash = sha1File(destPath);
        if (resultHash.toLowerCase() !== String(entry.sha1).toLowerCase()) {
          await fs.remove(destPath);
          throw new Error(`SHA1 inválido para ${entry.id}: esperado ${entry.sha1}, obtenido ${resultHash}`);
        }

        appliedFiles.add(entry.targetRelativePath);
        synced++;
        console.log(`[updater] ✓ ${entry.id} (${synced}/${toSync.length})`);
        emitter.emit("progress", {
          phase: isRemote ? "download" : "copy",
          current: synced,
          total: toSync.length,
          mod: entry.id
        });
      } catch (err) {
        console.error(`[updater] ✗ Error con ${entry.id}: ${err.message}`);
        failed.push({ mod: entry.id, error: err.message, kind: entry.kind });
        synced++;
        emitter.emit("progress", {
          phase: isRemote ? "download" : "copy",
          current: synced,
          total: toSync.length,
          mod: `${entry.id} (ERROR)`
        });
      }
    }),
    MAX_PARALLEL
  );

  saveSyncState(gameDir, Array.from(new Set([...Array.from(appliedFiles), ...Array.from(managedFiles)])).sort());

  emitter.emit("progress", {
    phase: "done",
    current: toSync.length,
    total: toSync.length
  });

  if (failed.length > 0) {
    console.warn(`[updater] ${failed.length} archivo(s) fallaron:`, failed.map((entry) => entry.mod).join(", "));
    manifest._failedMods = failed;
  }

  console.log(`[updater] Sincronización completa. OK: ${toSync.length - failed.length}, Fallidos: ${failed.length}`);
  return manifest;
}

module.exports = { syncMods, fetchManifest, normalizeManifest, getManifestBaseUrl };