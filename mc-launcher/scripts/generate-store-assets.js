/**
 * generate-store-assets.js
 *
 * Genera los assets visuales requeridos por Microsoft Store/AppX a partir de
 * logoLucerion.png (logo cuadrado) y ChatGPT_Image_*.png (banner de fondo).
 *
 * Assets de salida en store-assets/:
 *   StoreLogo.png               50×50
 *   Square44x44Logo.png         44×44
 *   Square44x44Logo.targetsize-44.png  44×44
 *   Square150x150Logo.png       150×150
 *   Wide310x150Logo.png         310×150
 *   Square310x310Logo.png       310×310
 *   SplashScreen.png            620×300
 *
 * Uso:
 *   node scripts/generate-store-assets.js
 *
 * Requisito: sharp en devDependencies (ya listado en package.json).
 */

"use strict";

const path  = require("path");
const sharp = require("sharp");
const fs    = require("fs");

const ROOT        = path.resolve(__dirname, "..");
const ASSETS_DIR  = path.join(ROOT, "store-assets");
const LOGO_SRC    = path.join(ROOT, "logoLucerion.png");
const BANNER_SRC  = (() => {
  const candidates = fs.readdirSync(ROOT).filter(f => f.startsWith("ChatGPT_Image") && f.endsWith(".png"));
  return candidates.length ? path.join(ROOT, candidates[0]) : null;
})();
const BG_COLOR    = { r: 10, g: 14, b: 26, alpha: 1 }; // #0a0e1a — dark navy matching launcher

// ─────────────────────────────────────────────────────────────────────────────
// Especificación de assets AppX/MSIX
// ─────────────────────────────────────────────────────────────────────────────
const SQUARE_ASSETS = [
  { file: "StoreLogo.png",                            w: 50,  h: 50  },
  { file: "Square44x44Logo.png",                      w: 44,  h: 44  },
  { file: "Square44x44Logo.targetsize-44.png",        w: 44,  h: 44  },
  { file: "Square150x150Logo.png",                    w: 150, h: 150 },
  { file: "Square310x310Logo.png",                    w: 310, h: 310 },
];

const WIDE_ASSETS = [
  // Para los wide/splash usamos el banner si existe, sino rellenamos con BG
  { file: "Wide310x150Logo.png", w: 310, h: 150 },
  { file: "SplashScreen.png",    w: 620, h: 300 },
];

fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redimensiona la imagen fuente manteniendo el aspect ratio y la centra
 * sobre un fondo del color de la marca.
 */
async function compositeOnBg(srcPath, w, h, outPath) {
  const logo = sharp(srcPath).resize(
    Math.min(w, h),
    Math.min(w, h),
    { fit: "inside", withoutEnlargement: false }
  );
  const logoBuf = await logo.png().toBuffer();
  const meta    = await sharp(logoBuf).metadata();

  await sharp({
    create: { width: w, height: h, channels: 4, background: BG_COLOR }
  })
    .composite([{
      input: logoBuf,
      left:  Math.floor((w - meta.width)  / 2),
      top:   Math.floor((h - meta.height) / 2),
    }])
    .png()
    .toFile(outPath);
}

/**
 * Para assets wide: usa el banner con crop+resize si existe,
 * o centra el logo sobre BG.
 */
async function compositeWide(srcPath, fallbackLogo, w, h, outPath) {
  if (srcPath) {
    await sharp(srcPath)
      .resize(w, h, { fit: "cover", position: "center" })
      .png()
      .toFile(outPath);
  } else {
    // Sin banner: logo pequeño centrado sobre fondo
    const logoSize = Math.round(h * 0.7);
    const logo = sharp(fallbackLogo).resize(logoSize, logoSize, { fit: "inside" });
    const logoBuf = await logo.png().toBuffer();
    const meta = await sharp(logoBuf).metadata();

    await sharp({
      create: { width: w, height: h, channels: 4, background: BG_COLOR }
    })
      .composite([{
        input: logoBuf,
        left:  Math.floor((w - meta.width)  / 2),
        top:   Math.floor((h - meta.height) / 2),
      }])
      .png()
      .toFile(outPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(LOGO_SRC)) {
    console.error(`ERROR: No se encontró el logo fuente en:\n  ${LOGO_SRC}`);
    process.exit(1);
  }

  console.log("Generando store assets...");
  console.log(`  Fuente logo  : ${LOGO_SRC}`);
  console.log(`  Fuente banner: ${BANNER_SRC || "(ausente — usando BG)"}`);
  console.log(`  Destino      : ${ASSETS_DIR}`);
  console.log("");

  const promises = [];

  for (const asset of SQUARE_ASSETS) {
    const out = path.join(ASSETS_DIR, asset.file);
    promises.push(
      compositeOnBg(LOGO_SRC, asset.w, asset.h, out)
        .then(() => console.log(`  ✓  ${asset.file}  (${asset.w}×${asset.h})`))
        .catch(e  => console.error(`  ✗  ${asset.file}: ${e.message}`))
    );
  }

  for (const asset of WIDE_ASSETS) {
    const out = path.join(ASSETS_DIR, asset.file);
    promises.push(
      compositeWide(BANNER_SRC, LOGO_SRC, asset.w, asset.h, out)
        .then(() => console.log(`  ✓  ${asset.file}  (${asset.w}×${asset.h})`))
        .catch(e  => console.error(`  ✗  ${asset.file}: ${e.message}`))
    );
  }

  await Promise.all(promises);
  console.log("\nAssets generados en store-assets/");
  console.log("NOTA: Son assets funcionales pero de test. Reemplázalos con diseño official antes de subir a la Store.");
}

main().catch(e => { console.error(e); process.exit(1); });
