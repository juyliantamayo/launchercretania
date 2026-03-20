/**
 * routes/admin/mods.js
 *
 * CRUD de mods del modpack. Requiere JWT de admin.
 *
 *   POST   /admin/mods/upload            → sube un JAR nuevo y lo agrega al modpack
 *   POST   /admin/mods/replace           → reemplaza un JAR (old → new) con bump de versión
 *   DELETE /admin/mods/:modpackId/:modId → elimina un mod del modpack (y el JAR del disco)
 *   GET    /admin/mods/:modpackId        → lista mods del modpack
 */

const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const router  = express.Router();

const Modpack             = require("../../models/Modpack");
const { requireAuth }     = require("../../middleware/auth");
const { sha1OfFile, makeModId, bumpPatch, spanishDate } = require("../../utils/helpers");

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "./uploads");

// Asegurar que la carpeta uploads exista
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: guarda el archivo con su nombre original en UPLOADS_DIR
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => cb(null, file.originalname)
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".jar")) {
      // En multer 2.x pasar false rechaza el archivo sin lanzar excepción
      return cb(null, false);
    }
    cb(null, true);
  }
});

// ─── GET /admin/mods/:modpackId ─────────────────────────────────────────────

router.get("/:modpackId", requireAuth, async (req, res) => {
  try {
    const modpack = await Modpack.findOne({ id: req.params.modpackId }).lean();
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });
    res.json({ mods: modpack.mods, optionalMods: modpack.optionalMods });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin/mods/upload ─────────────────────────────────────────────────
// Body (multipart):
//   jar          → archivo .jar
//   modpackId    → id del modpack (ej: "cretania")
//   optional     → "true" | "false"  (si es mod opcional)
//   patchNote    → texto de la nota de parche (opcional)

router.post("/upload", requireAuth, upload.single("jar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo jar requerido. Solo se permiten archivos .jar" });

  const { modpackId = "cretania", optional = "false", patchNote = "" } = req.body;
  const isOptional = optional === "true";

  try {
    const modpack = await Modpack.findOne({ id: modpackId });
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });

    const filename = req.file.originalname;
    const filePath = path.join(UPLOADS_DIR, filename);
    const sha1     = sha1OfFile(filePath);
    const size     = fs.statSync(filePath).size;
    const relPath  = `mods/${filename}`;
    const modId    = makeModId(relPath);

    const newMod = { id: modId, file: relPath, sha1, size };

    const targetArray = isOptional ? modpack.optionalMods : modpack.mods;
    // Evitar duplicados por nombre de archivo
    const dupIndex = targetArray.findIndex((m) => path.basename(m.file) === filename);
    if (dupIndex >= 0) {
      targetArray[dupIndex] = newMod;
    } else {
      targetArray.push(newMod);
    }

    // Bump versión y patch note
    const oldVersion = modpack.version;
    modpack.version  = bumpPatch(oldVersion);

    if (patchNote || filename) {
      const note = patchNote || `${filename.replace(/-[\d.+]+\.jar$/, "").replace(/[_-]/g, " ")} agregado`;
      modpack.patchNotes.unshift({
        version: modpack.version,
        date: spanishDate(),
        categories: [{ type: "added", title: "Nuevo", icon: "+", entries: [{ text: note }] }]
      });
    }

    if (isOptional) {
      modpack.markModified("optionalMods");
    } else {
      modpack.markModified("mods");
    }
    modpack.markModified("patchNotes");

    await modpack.save();

    res.json({
      ok: true,
      mod: newMod,
      version: { old: oldVersion, new: modpack.version }
    });
  } catch (err) {
    // Limpiar archivo si falló la BD
    try { fs.unlinkSync(path.join(UPLOADS_DIR, req.file.originalname)); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin/mods/replace ────────────────────────────────────────────────
// Body (multipart):
//   jar          → archivo .jar nuevo
//   modpackId    → id del modpack
//   oldFile      → nombre del .jar a reemplazar (ej: "NombreMod-1.0.0.jar")
//   optional     → "true" | "false"
//   patchNote    → texto de la nota de parche (opcional)
//   deleteOld    → "true" | "false"  (si borrar el JAR viejo del disco, default true)

router.post("/replace", requireAuth, upload.single("jar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo jar requerido. Solo se permiten archivos .jar" });

  const {
    modpackId = "cretania",
    oldFile,
    optional  = "false",
    patchNote = "",
    deleteOld = "true"
  } = req.body;

  if (!oldFile) return res.status(400).json({ error: "oldFile requerido" });

  try {
    const modpack = await Modpack.findOne({ id: modpackId });
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });

    const isOptional  = optional === "true";
    const targetArray = isOptional ? modpack.optionalMods : modpack.mods;
    const oldIndex    = targetArray.findIndex((m) => path.basename(m.file) === oldFile);

    if (oldIndex === -1) {
      return res.status(404).json({ error: `Mod '${oldFile}' no encontrado en el modpack` });
    }

    const newFilename = req.file.originalname;
    const newFilePath = path.join(UPLOADS_DIR, newFilename);
    const sha1        = sha1OfFile(newFilePath);
    const size        = fs.statSync(newFilePath).size;
    const relPath     = `mods/${newFilename}`;
    const modId       = makeModId(relPath);

    targetArray[oldIndex] = { id: modId, file: relPath, sha1, size };

    // Eliminar JAR viejo del disco si se solicita y es diferente
    if (deleteOld === "true" && oldFile !== newFilename) {
      const oldPath = path.join(UPLOADS_DIR, oldFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const oldVersion = modpack.version;
    modpack.version  = bumpPatch(oldVersion);

    const note = patchNote ||
      `${newFilename.replace(/-[\d.+]+\.jar$/, "").replace(/[_-]/g, " ")} actualizado`;
    modpack.patchNotes.unshift({
      version: modpack.version,
      date: spanishDate(),
      categories: [{ type: "changed", title: "Mejoras", icon: "↑", entries: [{ text: note }] }]
    });

    if (isOptional) {
      modpack.markModified("optionalMods");
    } else {
      modpack.markModified("mods");
    }
    modpack.markModified("patchNotes");
    await modpack.save();

    res.json({
      ok: true,
      replaced: { old: oldFile, new: newFilename },
      version: { old: oldVersion, new: modpack.version }
    });
  } catch (err) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, req.file.originalname)); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /admin/mods/:modpackId/:modId ───────────────────────────────────

