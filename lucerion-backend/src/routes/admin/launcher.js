/**
 * routes/admin/launcher.js
 *
 * Gestión de metadatos del launcher (versión, patch notes, asset URL).
 *
 *   GET  /admin/launcher         → obtiene metadatos actuales
 *   PUT  /admin/launcher         → actualiza metadatos (version, assetName, releaseApiUrl)
 *   POST /admin/launcher/patchnote → agrega una patch note al launcher
 */

const express = require("express");
const router  = express.Router();

const LauncherMeta    = require("../../models/LauncherMeta");
const { requireAuth } = require("../../middleware/auth");
const { spanishDate } = require("../../utils/helpers");

// GET /admin/launcher
router.get("/", requireAuth, async (_req, res) => {
  try {
    const meta = await LauncherMeta.findById("launcher").lean();
    res.json({ launcher: meta || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/launcher
router.put("/", requireAuth, async (req, res) => {
  try {
    const ALLOWED = ["version", "assetName", "releaseApiUrl"];
    const update  = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const meta = await LauncherMeta.findByIdAndUpdate(
      "launcher",
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, launcher: meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/launcher/patchnote
// Body: { version, date?, text, type? }
router.post("/patchnote", requireAuth, async (req, res) => {
  try {
    const { version, text, type = "changed", date } = req.body;
    if (!version || !text) {
      return res.status(400).json({ error: "version y text requeridos" });
    }

    const newNote = {
      version,
      date: date || spanishDate(),
      categories: [{
        type,
        title: type === "added" ? "Nuevo" : type === "removed" ? "Eliminado" : "Mejoras",
        icon: type === "added" ? "+" : type === "removed" ? "-" : "↑",
        entries: [{ text }]
      }]
    };

    const meta = await LauncherMeta.findByIdAndUpdate(
      "launcher",
      { $push: { patchNotes: { $each: [newNote], $position: 0 } } },
      { new: true, upsert: true }
    );
    res.json({ ok: true, launcher: meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
