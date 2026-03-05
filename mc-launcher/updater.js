/**
 * updater.js — Actualizador diferencial de mods
 *
 * Características:
 *  - Descarga sólo los mods que cambiaron (comparación SHA1)
 *  - Soporta copia local cuando no hay URL remota configurada
 *  - Elimina mods que ya no están en el manifest
 *  - Descargas paralelas (límite 3 simultáneas)
 *  - Reintentos con backoff exponencial (3 intentos)
 *  - Validación SHA1 post-descarga/copia
 *  - Eventos de progreso (para mostrar en UI)
 */

const axios = require("axios");
const fs = require("fs-extra");
const crypto = require("crypto");
const path = require("path");
const EventEmitter = require("events");

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// Pon la URL raw de tu manifest.json en GitHub Releases:
// Ejemplo: https://github.com/TU_USUARIO/my-modpack/releases/latest/download/manifest.json
//
// Mientras no configures la URL, el launcher usará el manifest local y copiará los mods
// directamente desde my-modpack/mods/ al directorio del juego.
const MANIFEST_URL =
  process.env.MANIFEST_URL ||
  "";

// Ruta a la carpeta local de mods del modpack
// En desarrollo: ../my-modpack  |  En build: process.resourcesPath/my-modpack
const LOCAL_MODPACK_DIR = (() => {
  // Cuando está empaquetado con electron-builder, los extraResources van a resourcesPath
  const packed = path.join(process.resourcesPath || "", "my-modpack");
  if (fs.existsSync(packed)) return packed;
  // Desarrollo: carpeta hermana
  return path.join(__dirname, "..", "my-modpack");
})();

const MAX_PARALLEL = 3;   // descargas/copias simultáneas máximas
const MAX_RETRIES = 3;    // reintentos por archivo
// ─────────────────────────────────────────────────────────────────────────────

/** Calcula el SHA1 de un archivo local */
function sha1File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha1").update(data).digest("hex");
}

