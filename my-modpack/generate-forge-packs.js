/**
 * generate-forge-packs.js
 *
 * Regenera las entradas de mods, configs y resourcepacks para los dos packs FORGE:
 *   - cretania-tfc4-experiencia-completa  (todos los mods de la instancia CurseForge)
 *   - cretania-tfc4-lite                  (completo menos mods visuales/pesados)
 *
 * Fuentes:
 *   - Mods base:     C:\Users\julian\curseforge\minecraft\Instances\HardRock TerraFirmaCraft 4 - realistic survival\mods\
 *   - Mods priority: my-modpack\mods\  (creatnia_tfc4-1.0.0.jar viene de aquí)
 *   - Release:       https://github.com/juyliantamayo/launchercretania/releases/download/cretaniaTF4-v1.0.0/
 */

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");
const { encryptManifestObject } = require("../mc-launcher/manifest-crypto");

const ROOT_DIR             = __dirname;
const MANIFEST_PATH        = path.join(ROOT_DIR, "manifest.json");
const ENCRYPTED_PATH       = path.join(ROOT_DIR, "manifest.enc");
const CURSE_MODS_DIR       = "C:\\Users\\julian\\curseforge\\minecraft\\Instances\\HardRock TerraFirmaCraft 4 - realistic survival\\mods";
const WORKSPACE_MODS_DIR   = path.join(ROOT_DIR, "mods");
const PACK_NORMAL_DIR      = path.join(ROOT_DIR, "..", "modpacks", "hardrock-normal");
const PACK_LITE_DIR        = path.join(ROOT_DIR, "..", "modpacks", "hardrock-lite");
const BASE_URL             = "https://github.com/juyliantamayo/launchercretania/releases/download/cretaniaTF4-v1.0.0";

// ── Mods excluidos en la versión LITE (pesados / visuales) ──────────────────
const LITE_EXCLUSIONS = new Set([
  "AmbientSounds_FORGE_v6.3.4_mc1.20.1.jar",
  "Auroras-1.20.1-1.6.2.jar",
  "auto_third_person-forge-1.20.1-2.1.jar",
  "BetterF3-7.0.2-Forge-1.20.1.jar",
  "BetterThirdPerson-Forge-1.20-1.9.0.jar",
  "cleanswing-1.20-1.8.jar",
  "DarkModeEverywhere-1.20.1-1.2.4.jar",
  "EnhancedVisuals_FORGE_v1.8.2_mc1.20.1.jar",
  "ItemPhysic_FORGE_v1.8.9_mc1.20.1.jar",
  "NoF3.jar",
  "oculus-mc1.20.1-1.8.0.jar",
  "physics-mod-3.0.17-mc-1.20.1-forge.jar",
  "Reblured-1.20.1-1.3.0.jar",
  "seamless-loading-screen-2.0.3+1.20.1-forge.jar",
  "sodiumdynamiclights-forge-1.0.10-1.20.1.jar",
  "StylishEffects-v8.0.2-1.20.1-Forge.jar",
  "TravelersTitles-1.20-Forge-4.0.2.jar",
  // exposure, weather2, coroutil, TFCWeather y hardrock-tfc-samples son requeridos por el servidor
]);

// Mods cuya versión en workspace tiene prioridad sobre CurseForge
const PRIORITY_WORKSPACE = new Set([
  "creatnia_tfc4-1.0.0.jar",
]);

// Assets con nombre especial en el release (no siguen el patrón mods.filename)
const SPECIAL_ASSET_NAMES = {
  "creatnia_tfc4-1.0.0.jar": "creatnia_tfc4-1.0.0.jar",  // sin prefijo mods.
};

/**
 * Escanea una carpeta y devuelve entradas para el manifest con URL explícita.
 * Los assets en el release se nombran: <packPrefix>.<subdir>.<filename>
 */
function scanExtras(dir, subdir, packPrefix) {
  const absDir = path.join(dir, subdir);
  if (!fs.existsSync(absDir)) return [];
  return fs.readdirSync(absDir)
    .filter(f => fs.statSync(path.join(absDir, f)).isFile())
    .sort()
    .map(filename => {
      const fullPath = path.join(absDir, filename);
      const stats = fs.statSync(fullPath);
      const sha1 = sha1File(fullPath);
      const assetName = `${packPrefix}.${subdir}.${filename}`;
      return {
        id: makeId(`${packPrefix}-${subdir}-${filename}`),
        file: `${subdir}/${filename}`,
        url: `${BASE_URL}/${assetName}`,
        sha1,
        size: stats.size,
      };
    });
}

