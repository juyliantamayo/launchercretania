// Explore sub-view: browse <-> detail switching
import { S } from "../state.js";

export function showBrowse() {
  S.subview = "browse";
  document.getElementById("vBrowse").style.display = "";
  document.getElementById("vDetail").style.display = "none";
}

export async function showDetail(id) {
  S.selectedId = id;
  S.subview = "detail";
  document.getElementById("vBrowse").style.display = "none";
  document.getElementById("vDetail").style.display = "";

  const { renderDetail } = await import("./detail.js");
  const { loadOptMods, saveSettingsNow } = await import("../data.js");

  renderDetail();
  loadOptMods();
  saveSettingsNow();
}
