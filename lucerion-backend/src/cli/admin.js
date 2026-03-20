#!/usr/bin/env node
/**
 * cli/admin.js — Herramienta de administración por línea de comandos
 *
 * Uso:
 *   node src/cli/admin.js <comando> [opciones]
 *
 * Comandos:
 *   import-manifest <ruta/manifest.json>   → importa un manifest.json a MongoDB
 *   add-mod <modpackId> <ruta/mod.jar>     → agrega un JAR al modpack
 *   remove-mod <modpackId> <modId>         → elimina un mod del modpack
 *   list-mods <modpackId>                  → lista todos los mods del modpack
 *   list-modpacks                          → lista todos los modpacks
 *   set-version <modpackId> <version>      → fuerza la versión del modpack
 *   create-admin <username> <password>     → crea un admin nuevo
 *   change-password <username> <password>  → cambia la contraseña de un admin
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");
const crypto   = require("crypto");

const Modpack      = require("../models/Modpack");
const LauncherMeta = require("../models/LauncherMeta");
const Admin        = require("../models/Admin");
const { sha1OfFile, makeModId, bumpPatch, spanishDate } = require("../utils/helpers");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lucerion";
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "./uploads");

// ─── Conexión ────────────────────────────────────────────────────────────────

async function connect() {
  await mongoose.connect(MONGODB_URI);
}

async function disconnect() {
  await mongoose.disconnect();
}

// ─── Comandos ────────────────────────────────────────────────────────────────

/**
 * Importa un manifest.json (formato v2) completo a MongoDB.
 * Reemplaza los modpacks existentes con los datos del archivo.
 * Copia los JARs referenciados si existen en la misma carpeta.
 */
async function importManifest(manifestPath) {
  const absPath = path.resolve(manifestPath);
  if (!fs.existsSync(absPath)) {
    console.error("❌  Archivo no encontrado:", absPath);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(absPath, "utf-8"));
  if (raw.formatVersion !== 2 || !Array.isArray(raw.modpacks)) {
    console.error("❌  El archivo no es un manifest v2 válido");
    process.exit(1);
  }

  const manifestDir = path.dirname(absPath);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  // Actualizar LauncherMeta si existe la sección launcher
  if (raw.launcher) {
    await LauncherMeta.findByIdAndUpdate(
      "launcher",
      { $set: raw.launcher },
      { upsert: true, setDefaultsOnInsert: true }
    );
    console.log("✓  LauncherMeta actualizado");
  }

  for (const mp of raw.modpacks) {
    // Copiar JARs al directorio de uploads si están disponibles localmente
    const allFiles = [
      ...(mp.mods || []),
      ...(mp.optionalMods || []),
      ...(mp.resourcepacks || []),
      ...(mp.datasources || []),
      ...(mp.datapacks || []),
      ...(mp.folders || [])
    ];

    let copied = 0;
    for (const entry of allFiles) {
      const filename = path.basename(entry.file);
      const srcPath  = path.join(manifestDir, entry.file);
      const destPath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        copied++;
      }
    }
    if (copied > 0) console.log(`  → ${copied} archivo(s) copiado(s) a uploads/`);

    // Upsert del modpack
    const modpackData = {
      ...mp,
      baseUrl: "" // se genera dinámicamente al servir
    };
    await Modpack.findOneAndUpdate(
      { id: mp.id },
      { $set: modpackData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`✓  Modpack '${mp.id}' importado (${(mp.mods || []).length} mods)`);
  }

  console.log("✅  Importación completada");
}

/**
 * Agrega un JAR al modpack copiándolo a uploads/ y actualizando la BD.
 */
