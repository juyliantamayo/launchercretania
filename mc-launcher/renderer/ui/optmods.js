// Optional mods section in detail view
import { S, getPack } from "../state.js";

const $ = id => document.getElementById(id);
const ipc = window.cretania;

let _optQuery = "";

function updateCount() {
  const enabled = S.optMods.filter(m => m.enabled).length;
  $("optCount").textContent = `${enabled}/${S.optMods.length} activado${enabled !== 1 ? "s" : ""}`;
}

function renderList() {
  const list = $("optList");
  const q = _optQuery.toLowerCase().trim();
  const filtered = q
    ? S.optMods.filter(m =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.description || "").toLowerCase().includes(q) ||
        (m.category || "").toLowerCase().includes(q)
      )
    : S.optMods;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty" style="padding:14px 0">
      <div class="empty-ico">&#128269;</div>
      <div class="empty-ttl">Sin resultados</div>
      <div class="empty-txt">Ningún mod coincide con "${_optQuery}".</div>
    </div>`;
    return;
  }

  list.innerHTML = "";
  filtered.forEach(mod => {
    const isUser = mod.source === "user";
    const item = document.createElement("div");
    item.className = "opt-item";
    item.innerHTML = `
      <div class="opt-info">
        <div class="opt-name">${mod.name}${isUser ? ' <span class="tag tgO" style="font-size:9px;vertical-align:middle">JAR local</span>' : ""}</div>
        <div class="opt-desc">${mod.description || (isUser ? mod.file || "" : "Sin descripción")}</div>
        <div class="opt-tags">
          <span class="tag tg">${mod.category || "general"}</span>
          ${mod.defaultEnabled ? '<span class="tag tgG">Default on</span>' : '<span class="tag tg">Default off</span>'}
          ${mod.version ? `<span class="tag tg">v${mod.version}</span>` : ""}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${isUser ? `<button class="btn-del-usermod" title="Eliminar mod" data-file="${mod.file}">&#128465;</button>` : ""}
        <label class="tgl">
          <input type="checkbox" ${mod.enabled ? "checked" : ""}>
          <span class="tgl-track"></span>
        </label>
      </div>`;

    item.querySelector("input").addEventListener("change", async e => {
      mod.enabled = e.target.checked;
      await ipc.invoke("save-optional-mods", {
        modpackId: S.selectedId,
        modId:     mod.id,
        enabled:   mod.enabled
      });
      updateCount();
    });

    if (isUser) {
      item.querySelector(".btn-del-usermod").addEventListener("click", async () => {
        if (!confirm(`¿Eliminar "${mod.name}" de tus mods locales?`)) return;
        await ipc.invoke("delete-user-mod", { modpackId: S.selectedId, file: mod.file });
        S.optMods = S.optMods.filter(m => m.id !== mod.id);
        updateCount();
        renderList();
      });
    }

    list.appendChild(item);
  });
}

export function renderOptMods() {
  const sec  = $("optSection");
  const list = $("optList");
  const p    = getPack();

  _optQuery = "";
  const searchInput = $("optSearch");
  const clearBtn    = $("optSearchClear");
  const uploadBtn   = $("btnUploadJar");
  if (searchInput) searchInput.value = "";
  if (clearBtn)    clearBtn.style.display = "none";

  sec.style.display = "";

  if (!p || !p.hasAccess) {
    $("optCount").textContent = "";
    list.innerHTML = `<div class="empty" style="padding:18px 0">
      <div class="empty-ico">&#128274;</div>
      <div class="empty-ttl">Sin acceso</div>
      <div class="empty-txt">Necesitas acceso a este modpack para ver y activar mods opcionales.</div>
    </div>`;
    if (uploadBtn) uploadBtn.style.display = "none";
    return;
  }

  if (uploadBtn) {
    const canUpload = Boolean(p && p.allowUserMods);
    uploadBtn.style.display = canUpload ? "" : "none";
    if (canUpload) {
      // Replace node to drop old listener
      const fresh = uploadBtn.cloneNode(true);
      uploadBtn.parentNode.replaceChild(fresh, uploadBtn);
      fresh.addEventListener("click", async () => {
        const res = await ipc.invoke("pick-and-upload-user-mod", { modpackId: S.selectedId });
        if (res.canceled) return;
        if (res.ok && res.mod) {
          if (!S.optMods.find(m => m.id === res.mod.id)) {
            S.optMods.push(res.mod);
          }
          updateCount();
          renderList();
        }
      });
    }
  }

  if (!S.optMods.length) {
    $("optCount").textContent = "0 disponibles";
    list.innerHTML = `<div class="empty" style="padding:18px 0">
      <div class="empty-ico">&#128190;</div>
      <div class="empty-ttl">Sin mods opcionales</div>
      <div class="empty-txt">Este modpack no tiene mods opcionales en el manifest.<br>Podés subir tus propios JARs con <strong>+ JAR</strong>.</div>
    </div>`;
    return;
  }

  updateCount();
  renderList();

  if (searchInput) {
    const fresh = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(fresh, searchInput);
    fresh.addEventListener("input", () => {
      _optQuery = fresh.value;
      clearBtn.style.display = _optQuery ? "" : "none";
      renderList();
    });
    clearBtn.addEventListener("click", () => {
      fresh.value = "";
      _optQuery = "";
      clearBtn.style.display = "none";
      fresh.focus();
      renderList();
    });
  }
}
