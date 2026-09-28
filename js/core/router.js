// Routes are the hash: #/<name>/<param>/... Each name maps to a handler (main.js holds the table);
// an unknown name, or a handler that returns false, lands on the season view.
import { $ } from "./dom.js";
import { state, emit } from "./state.js";
import { hideTip } from "./tooltip.js";
import { refreshCharts } from "./charts.js";

const routes = new Map();
let fallback = null;

export function route(name, handler) { routes.set(name, handler); }
export function otherwise(handler) { fallback = handler; }

// Lights the tab whose data-<key> is `value`. A strip that scrolls sideways (phones) brings the lit
// tab to the middle when it is cut off.
export function syncTabs(nav, key, value) {
  nav.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute("aria-selected", String(b.dataset[key] === value)));
  const lit = nav.querySelector('[aria-selected="true"]');
  const box = nav.closest(".ooyl-topbar__nav") || nav;
  if (lit && box.scrollWidth > box.clientWidth) {
    const n = box.getBoundingClientRect(), t = lit.getBoundingClientRect();
    if (t.left < n.left || t.right > n.right - 28) box.scrollLeft += t.left - n.left - (n.width - t.width) / 2;
  }
}

// A detail page keeps its section's tab lit: a team under Times, a match under Partidas.
const SECTION = { time: "times", partida: "partidas", jogador: "jogadores", arbitro: "arbitragem" };

export function setView(view) {
  state.view = view;
  document.querySelectorAll("main > section.view").forEach((section) => { section.hidden = section.id !== "view-" + view; });
  syncTabs($("main-tabs"), "view", SECTION[view] || view);
  hideTip();
  refreshCharts();  // a chart drawn while its view was hidden gets its real width now
  emit("view", view);
  scrollTo({ top: 0, behavior: "instant" });
}

export function applyHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const handler = routes.get(parts[0]);
  if (!handler || handler(...parts.slice(1)) === false) fallback();
}

export function start() {
  addEventListener("hashchange", applyHash);
  applyHash();
}
