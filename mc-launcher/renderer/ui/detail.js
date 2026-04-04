// Detail view: renders pack info, banner, metrics, access banner
import { S, ini, getPack } from "../state.js";
import { showBrowse } from "./explore.js";
import { updateLaunch } from "./actionbar.js";
import { renderSbPacks } from "./sidebar.js";
import { placeholder } from "./placeholder.js";

const $ = id => document.getElementById(id);

export function renderDetail() {
  const p = getPack();
  if (!p) { showBrowse(); return; }
  const running = S.instanceStatus[p.id]?.running;

  // Banner
  const fb  = $("detBannerFb");
  const img = $("detBannerImg");
  const phBanner = placeholder(p.name, 800, 260);
  fb.textContent = ini(p.name);
  img.src = p.imageUrl || phBanner;
  img.style.display = "block";
  fb.style.display = "none";
  img.onerror = () => { img.onerror = null; img.src = phBanner; };

  // Icon
  const phIco = placeholder(p.name, 48, 48);
  const iconEl = $("detIcon");
  iconEl.innerHTML = `<img src="${p.imageUrl || phIco}" alt="">`;
  const icoImg = iconEl.querySelector("img");
  if (icoImg) icoImg.onerror = function() { this.onerror = null; this.src = phIco; };

  // Meta
  $("detEyebrow").textContent = p.public ? "Pack público" : "Pack privado";
  $("detName").textContent    = p.name;
  $("detSub").textContent     = p.subtitle || "Sin subtítulo";

  $("detTags").innerHTML = [
    `<span class="tag ${p.public ? "tgG" : "tgR"}">${p.public ? "Público" : "Privado"}</span>`,
    `<span class="tag tgB">${(p.loaderType || p.loader || "??").toUpperCase()}</span>`,
    `<span class="tag tg">MC ${p.minecraft || "?"}</span>`,
    `<span class="tag tgO">v${p.version || "0.0.0"}</span>`,
    `<span class="tag ${p.hasAccess ? "tgG" : "tgR"}">${p.hasAccess ? "Acceso" : "Sin acceso"}</span>`
  ].join("");

  // Compact stats
  $("mMods").textContent     = p.modCount || 0;
  $("mLoader").textContent   = (p.loaderType || p.loader || "-").toUpperCase();
  $("mMC").textContent       = p.minecraft || "-";
  $("mInstance").textContent = running ? "🟢 Activa" : "Inactiva";

  // Kill instance button — solo visible si la instancia está activa
  const killBtn = $("btnKillInstance");
  if (running) {
    killBtn.style.display = "";
    killBtn.onclick = async () => {
      killBtn.disabled = true;
      killBtn.textContent = "Deteniendo…";
      await window.cretania.invoke("kill-instance", p.id);
      killBtn.disabled = false;
      killBtn.innerHTML = "&#9632; Detener";
    };
  } else {
    killBtn.style.display = "none";
    killBtn.onclick = null;
  }

  // Info grid
  $("iVer").textContent   = "v" + (p.version || "0.0.0");
  $("iAcc").textContent   = p.hasAccess ? "✔ Habilitado" : "✘ Sin permiso";

  // Description
  const descCard = $("detDescCard");
  if (p.description) {
    $("detDesc").textContent = p.description;
    descCard.style.display = "";
  } else {
    descCard.style.display = "none";
  }

  // Gallery
  const galleryWrap = $("detGalleryWrap");
  if (Array.isArray(p.gallery) && p.gallery.length) {
    $("detGallery").innerHTML = p.gallery.map(url =>
      `<div class="det-gal-item"><img src="${url}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
    ).join("");
    galleryWrap.style.display = "";
  } else {
    galleryWrap.style.display = "none";
  }

  // Access banner
  const banner = $("accessBanner");
  const abIco  = $("abIcon");
  const abTxt  = $("abText");
  if (p.hasAccess) {
    banner.className  = "access-banner ab-ok";
    abIco.textContent = "✔";
    abTxt.textContent = p.public
      ? "Este modpack es público y está disponible para cualquier cuenta iniciada."
      : "Tu cuenta está autorizada para este modpack privado.";
  } else if (!S.selectedAcc) {
    banner.className  = "access-banner ab-warn";
    abIco.textContent = "⚠";
    abTxt.textContent = "Inicia sesión con una cuenta Microsoft para acceder a este modpack.";
  } else {
    banner.className  = "access-banner ab-lock";
    abIco.textContent = "✘";
    abTxt.textContent = "Tu cuenta no tiene autorización para este modpack privado.";
  }

  // Pack info in settings tab
  $("setPackInfo").textContent = `${p.name} · ${(p.loaderType || p.loader || "-").toUpperCase()} · v${p.version}`;

  updateLaunch();
  renderSbPacks();
}
