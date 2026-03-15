// Optional mods section in detail view
import { S, getPack } from "../state.js";

const $ = id => document.getElementById(id);
const ipc = window.cretania;

export function renderOptMods() {
  const sec  = $("optSection");
  const list = $("optList");
  const p    = getPack();

  sec.style.display = "";   // always visible in detail view

  if (!p || !p.hasAccess) {
    $("optCount").textContent = "";
    list.innerHTML = `<div class="empty" style="padding:18px 0">
      <div class="empty-ico">&#128274;</div>
      <div class="empty-ttl">Sin acceso</div>
      <div class="empty-txt">Necesitas acceso a este modpack para ver y activar mods opcionales.</div>
    </div>`;
    return;
  }

  if (!S.optMods.length) {
    $("optCount").textContent = "0 disponibles";
    list.innerHTML = `<div class="empty" style="padding:18px 0">
      <div class="empty-ico">&#128190;</div>
      <div class="empty-ttl">Sin mods opcionales</div>
      <div class="empty-txt">Este modpack no expone mods opcionales todavía.</div>
    </div>`;
    return;
  }

  const enabled = S.optMods.filter(m => m.enabled).length;
  $("optCount").textContent = `${enabled}/${S.optMods.length} activado${enabled !== 1 ? "s" : ""}`;
  list.innerHTML = "";

  S.optMods.forEach(mod => {
    const item = document.createElement("div");
    item.className = "opt-item";
    item.innerHTML = `
      <div class="opt-info">
        <div class="opt-name">${mod.name}</div>
        <div class="opt-desc">${mod.description || "Sin descripción"}</div>
        <div class="opt-tags">
          <span class="tag tg">${mod.category || "general"}</span>
          ${mod.defaultEnabled ? '<span class="tag tgG">Default on</span>' : '<span class="tag tg">Default off</span>'}
        </div>
      </div>
      <label class="tgl">
        <input type="checkbox" ${mod.enabled ? "checked" : ""}>
        <span class="tgl-track"></span>
      </label>`;

    item.querySelector("input").addEventListener("change", async e => {
      mod.enabled = e.target.checked;
      await ipc.invoke("save-optional-mods", {
        modpackId: S.selectedId,
        modId:     mod.id,
        enabled:   mod.enabled
      });
      const nowEnabled = S.optMods.filter(m => m.enabled).length;
      $("optCount").textContent = `${nowEnabled}/${S.optMods.length} activado${nowEnabled !== 1 ? "s" : ""}`;
    });

    list.appendChild(item);
  });
}
