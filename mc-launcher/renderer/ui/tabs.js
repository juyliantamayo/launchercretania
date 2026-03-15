// Tab switching
import { S } from "../state.js";

const $$ = s => document.querySelectorAll(s);

export function switchTab(name) {
  S.activeTab = name;
  $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $$(".view").forEach(v   => v.classList.toggle("active", v.dataset.view === name));
  if (name === "settings") document.getElementById("consoleDot").classList.remove("on");
}

export function initTabs() {
  $$(".tab-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
}