async function addMod(modpackId, jarPath, optional = false) {
  const absJarPath = path.resolve(jarPath);
  if (!fs.existsSync(absJarPath)) {
    console.error("❌  JAR no encontrado:", absJarPath);
    process.exit(1);
  }

  const modpack = await Modpack.findOne({ id: modpackId });
  if (!modpack) {
    console.error(`❌  Modpack '${modpackId}' no encontrado en la BD`);
    process.exit(1);
  }

  const filename = path.basename(absJarPath);
  const destPath = path.join(UPLOADS_DIR, filename);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (absJarPath !== destPath) {
    fs.copyFileSync(absJarPath, destPath);
  }

  const sha1    = sha1OfFile(destPath);
  const size    = fs.statSync(destPath).size;
  const relPath = `mods/${filename}`;
  const modId   = makeModId(relPath);

  const newMod = { id: modId, file: relPath, sha1, size };

  const targetArray = optional ? modpack.optionalMods : modpack.mods;
  const dupIndex    = targetArray.findIndex((m) => path.basename(m.file) === filename);
  if (dupIndex >= 0) {
    targetArray[dupIndex] = newMod;
    console.log(`~ Mod actualizado: ${filename}`);
  } else {
    targetArray.push(newMod);
    console.log(`+ Mod agregado: ${filename}`);
  }

  const oldVersion = modpack.version;
  modpack.version  = bumpPatch(oldVersion);
  modpack.patchNotes.unshift({
    version: modpack.version,
    date: spanishDate(),
    categories: [{ type: "added", title: "Nuevo", icon: "+", entries: [{ text: `${filename} agregado` }] }]
  });

  if (optional) modpack.markModified("optionalMods");
  else          modpack.markModified("mods");
  modpack.markModified("patchNotes");
  await modpack.save();

  console.log(`✅  ${modpackId} v${oldVersion} → v${modpack.version}`);
}

/**
 * Elimina un mod del modpack (por id o por nombre de archivo).
 */
async function removeMod(modpackId, modIdOrFile) {
  const modpack = await Modpack.findOne({ id: modpackId });
  if (!modpack) {
    console.error(`❌  Modpack '${modpackId}' no encontrado`);
    process.exit(1);
  }

  let removed = null;
  for (const arr of [modpack.mods, modpack.optionalMods]) {
    const idx = arr.findIndex(
      (m) => m.id === modIdOrFile || path.basename(m.file) === modIdOrFile
    );
    if (idx >= 0) {
      [removed] = arr.splice(idx, 1);
      break;
    }
  }

  if (!removed) {
    console.error(`❌  Mod '${modIdOrFile}' no encontrado en ${modpackId}`);
    process.exit(1);
  }

  const jarPath = path.join(UPLOADS_DIR, path.basename(removed.file));
  if (fs.existsSync(jarPath)) {
    fs.unlinkSync(jarPath);
    console.log("🗑  JAR eliminado del disco:", path.basename(removed.file));
  }

  const oldVersion = modpack.version;
  modpack.version  = bumpPatch(oldVersion);
  modpack.patchNotes.unshift({
    version: modpack.version,
    date: spanishDate(),
    categories: [{ type: "removed", title: "Eliminado", icon: "-", entries: [{ text: `${path.basename(removed.file)} eliminado` }] }]
  });
  modpack.markModified("mods");
  modpack.markModified("optionalMods");
  modpack.markModified("patchNotes");
  await modpack.save();

  console.log(`✅  Mod eliminado. ${modpackId} v${oldVersion} → v${modpack.version}`);
}

async function listMods(modpackId) {
  const modpack = await Modpack.findOne({ id: modpackId }).lean();
  if (!modpack) { console.error(`❌  Modpack '${modpackId}' no encontrado`); process.exit(1); }

  console.log(`\nModpack: ${modpack.name} (${modpack.id}) v${modpack.version}`);
  console.log(`\nMods (${modpack.mods.length}):`);
  modpack.mods.forEach((m) => console.log(`  [${m.id}] ${path.basename(m.file)} — ${m.sha1.slice(0,8)}… ${(m.size/1024).toFixed(0)}KB`));
  if (modpack.optionalMods.length) {
    console.log(`\nMods opcionales (${modpack.optionalMods.length}):`);
    modpack.optionalMods.forEach((m) => console.log(`  [${m.id}] ${path.basename(m.file)} — ${m.sha1.slice(0,8)}… ${(m.size/1024).toFixed(0)}KB`));
  }
}

