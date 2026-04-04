// Sidebar modpack mini-list rendering
import { S, ini } from "../state.js";
import { placeholder } from "./placeholder.js";

const $ = id => document.getElementById(id);

function buildSbItem(p, running) {
  const item = document.createElement("div");
  item.dataset.id = p.id;
  item.className = "sb-mp" + (p.id === S.selectedId ? " active" : "");
  const phThumb = placeholder(p.name, 40, 40);
  item.innerHTML = `
      <div class="sb-mp-thumb">
        <img src="${p.imageUrl || phThumb}" alt="">
      </div>
      <div style="flex:1;min-width:0">
        <div class="sb-mp-name">${p.name}</div>
        <div class="sb-mp-sub">
          ${running ? '<span class="run-dot"></span>' : ""}
          <span>${(p.loaderType || p.loader || "loader").toUpperCase()} · ${p.modCount || 0} mods</span>
        </div>
      </div>`;
  // Fallback programático al placeholder canvas
  const thumbImg = item.querySelector(".sb-mp-thumb > img");
  if (thumbImg) thumbImg.onerror = function() { this.onerror = null; this.src = phThumb; };

  item.addEventListener("click", async () => {
    const { switchTab } = await import("./tabs.js");
    const { showDetail } = await import("./explore.js");
    switchTab("explore");
    showDetail(p.id);
  });
  return item;
}

export function renderSbPacks() {
  const el = $("sbMpList");

  if (!S.modpacks.length) {
    el.innerHTML = '<div style="font-size:10px;color:var(--muted2);padding:3px 4px">Sin modpacks.</div>';
    return;
  }

  // Smart diff: if same pack IDs in same order, only patch active class and run-dot
  const existing = [...el.querySelectorAll(".sb-mp[data-id]")];
  const sameLayout =
    existing.length === S.modpacks.length &&
    existing.every((item, i) => item.dataset.id === S.modpacks[i].id);

  if (sameLayout) {
    S.modpacks.forEach((p, i) => {
      const item    = existing[i];
      const running = S.instanceStatus[p.id]?.running;
      const wantCls = "sb-mp" + (p.id === S.selectedId ? " active" : "");
      if (item.className !== wantCls) item.className = wantCls;
      const sub    = item.querySelector(".sb-mp-sub");
      const hasDot = !!item.querySelector(".run-dot");
      if (sub) {
        if (running && !hasDot) {
          const dot = document.createElement("span");
          dot.className = "run-dot";
          sub.insertBefore(dot, sub.firstChild);
        } else if (!running && hasDot) {
          item.querySelector(".run-dot").remove();
        }
      }
    });
    return;
  }

  // Full rebuild (pack list changed)
  el.innerHTML = "";
  S.modpacks.forEach(p => {
    const running = S.instanceStatus[p.id]?.running;
    el.appendChild(buildSbItem(p, running));
  });
}
