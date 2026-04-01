/**
 * generate-manifest.js
 *
 * Escanea el contenido del modpack y regenera manifest.json.
 *
 * Categorías soportadas:
 *   - mods/
 *   - resourcepacks/
 *   - datasources/
 *   - datapacks/
 *   - folders/      (se copia a gameDir/ quitando el prefijo folders/)
 *
 * Uso:
 *   node generate-manifest.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { encryptManifestObject } = require("../mc-launcher/manifest-crypto");

const ROOT_DIR = __dirname;
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");
const ENCRYPTED_MANIFEST_PATH = path.join(ROOT_DIR, "manifest.enc");

const BASE_MODPACK = {
  id: "cretania",
  name: "Cretania",
  subtitle: "Mundo de Ingenieros",
  image: "LOGO_CRETANIA_2.png",
  public: true,
  allowedUuids: [],
  baseUrl: "",
  version: "1.0.0",
  minecraft: "1.20.1",
  loader: "fabric",
  loaderType: "fabric",
  loaderVersion: "0.18.4",
  mods: [],
  optionalMods: [],
  resourcepacks: [],
  datasources: [],
  datapacks: [],
  folders: [],
  patchNotes: []
};

const BASE_LAUNCHER = {
  version: "1.0.0",
  assetName: "CretaniaLauncher.exe",
  releaseApiUrl: "https://api.github.com/repos/juyliantamayo/launchercretania/releases/latest",
  patchNotes: []
};

function sha1File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha1").update(data).digest("hex");
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/");
}

function makeId(relativePath) {
  return relativePath
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function walkFiles(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  const results = [];

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  };

  walk(baseDir);
  return results.sort();
}

function scanCategory(relativeDir, label, filterFn = () => true) {
  const absoluteDir = path.join(ROOT_DIR, relativeDir);
  ensureDir(absoluteDir);

  const files = walkFiles(absoluteDir).filter(filterFn);
  if (files.length === 0) {
    console.log(`- ${label}: sin archivos`);
    return [];
  }

  return files.map((fullPath) => {
    const relativePath = toPosix(path.relative(ROOT_DIR, fullPath));
    const stats = fs.statSync(fullPath);
    const sha1 = sha1File(fullPath);
    console.log(`  ✓ ${relativePath} (${(stats.size / 1024).toFixed(0)} KB)`);
    return {
      id: makeId(relativePath),
      file: relativePath,
      sha1,
      size: stats.size
    };
  });
}

function loadExistingManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return {
      formatVersion: 2,
      launcher: { ...BASE_LAUNCHER },
      modpacks: [{ ...BASE_MODPACK }]
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    if (parsed.formatVersion === 2 && Array.isArray(parsed.modpacks) && parsed.modpacks.length > 0) {
      return {
        ...parsed,
        launcher: {
          ...BASE_LAUNCHER,
          ...(parsed.launcher || {})
        }
      };
    }

    return {
      formatVersion: 2,
      launcher: {
        ...BASE_LAUNCHER,
        version: parsed.launcherVersion || BASE_LAUNCHER.version,
        patchNotes: parsed.launcherPatchNotes || []
      },
      modpacks: [{
        ...BASE_MODPACK,
        version: parsed.version || BASE_MODPACK.version,
        minecraft: parsed.minecraft || BASE_MODPACK.minecraft,
        loader: parsed.loader || BASE_MODPACK.loader,
        loaderType: parsed.loaderType || parsed.loader || BASE_MODPACK.loaderType,
        loaderVersion: parsed.loaderVersion || BASE_MODPACK.loaderVersion,
        patchNotes: parsed.patchNotes || [],
        optionalMods: parsed.optionalMods || []
      }]
    };
  } catch {
    return {
      formatVersion: 2,
      modpacks: [{ ...BASE_MODPACK }]
    };
  }
}

function generateManifest() {
  const manifest = loadExistingManifest();
  const firstModpack = manifest.modpacks[0] || { ...BASE_MODPACK };
  const optionalFiles = new Set((firstModpack.optionalMods || []).map((entry) => toPosix(entry.file)));

  console.log("Escaneando contenido del modpack...");
  const mods = scanCategory("mods", "mods", (filePath) => filePath.endsWith(".jar"))
    .filter((entry) => !optionalFiles.has(entry.file));
  const resourcepacks = scanCategory("resourcepacks", "resourcepacks");
  const datasources = scanCategory("datasources", "datasources");
  const datapacks = scanCategory("datapacks", "datapacks");
  const folders = scanCategory("folders", "folders");

  manifest.formatVersion = 2;
  manifest.launcher = {
    ...BASE_LAUNCHER,
    ...(manifest.launcher || {})
  };
  manifest.modpacks[0] = {
    ...BASE_MODPACK,
    ...firstModpack,
    loaderType: firstModpack.loaderType || firstModpack.loader || BASE_MODPACK.loaderType,
    mods,
    resourcepacks,
    datasources,
    datapacks,
    folders,
    optionalMods: firstModpack.optionalMods || [],
    patchNotes: firstModpack.patchNotes || []
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(ENCRYPTED_MANIFEST_PATH, JSON.stringify(encryptManifestObject(manifest), null, 2) + "\n");

  console.log("");
  console.log(`✅ manifest.json generado para ${manifest.modpacks[0].name}`);
  console.log(`✅ manifest.enc generado (${path.basename(ENCRYPTED_MANIFEST_PATH)})`);
  console.log(`   Mods         : ${mods.length}`);
  console.log(`   Resourcepacks: ${resourcepacks.length}`);
  console.log(`   Datasources  : ${datasources.length}`);
  console.log(`   Datapacks    : ${datapacks.length}`);
  console.log(`   Folders      : ${folders.length}`);
}

// Si se pasa --enc-only, solo cifra el manifest.json existente sin regenerarlo
if (process.argv.includes("--enc-only")) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("❌ manifest.json no encontrado");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  fs.writeFileSync(ENCRYPTED_MANIFEST_PATH, JSON.stringify(encryptManifestObject(manifest), null, 2) + "\n");
  console.log("✅ manifest.enc generado desde manifest.json existente");
} else {
  generateManifest();
}