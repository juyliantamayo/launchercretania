// App entry point — init sequence
import { S }            from "./state.js";
import { initTabs }     from "./ui/tabs.js";
import { setStatus }    from "./ui/actionbar.js";
import { initEvents }   from "./events.js";
import {
  loadSettings, refreshAccs, refreshPacks,
  checkJava, loadPatchNotes, loadInstStatus, checkUpdates
} from "./data.js";
import { renderGrid }   from "./ui/grid.js";
import { renderDetail } from "./ui/detail.js";
import { renderSbPacks } from "./ui/sidebar.js";

const ipc = window.cretania;

async function init() {
  initTabs();
  initEvents();

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

  // Restore last selected pack from settings
  if (S.settings.selectedModpack && S.modpacks.find(p => p.id === S.settings.selectedModpack)) {
    S.selectedId  = S.settings.selectedModpack;
    S.subview     = "detail";
    document.getElementById("vBrowse").style.display = "none";
    document.getElementById("vDetail").style.display = "";
    renderDetail();
    await checkUpdates();
  }

  // Periodic instance-status poll (every 15 s)
  setInterval(async () => {
    await loadInstStatus();
    renderGrid();
    if (S.subview === "detail") renderDetail();
    renderSbPacks();
  }, 15000);
}

init();
