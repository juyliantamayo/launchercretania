/**
 * routes/admin/modpacks.js
 *
 * CRUD de modpacks.
 *
 *   GET    /admin/modpacks           → lista todos los modpacks
 *   GET    /admin/modpacks/:id       → detalle de un modpack
 *   POST   /admin/modpacks           → crea un modpack nuevo
 *   PUT    /admin/modpacks/:id       → actualiza metadatos de un modpack
 *   DELETE /admin/modpacks/:id       → elimina un modpack
 *   PUT    /admin/modpacks/:id/version → actualiza manualmente la versión
 */

const express = require("express");
const router  = express.Router();

const Modpack         = require("../../models/Modpack");
const { requireAuth } = require("../../middleware/auth");

// GET /admin/modpacks
router.get("/", requireAuth, async (_req, res) => {
  try {
    const modpacks = await Modpack.find({}).lean();
    res.json({ modpacks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/modpacks/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const modpack = await Modpack.findOne({ id: req.params.id }).lean();
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });
    res.json({ modpack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/modpacks — crear modpack
router.post("/", requireAuth, async (req, res) => {
  try {
    const { id, name, subtitle, minecraft, loader, loaderVersion, loaderType, public: isPublic } = req.body;
    if (!id || !name) return res.status(400).json({ error: "id y name requeridos" });

    const existing = await Modpack.findOne({ id });
    if (existing) return res.status(409).json({ error: `Ya existe un modpack con id '${id}'` });

    const modpack = await Modpack.create({
      id, name, subtitle, minecraft, loader, loaderVersion,
      loaderType: loaderType || loader,
      public: isPublic !== false
    });
    res.status(201).json({ ok: true, modpack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/modpacks/:id — actualizar metadatos
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const ALLOWED = [
      "name","subtitle","description","image","public","allowedUuids",
      "allowUserMods","minecraft","loader","loaderType","loaderVersion","gallery"
    ];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const modpack = await Modpack.findOneAndUpdate(
      { id: req.params.id },
      { $set: update },
      { new: true }
    );
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });
    res.json({ ok: true, modpack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/modpacks/:id/version — forzar versión manualmente
router.put("/:id/version", requireAuth, async (req, res) => {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: "version requerida" });

    const modpack = await Modpack.findOneAndUpdate(
      { id: req.params.id },
      { $set: { version } },
      { new: true }
    );
    if (!modpack) return res.status(404).json({ error: "Modpack no encontrado" });
    res.json({ ok: true, version: modpack.version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/modpacks/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await Modpack.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Modpack no encontrado" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
