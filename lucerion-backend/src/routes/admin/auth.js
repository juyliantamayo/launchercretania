/**
 * routes/admin/auth.js
 *
 *   POST /admin/login   → obtiene JWT
 */

const express = require("express");
const router  = express.Router();

const Admin          = require("../../models/Admin");
const { signToken }  = require("../../middleware/auth");

// POST /admin/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "username y password requeridos" });
  }

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const ok = await admin.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const token = signToken({ id: admin._id, username: admin.username, role: admin.role });
    res.json({ token, role: admin.role });
  } catch (err) {
    console.error("[auth] Error en login:", err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;
