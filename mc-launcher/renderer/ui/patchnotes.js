// Patch notes overlay
import { S, pnKey } from "../state.js";

const $ = id => document.getElementById(id);

export function renderPN() {
  const pnBody = $("pnBody");
  pnBody.innerHTML = "";

  if (!S.pnNotes.length) {
    pnBody.innerHTML = '<div class="empty"><div class="empty-ttl">Sin notas</div><div class="empty-txt">No hay notas de parche para este modpack.</div></div>';
    return;
  }

  S.pnNotes.forEach(patch => {
    const sec = document.createElement("div");
    sec.style.cssText = "margin-bottom:14px;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
    header.innerHTML = `
      <span style="font-family:'Sora',sans-serif;font-size:13px;font-weight:800;color:var(--text);">v${patch.version}</span>
      <span style="font-size:10px;color:var(--muted);">${patch.date || "Sin fecha"}</span>
    `;
    sec.appendChild(header);

    (patch.categories || []).forEach(cat => {
      if (cat.title) {
        const catTitle = document.createElement("div");
        catTitle.className = "pn-grp-title";
        catTitle.textContent = cat.title;
        sec.appendChild(catTitle);
      }
      (cat.entries || []).forEach(entry => {
        const e = document.createElement("div");
        e.className = "pn-entry";
        const textDiv = document.createElement("div");
        textDiv.className = "pn-entry-text";
        textDiv.textContent = entry.text || "";
        e.appendChild(textDiv);
        if (entry.detail) {
          const detDiv = document.createElement("div");
          detDiv.className = "pn-entry-detail";
          detDiv.textContent = entry.detail;
          e.appendChild(detDiv);
        }
        sec.appendChild(e);
      });
    });

    pnBody.appendChild(sec);
  });
}

export function checkPnBadge() {
  try {
    const seen = localStorage.getItem(pnKey());
    $("pnDot").style.display = (seen !== S.pnVersion && S.pnVersion) ? "block" : "none";
  } catch {
    $("pnDot").style.display = "block";
  }
}