function sha1File(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function makeId(filename) {
  return "mods-" + filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/**
 * Convierte un nombre de archivo al nombre de asset de GitHub.
 * GitHub reemplaza / [ ] ( ) ' ` espacio → "." y colapsa ".." → "."
 */
function toGithubAssetName(filename, prefix = "mods") {
  const full = prefix + "/" + filename;
  const normalized = full.replace(/[/\[\]()'`\s]/g, ".");
  return normalized.replace(/\.{2,}/g, ".");
}

function main() {
  // ── Leer todos los JARs de la instancia CurseForge ──
  const curseJars = fs.readdirSync(CURSE_MODS_DIR)
    .filter(f => f.endsWith(".jar"))
    .sort();

  console.log(`\nInstancia CurseForge: ${curseJars.length} mods\n`);

  const completeMods = [];
  const liteMods = [];

  for (const filename of curseJars) {
    const cursePath = path.join(CURSE_MODS_DIR, filename);
    const wspacePath = path.join(WORKSPACE_MODS_DIR, filename);

    // Fuente de SHA1: workspace si es prioritario, si no CurseForge
    const useWorkspace = PRIORITY_WORKSPACE.has(filename) && fs.existsSync(wspacePath);
    const sourcePath = useWorkspace ? wspacePath : cursePath;
    const stats = fs.statSync(sourcePath);
    const sha1 = sha1File(sourcePath);

    // URL en el release
    const assetName = SPECIAL_ASSET_NAMES[filename] || toGithubAssetName(filename);
    const url = `${BASE_URL}/${assetName}`;

    const entry = {
      id: makeId(filename),
      file: `mods/${filename}`,
      url,
      sha1,
      size: stats.size,
    };

    completeMods.push(entry);
    if (!LITE_EXCLUSIONS.has(filename)) {
      liteMods.push(entry);
    }
  }

  console.log(`Pack Completo: ${completeMods.length} mods`);
  console.log(`Pack Lite:     ${liteMods.length} mods`);

  // ── Actualizar manifest.json ──
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

  const idxCompleto = manifest.modpacks.findIndex(p => p.id === "cretania-tfc4-experiencia-completa");
  const idxLite     = manifest.modpacks.findIndex(p => p.id === "cretania-tfc4-lite");

  if (idxCompleto === -1 || idxLite === -1) {
    console.error("No se encontraron los modpacks en el manifest. Verifica los IDs.");
    process.exit(1);
  }

  // Escanear configs y resourcepacks
  const normalConfigs       = scanExtras(PACK_NORMAL_DIR, "config", "hardrock-normal");
  const normalResourcepacks = scanExtras(PACK_NORMAL_DIR, "resourcepacks", "hardrock-normal");
  const liteConfigs         = scanExtras(PACK_LITE_DIR, "config", "hardrock-lite");
  const liteResourcepacks   = scanExtras(PACK_LITE_DIR, "resourcepacks", "hardrock-lite");

  console.log(`\nPack Completo: ${completeMods.length} mods | ${normalConfigs.length} configs | ${normalResourcepacks.length} resourcepacks`);
  console.log(`Pack Lite:     ${liteMods.length} mods | ${liteConfigs.length} configs | ${liteResourcepacks.length} resourcepacks`);

  manifest.modpacks[idxCompleto].mods         = completeMods;
  manifest.modpacks[idxCompleto].config        = normalConfigs;
  manifest.modpacks[idxCompleto].resourcepacks = normalResourcepacks;

  manifest.modpacks[idxLite].mods         = liteMods;
  manifest.modpacks[idxLite].config        = liteConfigs;
  manifest.modpacks[idxLite].resourcepacks = liteResourcepacks;

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(ENCRYPTED_PATH, JSON.stringify(encryptManifestObject(manifest), null, 2) + "\n");

  console.log("\n✅ manifest.json actualizado");
  console.log("✅ manifest.enc regenerado");

  // Imprimir assets a subir
  console.log("\n📤 Assets a subir al release (configs + resourcepacks):");
  [...normalConfigs, ...normalResourcepacks, ...liteConfigs, ...liteResourcepacks].forEach(e => {
    console.log(`  ${e.url.split("/").pop()}  (${(e.size/1024).toFixed(1)} KB)`);
  });
}

main();