/** Descarga un archivo con reintentos y backoff exponencial */
async function downloadWithRetry(url, destPath, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30_000
      });
      await fs.ensureDir(path.dirname(destPath));
      fs.writeFileSync(destPath, Buffer.from(response.data));
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(`[updater] Reintento ${attempt}/${retries} para ${url} en ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`No se pudo descargar ${url}: ${lastError.message}`);
}

/** Limita concurrencia a N promesas simultáneas */
async function limitedParallel(tasks, limit) {
  const results = [];
  const running = new Set();

  for (const task of tasks) {
    const p = task().then((res) => {
      running.delete(p);
      return res;
    });
    running.add(p);
    results.push(p);

    if (running.size >= limit) {
      await Promise.race(running);
    }
  }

  return Promise.all(results);
}

/**
 * Sincroniza la carpeta de mods con el manifest remoto o local.
 *
 * @param {string} gameDir   — ruta raíz de .minecraft
 * @param {EventEmitter} [emitter] — opcional, emite eventos "progress"
 *
 * Eventos emitidos:
 *   progress { phase: 'check'|'download'|'copy'|'done', current, total, mod }
 */
async function syncMods(gameDir, emitter = new EventEmitter()) {
  const isRemote = MANIFEST_URL && !MANIFEST_URL.includes("TU_USUARIO");

  // 1. Descargar manifest (remoto o local)
  let manifest;

  if (isRemote) {
    try {
      console.log("[updater] Descargando manifest remoto...");
      const { data } = await axios.get(MANIFEST_URL, { timeout: 10_000 });
      manifest = data;
    } catch (err) {
      console.warn("[updater] No se pudo descargar manifest remoto:", err.message);
    }
  }

  // Fallback: manifest local
  if (!manifest) {
    const localManifest = path.join(LOCAL_MODPACK_DIR, "manifest.json");
    if (fs.existsSync(localManifest)) {
      console.log("[updater] Usando manifest local:", localManifest);
      manifest = JSON.parse(fs.readFileSync(localManifest, "utf-8"));
    } else {
      console.warn("[updater] Sin manifest disponible. Lanzando sin mods.");
      emitter.emit("progress", { phase: "done", current: 0, total: 0 });
      return { minecraft: "1.20.1", loader: "fabric", loaderVersion: "0.18.4", mods: [] };
    }
  }

  const modsDir = path.join(gameDir, "mods");
  await fs.ensureDir(modsDir);

  // 2. Construir lista de archivos esperados (solo basename)
  const expectedFiles = new Set(
    manifest.mods.map((m) => path.basename(m.file))
  );

  // 3. Eliminar mods locales que ya no están en el manifest
  const localFiles = await fs.readdir(modsDir);
  for (const file of localFiles) {
    if (file.endsWith(".jar") && !expectedFiles.has(file)) {
      console.log("[updater] Eliminando mod obsoleto:", file);
      await fs.remove(path.join(modsDir, file));
    }
  }

  // 4. Filtrar mods con SHA1 placeholder y determinar qué necesitan actualización
  const validMods = manifest.mods.filter(
    (m) => m.sha1 && !m.sha1.includes("PUT_REAL") && m.sha1 !== ""
  );

  const toSync = [];
  for (const mod of validMods) {
    const destPath = path.join(modsDir, path.basename(mod.file));
    let needsSync = true;

    if (fs.existsSync(destPath)) {
      const localHash = sha1File(destPath);
      needsSync = localHash.toLowerCase() !== mod.sha1.toLowerCase();
    }

    if (needsSync) toSync.push(mod);
  }

  emitter.emit("progress", {
    phase: "check",
    current: 0,
    total: toSync.length
  });

  if (toSync.length === 0) {
    console.log("[updater] Todo actualizado. Sin cambios necesarios.");
    emitter.emit("progress", { phase: "done", current: 0, total: 0 });
    return manifest;
  }

  console.log(`[updater] Sincronizando ${toSync.length} mod(s)...`);

  // 5. Sincronizar: copiar localmente O descargar desde remoto
  let synced = 0;
  await limitedParallel(
    toSync.map((mod) => async () => {
      const destPath = path.join(modsDir, path.basename(mod.file));

      if (isRemote) {
        // ── MODO REMOTO: descargar desde URL ──
        const baseUrl = MANIFEST_URL.replace(/\/manifest\.json$/, "");
        const url = mod.url || `${baseUrl}/${path.basename(mod.file)}`;
        console.log("[updater] Descargando:", mod.id, "→", url);
        await downloadWithRetry(url, destPath);
      } else {
        // ── MODO LOCAL: copiar desde my-modpack/mods/ ──
        const sourcePath = path.join(LOCAL_MODPACK_DIR, mod.file);
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Mod no encontrado localmente: ${sourcePath}`);
        }
        console.log("[updater] Copiando:", mod.id, "→", destPath);
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourcePath, destPath, { overwrite: true });
      }

      // 6. Validar SHA1 post-copia/descarga
      const resultHash = sha1File(destPath);
      if (resultHash.toLowerCase() !== mod.sha1.toLowerCase()) {
        await fs.remove(destPath);
        throw new Error(
          `SHA1 inválido para ${mod.id}: esperado ${mod.sha1}, obtenido ${resultHash}`
        );
      }

      synced++;
      console.log(`[updater] ✓ ${mod.id} (${synced}/${toSync.length})`);
      emitter.emit("progress", {
        phase: isRemote ? "download" : "copy",
        current: synced,
        total: toSync.length,
        mod: mod.id
      });
    }),
    MAX_PARALLEL
  );

  emitter.emit("progress", {
    phase: "done",
    current: toSync.length,
    total: toSync.length
  });

  console.log("[updater] Sincronización completa.");
  return manifest;
}

module.exports = { syncMods };
