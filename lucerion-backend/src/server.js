require("dotenv").config();

const express     = require("express");
const helmet      = require("helmet");
const cors        = require("cors");
const rateLimit   = require("express-rate-limit");
const path        = require("path");
const fs          = require("fs");
const mongoose    = require("mongoose");

// ─── Rutas ───────────────────────────────────────────────────────────────────
const manifestRoutes  = require("./routes/manifest");
const adminAuthRoutes = require("./routes/admin/auth");
const adminModsRoutes = require("./routes/admin/mods");
const adminModpacksRoutes = require("./routes/admin/modpacks");
const adminLauncherRoutes = require("./routes/admin/launcher");

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// ─── Garantizar carpeta uploads ──────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "./uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Seguridad básica ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Rate limit global (600 req / 15 min por IP)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intenta más tarde" }
}));

// Rate limit más estricto en el endpoint de login
app.use("/admin/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos de login" }
}));

// ─── Rutas públicas (consumidas por el launcher) ─────────────────────────────
app.use("/", manifestRoutes);

// ─── Rutas de administración ─────────────────────────────────────────────────
app.use("/admin",          adminAuthRoutes);
app.use("/admin/mods",     adminModsRoutes);
app.use("/admin/modpacks", adminModpacksRoutes);
app.use("/admin/launcher", adminLauncherRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime()
  });
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

// ─── Error handler global ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[server] Error no capturado:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Error interno" });
});

// ─── Conexión a MongoDB y arranque ───────────────────────────────────────────
async function start() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lucerion";

  console.log("[server] Conectando a MongoDB:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("[server] MongoDB conectado");

  // Seed inicial: crear datos por defecto si la BD está vacía
  await seedDefaults();

  app.listen(PORT, HOST, () => {
    console.log(`[server] Lucerion Backend corriendo en http://${HOST}:${PORT}`);
    console.log(`[server] Manifest público:   http://${HOST}:${PORT}/manifest.enc`);
    console.log(`[server] Admin login:         POST http://${HOST}:${PORT}/admin/login`);
  });
}

async function seedDefaults() {
  const Admin      = require("./models/Admin");
  const Modpack    = require("./models/Modpack");
  const LauncherMeta = require("./models/LauncherMeta");

  // Crear admin por defecto si no existe ninguno
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0) {
    await Admin.create({ username: "admin", password: "admin1234", role: "superadmin" });
    console.log("[seed] Admin por defecto creado — usuario: admin / contraseña: admin1234");
    console.log("[seed] ⚠  CAMBIA LA CONTRASEÑA tras el primer login");
  }

  // Crear LauncherMeta si no existe
  const launcherMeta = await LauncherMeta.findById("launcher");
  if (!launcherMeta) {
    await LauncherMeta.create({
      _id: "launcher",
      version: "1.0.1",
      assetName: "LucerionLauncher.exe",
      releaseApiUrl: "",
      patchNotes: []
    });
    console.log("[seed] LauncherMeta creado con valores por defecto");
  }

  // Crear modpack Cretania si no existe
  const modpackCount = await Modpack.countDocuments();
  if (modpackCount === 0) {
    await Modpack.create({
      id:            "cretania",
      name:          "Cretania",
      subtitle:      "Mundo de Ingenieros",
      image:         "LOGO_CRETANIA_2.png",
      public:        true,
      allowedUuids:  [],
      version:       "1.0.0",
      minecraft:     "1.20.1",
      loader:        "fabric",
      loaderType:    "fabric",
      loaderVersion: "0.18.4",
      mods:          [],
      optionalMods:  [],
      patchNotes:    []
    });
    console.log("[seed] Modpack 'cretania' creado vacío — importa los mods con el CLI");
  }
}

start().catch((err) => {
  console.error("[server] Error fatal al iniciar:", err);
  process.exit(1);
});
