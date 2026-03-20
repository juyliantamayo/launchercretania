const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "cambia-esta-clave-en-produccion";
const JWT_EXPIRY = "24h";

/**
 * Genera un token JWT para un admin.
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Middleware: verifica JWT en header Authorization: Bearer <token>
 * Si es válido, adjunta req.admin y sigue.
 */
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token requerido" });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/**
 * Middleware: solo superadmin puede continuar.
 */
function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== "superadmin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
}

module.exports = { signToken, requireAuth, requireSuperAdmin };
