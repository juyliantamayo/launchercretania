// Accounts sidebar rendering
import { S, ini } from "../state.js";
import { updateLaunch } from "./actionbar.js";
import { showBrowse } from "./explore.js";

const $ = id => document.getElementById(id);

export function renderAccs() {
  const list  = $("accList");
  const noAcc = $("noAccounts");
  list.innerHTML = "";
  noAcc.style.display = S.accounts.length ? "none" : "block";

  S.accounts.forEach(a => {
    const el = document.createElement("div");
    el.className = "acc-card" + (a.uuid === S.selectedAcc ? " active" : "");
    el.innerHTML = `
      <div class="acc-avatar">${ini(a.name)}</div>
      <div style="min-width:0">
        <div class="acc-name">${a.name}</div>
        <div class="acc-meta">Cuenta Microsoft</div>
      </div>
      <span class="acc-badge">Premium</span>
      <button class="acc-rm" title="Eliminar">&#x2715;</button>`;

    el.querySelector(".acc-rm").addEventListener("click", async e => {
      e.stopPropagation();
      const wasSelected = a.uuid === S.selectedAcc;
      await window.cretania.invoke("remove-account", a.uuid);
      const { refreshAccs, refreshPacks } = await import("../data.js");
      await refreshAccs();
      if (wasSelected) {
        S.selectedId = null;
        showBrowse();
      }
      await refreshPacks();
    });

    el.addEventListener("click", async () => {
      S.selectedAcc = a.uuid;
      renderAccs();
      const { refreshPacks } = await import("../data.js");
      await refreshPacks();
      const { updateLaunch } = await import("./actionbar.js");
      updateLaunch();
    });

    list.appendChild(el);
  });

  updateLaunch();
}