router.delete("/:modpackId/:modId", requireAuth, async (req, res) => {
  try {
    const modpack = await Modpack.findOne({ id: req.params.modpackId });
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });

    const { modId } = req.params;

    let removed = null;
    const modsIdx = modpack.mods.findIndex((m) => m.id === modId);
    if (modsIdx >= 0) {
      [removed] = modpack.mods.splice(modsIdx, 1);
      modpack.markModified("mods");
    } else {
      const optIdx = modpack.optionalMods.findIndex((m) => m.id === modId);
      if (optIdx >= 0) {
        [removed] = modpack.optionalMods.splice(optIdx, 1);
        modpack.markModified("optionalMods");
      }
    }

    if (!removed) return res.status(404).json({ error: "Mod no encontrado" });

    // Eliminar JAR del disco
    const jarPath = path.join(UPLOADS_DIR, path.basename(removed.file));
    if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath);

    const oldVersion = modpack.version;
    modpack.version  = bumpPatch(oldVersion);
    modpack.patchNotes.unshift({
      version: modpack.version,
      date: spanishDate(),
      categories: [{
        type: "removed", title: "Eliminado", icon: "-",
        entries: [{ text: `${path.basename(removed.file)} eliminado` }]
      }]
    });
    modpack.markModified("patchNotes");

    await modpack.save();
    res.json({ ok: true, removed, version: { old: oldVersion, new: modpack.version } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
