/**
 * clean-and-reset.js — Limpia mods viejos y resetea el sync
 * Ejecutar: cd mc-launcher && node ../my-modpack/clean-and-reset.js
 */
const fs = require("fs");
const path = require("path");

const GAME_DIR = path.join(process.env.APPDATA, ".lucerion-minecraft");
const MODS_DIR = path.join(GAME_DIR, "mods");
const SYNC_STATE = path.join(GAME_DIR, ".launcher-sync-state.json");
const ZIP_STATE = path.join(GAME_DIR, ".launcher-zip-state.json");
const MANIFEST_CACHE = path.join(GAME_DIR, "manifest-cache.json");
const BACKUP_DIR = path.join(GAME_DIR, "mods-old-backup");

console.log("🧹 Limpieza de mods y reset de sync\n");

// 1. Backup de mods actuales
if (fs.existsSync(MODS_DIR)) {
  const mods = fs.readdirSync(MODS_DIR).filter(f => f.endsWith(".jar"));
  console.log(`Encontrados ${mods.length} JARs en mods/`);
  
  // Contar fabric vs forge
  const fabric = mods.filter(f => f.toLowerCase().includes("fabric"));
  const forge = mods.filter(f => f.toLowerCase().includes("forge"));
  const other = mods.length - fabric.length - forge.length;
  console.log(`  Fabric: ${fabric.length} | Forge: ${forge.length} | Otros: ${other}`);
  
  // Crear backup
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  let moved = 0;
  for (const mod of mods) {
    try {
      fs.renameSync(path.join(MODS_DIR, mod), path.join(BACKUP_DIR, mod));
      moved++;
    } catch (e) {
      // Si falla rename, copiar y borrar
      try {
        fs.copyFileSync(path.join(MODS_DIR, mod), path.join(BACKUP_DIR, mod));
        fs.unlinkSync(path.join(MODS_DIR, mod));
        moved++;
      } catch (e2) { console.warn(`  ⚠ No se pudo mover: ${mod}`); }
    }
  }
  console.log(`✓ ${moved} mods movidos a mods-old-backup/`);
} else {
  console.log("No se encontró carpeta mods/");
  fs.mkdirSync(MODS_DIR, { recursive: true });
}

// 2. Limpiar sync state
for (const f of [SYNC_STATE, ZIP_STATE, MANIFEST_CACHE]) {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log(`✓ Eliminado: ${path.basename(f)}`);
  }
}

// 3. Limpiar versiones de modpack cacheadas
const userData = path.join(process.env.APPDATA, "lucerion-launcher");
if (fs.existsSync(userData)) {
  const versionFiles = fs.readdirSync(userData).filter(f => f.startsWith("modpack-version-"));
  for (const f of versionFiles) {
    fs.unlinkSync(path.join(userData, f));
    console.log(`✓ Eliminado cache: ${f}`);
  }
}

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║  ✅ LIMPIEZA COMPLETA                           ║");
console.log("║                                                 ║");
console.log("║  Mods viejos → mods-old-backup/                 ║");
console.log("║  Sync state reseteado                           ║");
console.log("║  Cache de manifest limpio                       ║");
console.log("║                                                 ║");
console.log("║  Ahora abre el launcher y dale Play al          ║");
console.log("║  pack HardRock TFC4 — descargará los            ║");
console.log("║  330 mods Forge correctos desde cero.           ║");
console.log("╚══════════════════════════════════════════════════╝");
