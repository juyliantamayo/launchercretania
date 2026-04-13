/**
 * upgrade-to-dual-pack.js
 * Transforma el manifest.json existente (1 modpack) en 2 modpacks:
 *   - hardrock-normal: Experiencia Completa (330 mods + shaders)
 *   - hardrock-lite: Lite (310 mods + 20 opcionales, sin shaders, bajo RAM)
 *
 * Uso: node upgrade-to-dual-pack.js
 */
const fs = require("fs");
const path = require("path");

const MANIFEST_PATH = path.join(__dirname, "manifest.json");
const BACKUP_PATH = path.join(__dirname, "manifest.backup.json");

// Mods pesados/visuales que serán OPCIONALES en Lite
const HEAVY_CLIENT_MODS = new Set([
  "cretania-physics-mod-3-0-17-mc-1-20-1-forge",
  "cretania-ambientsounds-forge-v6-3-4-mc1-20-1",
  "cretania-enhancedvisuals-forge-v1-8-2-mc1-20-1",
  "cretania-oculus-mc1-20-1-1-8-0",
  "cretania-exposure-1-20-1-1-7-16-forge",
  "cretania-weather2-1-20-1-2-8-3",
  "cretania-auroras-1-20-1-1-6-2",
  "cretania-itemphysic-forge-v1-8-9-mc1-20-1",
  "cretania-sodiumdynamiclights-forge-1-0-10-1-20-1",
  "cretania-reblured-1-20-1-1-3-0",
  "cretania-seamless-loading-screen-2-0-3-1-20-1-forge",
  "cretania-betterthirdperson-forge-1-20-1-9-0",
  "cretania-auto-third-person-forge-1-20-1-2-1",
  "cretania-darkmodeeverywhere-1-20-1-1-2-4",
  "cretania-stylisheffects-v8-0-2-1-20-1-forge",
  "cretania-travelerstitles-1-20-forge-4-0-2",
  "cretania-cleanswing-1-20-1-8",
  "cretania-betterf3-7-0-2-forge-1-20-1",
  "cretania-nof3",
  "cretania-coroutil-forge-1-20-1-1-3-7",
]);

const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
const original = data.modpacks[0];

// Backup
fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2));
console.log("✓ Backup guardado en manifest.backup.json");

// --- NORMAL PACK ---
const normalPack = {
  ...original,
  id: "hardrock-normal",
  name: "HardRock TFC4 — Experiencia Completa",
  subtitle: "Supervivencia extrema con TerraFirmaCraft + Create + Forge 1.20.1",
  description: "Modpack de supervivencia hardcore con TerraFirmaCraft 4, Create, Mekanism, Immersive Engineering y más de 300 mods. Incluye shaders, efectos visuales y física avanzada. Requiere mínimo 8 GB de RAM asignados.",
  public: true,
  allowedUuids: [],
  allowUserMods: false,
  version: "1.0.0",
  optionalMods: [],
  patchNotes: [{
    version: "1.0.0",
    date: "13 de Abril, 2026",
    categories: [
      { type: "added", title: "Nuevo", icon: "+", entries: [
        { text: "Lanzamiento oficial HardRock TFC4 en Lucerion" },
        { text: "Optimizado para 100 jugadores simultáneos" },
        { text: "Traducción completa al español (1059 entradas)" },
        { text: "330 mods: Create, Mekanism, TFC, IE y más" }
      ]},
      { type: "improved", title: "Mejorado", icon: "⬆", entries: [
        { text: "FerriteCore y ModernFix con máxima optimización" },
        { text: "Entity culling optimizado para servidores poblados" },
        { text: "Chunk loading mejorado para conexiones estables" }
      ]}
    ]
  }]
};

// --- LITE PACK ---
const liteRequired = [];
const liteOptional = [];
for (const mod of original.mods) {
  if (HEAVY_CLIENT_MODS.has(mod.id)) {
    liteOptional.push({
      ...mod,
      name: mod.id.replace(/^cretania-/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: "Mod visual/estético — desactivado en Lite para ahorrar RAM",
      default: false
    });
  } else {
    liteRequired.push(mod);
  }
}

// Lite no lleva shaderpacks zip
const liteZips = (original.zips || []).filter(z => z.id !== "shaderpacks");

const litePack = {
  ...original,
  id: "hardrock-lite",
  name: "HardRock TFC4 — Lite",
  subtitle: "Supervivencia TFC optimizada para PCs modestos — Forge 1.20.1",
  description: "Versión ligera: sin shaders, efectos reducidos, arranque rápido. Compatible 100% con el servidor. Recomendado: 4-6 GB de RAM.",
  public: true,
  allowedUuids: [],
  allowUserMods: false,
  version: "1.0.0",
  mods: liteRequired,
  optionalMods: liteOptional,
  zips: liteZips,
  patchNotes: [{
    version: "1.0.0",
    date: "13 de Abril, 2026",
    categories: [
      { type: "added", title: "Nuevo", icon: "+", entries: [
        { text: "Versión Lite para PCs modestos" },
        { text: "Sin shaders ni efectos visuales pesados" },
        { text: "100% compatible con el servidor HardRock" },
        { text: "Arranque rápido, bajo consumo de RAM (4-6 GB)" }
      ]},
      { type: "improved", title: "Optimizaciones", icon: "⬆", entries: [
        { text: "Physics Mod, Ambient Sounds y Weather2 opcionales" },
        { text: "Embeddium configurado para rendimiento máximo" },
        { text: "Entity culling agresivo para mejor FPS" }
      ]}
    ]
  }]
};

// --- WRITE NEW MANIFEST ---
const newManifest = {
  formatVersion: 2,
  launcher: data.launcher || {
    version: "1.0.0",
    assetName: "CretaniaLauncher.exe",
    releaseApiUrl: "https://api.github.com/repos/juyliantamayo/launchercretania/releases/latest",
    patchNotes: []
  },
  modpacks: [normalPack, litePack]
};

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(newManifest, null, 2) + "\n");

console.log("");
console.log("╔══════════════════════════════════════════════════╗");
console.log("║   ✅ MANIFEST ACTUALIZADO CON 2 MODPACKS        ║");
console.log("╠══════════════════════════════════════════════════╣");
console.log(`║  Normal: ${normalPack.mods.length} mods + ${normalPack.optionalMods.length} opcionales`.padEnd(51) + "║");
console.log(`║  Lite:   ${litePack.mods.length} mods + ${litePack.optionalMods.length} opcionales`.padEnd(51) + "║");
console.log(`║  ZIPs Normal: ${normalPack.zips.length} | ZIPs Lite: ${litePack.zips.length}`.padEnd(51) + "║");
console.log("╚══════════════════════════════════════════════════╝");
console.log("");
console.log("Ahora ejecuta: node generate-manifest.js --enc-only");
