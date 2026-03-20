// App entry point — init sequence
import { S }            from "./state.js";
import { initTabs }     from "./ui/tabs.js";
import { setStatus }    from "./ui/actionbar.js";
import { initEvents }   from "./events.js";
import {
  loadSettings, refreshAccs, refreshPacks,
  checkJava, loadPatchNotes, loadInstStatus, checkUpdates, loadAppFlags
} from "./data.js";
import { renderGrid }   from "./ui/grid.js";
import { renderDetail } from "./ui/detail.js";
import { renderSbPacks } from "./ui/sidebar.js";

const ipc = window.cretania;

async function init() {
  // Restore saved theme (dark is default)
  try {
    const saved = localStorage.getItem('lucerion-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      const activeBtn = document.querySelector(`.theme-popup-item[data-theme-val="${saved}"]`);
      if (activeBtn) {
        document.querySelectorAll('.theme-popup-item').forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
      }
    }
  } catch {}

  initTabs();
  initEvents();

  // Cargar flags de la variante de build primero — otros módulos pueden depender de S.storeBuild
  await loadAppFlags();

  // Check if launcher update is already ready (non-blocking)
  ipc.invoke("get-launcher-update-status").then(d => {
    if (d?.status === "ready" && d.remoteVersion)
      setStatus(`Launcher v${d.remoteVersion} listo.`);
  });

  await loadSettings();
  await refreshAccs();
  await refreshPacks();
  await checkJava();
  await loadPatchNotes();

  // Restore last selected pack from settings — stay on grid so all packs are visible
  if (S.settings.selectedModpack && S.modpacks.find(p => p.id === S.settings.selectedModpack)) {
    S.selectedId = S.settings.selectedModpack;
  }
  renderGrid();
  await checkUpdates();

  // Periodic instance-status poll (every 15 s)
  setInterval(async () => {
    await loadInstStatus();
    renderGrid();
    if (S.subview === "detail") renderDetail();
    renderSbPacks();
  }, 15000);
}

init();
