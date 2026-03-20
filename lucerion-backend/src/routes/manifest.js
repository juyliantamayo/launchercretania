/**
 * routes/manifest.js
 *
 * Endpoints PÚBLICOS consumidos por el launcher (sin auth):
 *
 *   GET /manifest.json   → manifiesto en claro  (formato v2)
 *   GET /manifest.enc    → manifiesto cifrado    (AES-256-GCM, mismo algoritmo que manifest-crypto.js del launcher)
 *   GET /files/:filename → descarga de un JAR/asset (drop-in de la URL de GitHub Releases)
 */

const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const router   = express.Router();

const Modpack      = require("../models/Modpack");
const LauncherMeta = require("../models/LauncherMeta");
const { encryptManifest } = require("../utils/crypto");

const MANIFEST_SECRET = process.env.MANIFEST_SECRET || "cretania-manifest-2026-change-this-secret";
const PUBLIC_BASE_URL  = (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const UPLOADS_DIR      = path.resolve(process.env.UPLOADS_DIR || "./uploads");

// ─── Helper: construye el objeto manifest v2 desde MongoDB ─────────────────

async function buildManifestObject() {
  const [modpacks, launcherMeta] = await Promise.all([
    Modpack.find({}).lean(),
    LauncherMeta.findById("launcher").lean()
  ]);

  const launcher = launcherMeta || {
    version: "1.0.0",
    assetName: "LucerionLauncher.exe",
    releaseApiUrl: "",
    patchNotes: []
  };

  // Reescribir baseUrl con la URL pública de este servidor
  const normalizedModpacks = modpacks.map((mp) => ({
    ...mp,
    _id: undefined,
    __v: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    // Los mods se descargan desde /files/<nombre> en este servidor
    baseUrl: `${PUBLIC_BASE_URL}/files`
  }));

  return {
    formatVersion: 2,
    launcher: {
      version:       launcher.version,
      assetName:     launcher.assetName,
      releaseApiUrl: launcher.releaseApiUrl,
      patchNotes:    launcher.patchNotes || []
    },
    modpacks: normalizedModpacks
  };
}

// ─── GET /manifest.json ─────────────────────────────────────────────────────

router.get("/manifest.json", async (req, res) => {
  try {
    const manifest = await buildManifestObject();
    res.setHeader("Cache-Control", "no-store");
    res.json(manifest);
  } catch (err) {
    console.error("[manifest] Error generando manifest.json:", err.message);
    res.status(500).json({ error: "Error interno generando manifiesto" });
  }
});

// ─── GET /manifest.enc ──────────────────────────────────────────────────────

router.get("/manifest.enc", async (req, res) => {
  try {
    const manifest  = await buildManifestObject();
    const encrypted = encryptManifest(manifest, MANIFEST_SECRET);
    res.setHeader("Cache-Control", "no-store");
    res.json(encrypted);
  } catch (err) {
    console.error("[manifest] Error generando manifest.enc:", err.message);
    res.status(500).json({ error: "Error interno generando manifiesto cifrado" });
  }
});

// ─── GET /files/:filename ────────────────────────────────────────────────────
// Sirve JARs y otros assets subidos por el admin.
// El launcher construye la URL como:  baseUrl + "/" + path.basename(entry.file)

router.get("/files/:filename", (req, res) => {
  // Sanitizar: evitar path traversal
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Archivo no encontrado" });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

module.exports = router;
