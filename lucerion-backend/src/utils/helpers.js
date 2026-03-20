const crypto = require("crypto");
const fs     = require("fs");

/**
 * Calcula el SHA1 de un archivo en disco.
 */
function sha1OfFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha1").update(data).digest("hex");
}

/**
 * Calcula el SHA1 de un Buffer.
 */
function sha1OfBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

/**
 * Genera un ID de mod a partir del nombre de archivo.
 * Ej: "mods/NombreMod-1.0.0.jar" → "mods-nombremod-1-0-0"
 */
function makeModId(relativePath) {
  return relativePath
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/**
 * Incrementa la última cifra de una versión semver.
 * Ej: "1.0.7" → "1.0.8"
 */
function bumpPatch(version) {
  const parts = String(version || "1.0.0").split(".");
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return parts.join(".");
}

/**
 * Fecha legible en español. Ej: "20 de Marzo, 2026"
 */
function spanishDate() {
  const MONTHS = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];
  const d = new Date();
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

module.exports = { sha1OfFile, sha1OfBuffer, makeModId, bumpPatch, spanishDate };
