// Grid: renders the modpack card grid in the browse sub-view
import { S, ini, getFiltered } from "../state.js";
import { showDetail } from "./explore.js";
import { placeholder } from "./placeholder.js";

const $ = id => document.getElementById(id);

function buildCard(p, running) {
  const bCls = running ? "badge-running" : (!p.hasAccess ? "badge-locked" : "badge-idle");
  const bTxt = running ? "&#9679; Activa" : (!p.hasAccess ? "&#128274; Bloqueado" : "Lista");
  const fbId = "fb-" + p.id.replace(/[^a-z0-9]/gi, "_");
  const card = document.createElement("div");
  card.dataset.id = p.id;
  card.className = "mp-card" + (p.id === S.selectedId ? " selected" : "") + (!p.hasAccess ? " locked" : "");
  const phArt = placeholder(p.name, 400, 225);
  const phIco = placeholder(p.name, 48, 48);
  card.innerHTML = `
      <div class="mp-card-art">
        <div class="mp-card-art-fb" id="${fbId}" style="display:none">${ini(p.name)}</div>
        <img src="${p.imageUrl || phArt}" alt="">
        <span class="mp-status-badge ${bCls}">${bTxt}</span>
      </div>
      <div class="mp-card-body">
        <div class="mp-card-row1">
          <div class="mp-card-icon">
            <img src="${p.imageUrl || phIco}" alt="">
          </div>
          <div style="flex:1;min-width:0">
            <div class="mp-card-name">${p.name}</div>
            <div class="mp-card-sub">${p.subtitle || "Sin subtítulo"}</div>
          </div>
        </div>
        <div class="mp-tags">
          <span class="tag ${p.public ? "tgG" : "tgR"}">${p.public ? "Público" : "Privado"}</span>
          <span class="tag tgB">${(p.loaderType || p.loader || "??").toUpperCase()}</span>
          <span class="tag tg">MC ${p.minecraft || "?"}</span>
          <span class="tag tgO">v${p.version || "0.0.0"}</span>
          <span class="tag tg">${p.modCount || 0} mods</span>
          ${!p.hasAccess ? '<span class="tag tgR">Sin acceso</span>' : ""}
        </div>
      </div>`;
  // Fallback programático: si la imagen falla, usar placeholder canvas
  const artImg = card.querySelector(".mp-card-art > img");
  if (artImg) artImg.onerror = function() { this.onerror = null; this.src = phArt; };
  const icoImg = card.querySelector(".mp-card-icon > img");
  if (icoImg) icoImg.onerror = function() { this.onerror = null; this.src = phIco; };

  card.addEventListener("click", () => showDetail(p.id));
  return card;
}

export function renderGrid() {
  const packs       = getFiltered();
  const searchEl    = $("searchInput");
  const pillEl      = $("searchPill");
  const gridEl      = $("mpGrid");

  pillEl.textContent = packs.length + (packs.length === 1 ? " pack" : " packs");

  if (!packs.length) {
    gridEl.innerHTML = !S.modpacks.length
      ? `<div class="empty" style="grid-column:1/-1">
           <div class="empty-ico">&#128190;</div>
           <div class="empty-ttl">Sin modpacks</div>
           <div class="empty-txt">No se encontraron modpacks en el manifest.<br>Haz clic en <strong>Actualizar</strong> para reintentar.</div>
         </div>`
      : `<div class="empty" style="grid-column:1/-1">
           <div class="empty-ico">&#128270;</div>
           <div class="empty-ttl">Sin resultados</div>
           <div class="empty-txt">Nada coincide con "<strong>${searchEl.value}</strong>".</div>
         </div>`;
    return;
  }

  // Smart diff: if same pack IDs in same order, only patch dynamic state
  const existing = [...gridEl.querySelectorAll(".mp-card[data-id]")];
  const sameLayout =
    existing.length === packs.length &&
    existing.every((c, i) => c.dataset.id === packs[i].id);

  if (sameLayout) {
    packs.forEach((p, i) => {
      const card    = existing[i];
      const running = S.instanceStatus[p.id]?.running;
      const bCls    = running ? "badge-running" : (!p.hasAccess ? "badge-locked" : "badge-idle");
      const bTxt    = running ? "&#9679; Activa" : (!p.hasAccess ? "&#128274; Bloqueado" : "Lista");
      const wantCls = "mp-card" + (p.id === S.selectedId ? " selected" : "") + (!p.hasAccess ? " locked" : "");
      if (card.className !== wantCls) card.className = wantCls;
      const badge = card.querySelector(".mp-status-badge");
      if (badge) {
        if (badge.className !== `mp-status-badge ${bCls}`) badge.className = `mp-status-badge ${bCls}`;
        if (badge.innerHTML !== bTxt) badge.innerHTML = bTxt;
      }
    });
    return;
  }

  // Full rebuild (pack list changed)
  gridEl.innerHTML = "";
  packs.forEach(p => {
    const running = S.instanceStatus[p.id]?.running;
    gridEl.appendChild(buildCard(p, running));
  });
}
