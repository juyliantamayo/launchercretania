// Grid: renders the modpack card grid in the browse sub-view
import { S, ini, getFiltered } from "../state.js";
import { showDetail } from "./explore.js";

const $ = id => document.getElementById(id);

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

  gridEl.innerHTML = "";
  packs.forEach(p => {
    const running = S.instanceStatus[p.id]?.running;
    const bCls = running ? "badge-running" : (!p.hasAccess ? "badge-locked" : "badge-idle");
    const bTxt = running ? "&#9679; Activa" : (!p.hasAccess ? "&#128274; Bloqueado" : "Lista");
    const fbId = "fb-" + p.id.replace(/[^a-z0-9]/gi, "_");
    const card = document.createElement("div");
    card.className = "mp-card" + (p.id === S.selectedId ? " selected" : "") + (!p.hasAccess ? " locked" : "");
    card.innerHTML = `
      <div class="mp-card-art">
        <div class="mp-card-art-fb" id="${fbId}">${ini(p.name)}</div>
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="" onerror="this.style.display='none';document.getElementById('${fbId}').style.display='flex'">` : ""}
        <span class="mp-status-badge ${bCls}">${bTxt}</span>
      </div>
      <div class="mp-card-body">
        <div class="mp-card-row1">
          <div class="mp-card-icon">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="" onerror="this.parentNode.textContent='${ini(p.name)}'">` : ini(p.name)}
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
    card.addEventListener("click", () => showDetail(p.id));
    gridEl.appendChild(card);
  });
}
