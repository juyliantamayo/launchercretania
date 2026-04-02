// Genera imágenes placeholder para modpacks sin imagen
// Usa Canvas para crear un gradiente con la inicial del pack

const cache = new Map();

const PALETTES = [
  ["#1a1a2e", "#16213e", "#D5A84B"],
  ["#0f0c29", "#302b63", "#a78bfa"],
  ["#0d1117", "#1b3a4b", "#4a8fc4"],
  ["#1a1a2e", "#2d132c", "#f87171"],
  ["#0b0f19", "#1b2838", "#34d399"],
  ["#1c1c3c", "#3b1f5e", "#e879f9"],
  ["#141e30", "#243b55", "#fbbf24"],
  ["#0f2027", "#203a43", "#2dd4bf"],
];

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Genera un data-URL placeholder para un modpack.
 * @param {string} name  – nombre del modpack
 * @param {number} w     – ancho en px (default 400)
 * @param {number} h     – alto en px  (default 225)
 * @returns {string} data:image/png;base64,...
 */
export function placeholder(name, w = 400, h = 225) {
  const key = `${name}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key);

  const pal = PALETTES[hashName(name) % PALETTES.length];
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");

  // Gradiente de fondo
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, pal[0]);
  g.addColorStop(1, pal[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Patrón sutil de cuadrícula
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const step = Math.max(20, Math.round(w / 12));
  for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Letra central
  const letter = (name || "?").charAt(0).toUpperCase();
  const fontSize = Math.round(Math.min(w, h) * 0.42);
  ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Sombra
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = fontSize * 0.15;
  ctx.fillStyle = pal[2];
  ctx.fillText(letter, w / 2, h / 2);
  ctx.shadowBlur = 0;

  // Borde inferior con acento
  ctx.fillStyle = pal[2];
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, h - 4, w, 4);
  ctx.globalAlpha = 1;

  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