async function listModpacks() {
  const modpacks = await Modpack.find({}).lean();
  if (!modpacks.length) { console.log("Sin modpacks en la BD"); return; }
  modpacks.forEach((mp) => {
    console.log(`  ${mp.id} — ${mp.name} v${mp.version} [${mp.mods.length} mods]`);
  });
}

async function setVersion(modpackId, version) {
  const modpack = await Modpack.findOneAndUpdate({ id: modpackId }, { $set: { version } }, { new: true });
  if (!modpack) { console.error(`❌  Modpack '${modpackId}' no encontrado`); process.exit(1); }
  console.log(`✅  ${modpackId} versión actualizada a ${version}`);
}

async function createAdmin(username, password) {
  const existing = await Admin.findOne({ username });
  if (existing) { console.error(`❌  Ya existe un admin con username '${username}'`); process.exit(1); }
  await Admin.create({ username, password, role: "superadmin" });
  console.log(`✅  Admin '${username}' creado`);
}

async function changePassword(username, newPassword) {
  const admin = await Admin.findOne({ username });
  if (!admin) { console.error(`❌  Admin '${username}' no encontrado`); process.exit(1); }
  admin.password = newPassword;
  await admin.save();
  console.log(`✅  Contraseña de '${username}' actualizada`);
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!cmd) {
    console.log(`
Lucerion Backend CLI
────────────────────
Comandos disponibles:

  import-manifest <ruta/manifest.json>   Importa un manifest.json completo a MongoDB
  add-mod <modpackId> <ruta.jar>         Agrega un JAR al modpack
  add-optional <modpackId> <ruta.jar>    Agrega un JAR como mod opcional
  remove-mod <modpackId> <idOrFilename>  Elimina un mod del modpack
  list-mods <modpackId>                  Lista mods del modpack
  list-modpacks                          Lista todos los modpacks
  set-version <modpackId> <version>      Fuerza la versión del modpack
  create-admin <username> <password>     Crea un nuevo admin
  change-password <username> <password>  Cambia contraseña de un admin
`);
    process.exit(0);
  }

  await connect();

  try {
    switch (cmd) {
      case "import-manifest":
        if (!args[0]) { console.error("Uso: import-manifest <ruta/manifest.json>"); process.exit(1); }
        await importManifest(args[0]);
        break;

      case "add-mod":
        if (!args[0] || !args[1]) { console.error("Uso: add-mod <modpackId> <ruta.jar>"); process.exit(1); }
        await addMod(args[0], args[1], false);
        break;

      case "add-optional":
        if (!args[0] || !args[1]) { console.error("Uso: add-optional <modpackId> <ruta.jar>"); process.exit(1); }
        await addMod(args[0], args[1], true);
        break;

      case "remove-mod":
        if (!args[0] || !args[1]) { console.error("Uso: remove-mod <modpackId> <modId|filename>"); process.exit(1); }
        await removeMod(args[0], args[1]);
        break;

      case "list-mods":
        if (!args[0]) { console.error("Uso: list-mods <modpackId>"); process.exit(1); }
        await listMods(args[0]);
        break;

      case "list-modpacks":
        await listModpacks();
        break;

      case "set-version":
        if (!args[0] || !args[1]) { console.error("Uso: set-version <modpackId> <version>"); process.exit(1); }
        await setVersion(args[0], args[1]);
        break;

      case "create-admin":
        if (!args[0] || !args[1]) { console.error("Uso: create-admin <username> <password>"); process.exit(1); }
        await createAdmin(args[0], args[1]);
        break;

      case "change-password":
        if (!args[0] || !args[1]) { console.error("Uso: change-password <username> <password>"); process.exit(1); }
        await changePassword(args[0], args[1]);
        break;

      default:
        console.error(`❌  Comando desconocido: ${cmd}`);
        process.exit(1);
    }
  } finally {
    await disconnect();
  }
}

main().catch((err) => {
  console.error("❌  Error fatal:", err.message);
  process.exit(1);
});
