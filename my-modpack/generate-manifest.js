/**
 * generate-manifest.js
 *
 * Escanea la carpeta mods/ y genera manifest.json con SHA1 y tamaño.
 *
 * Uso:
 *   node generate-manifest.js
 *
 * Cada vez que añadas o quites mods de la carpeta mods/, corre este script
 * para actualizar el manifest antes de subir a git.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MODS_DIR = path.join(__dirname, "mods");
const MANIFEST_PATH = path.join(__dirname, "manifest.json");

// Configuración base del modpack
const BASE = {
  version: "1.0.0",
  minecraft: "1.20.1",
  loader: "fabric",
  loaderVersion: "0.18.4"
};

function sha1File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha1").update(data).digest("hex");
}

function generateManifest() {
  // Leer manifest existente para preservar version bump si existe
  let existing = BASE;
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
      existing = { ...BASE, version: parsed.version || BASE.version };
    } catch (e) { /* usar BASE */ }
  }

  // Asegurar que existe la carpeta mods
  if (!fs.existsSync(MODS_DIR)) {
    fs.mkdirSync(MODS_DIR, { recursive: true });
    console.log("📁 Carpeta mods/ creada.");
  }

  // Escanear .jar
  const files = fs.readdirSync(MODS_DIR).filter(f => f.endsWith(".jar")).sort();

  if (files.length === 0) {
    console.log("⚠  No hay archivos .jar en mods/. El manifest quedará sin mods.");
  }

  const mods = files.map(file => {
    const fullPath = path.join(MODS_DIR, file);
    const stats = fs.statSync(fullPath);
    const sha1 = sha1File(fullPath);

    // Generar un id limpio del nombre del archivo
    const id = file
      .replace(/\.jar$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .toLowerCase();

    console.log(`  ✓ ${file} (${(stats.size / 1024).toFixed(0)} KB) → SHA1: ${sha1.substring(0, 12)}…`);

    return {
      id,
      file: "mods/" + file,
      sha1,
      size: stats.size
    };
  });

  const manifest = {
    ...existing,
    mods
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n✅ manifest.json generado: ${mods.length} mod(s), Fabric ${manifest.loaderVersion}, MC ${manifest.minecraft}`);
  console.log("   Ahora sube a git: git add . && git commit -m \"update mods\" && git push");
}

generateManifest();
