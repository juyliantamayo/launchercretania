// Sidebar modpack mini-list rendering
import { S, ini } from "../state.js";

const $ = id => document.getElementById(id);

export function renderSbPacks() {
  const el = $("sbMpList");
  el.innerHTML = "";

  if (!S.modpacks.length) {
    el.innerHTML = '<div style="font-size:10px;color:var(--muted2);padding:3px 4px">Sin modpacks.</div>';
    return;
  }

  S.modpacks.forEach(p => {
    const running = S.instanceStatus[p.id]?.running;
    const item = document.createElement("div");
    item.className = "sb-mp" + (p.id === S.selectedId ? " active" : "");
    item.innerHTML = `
      <div class="sb-mp-thumb">
        ${p.imageUrl
          ? `<img src="${p.imageUrl}" alt="" onerror="this.parentNode.textContent='${ini(p.name)}'">` 
          : ini(p.name)}
      </div>
      <div style="flex:1;min-width:0">
        <div class="sb-mp-name">${p.name}</div>
        <div class="sb-mp-sub">
          ${running ? '<span class="run-dot"></span>' : ""}
          <span>${(p.loaderType || p.loader || "loader").toUpperCase()} · ${p.modCount || 0} mods</span>
        </div>
      </div>`;

    item.addEventListener("click", async () => {
      const { switchTab } = await import("./tabs.js");
      const { showDetail } = await import("./explore.js");
      switchTab("explore");
      showDetail(p.id);
    });

    el.appendChild(item);
  });
}
