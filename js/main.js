// The page's entry: the route table, the top bar, and the boot sequence.
//
// Every view is a module that draws itself from the shared state and listens to "index" and "theme"
// (core/state.js); this file only says which hash opens which view. The Admin tab is a module of its
// own, imported only when the server answers /api/admin, so the public copy never loads it.
import { $, el, clear } from "./core/dom.js";
import { state, emit, on } from "./core/state.js";
import { go } from "./core/nav.js";
import { route, otherwise, setView, start } from "./core/router.js";
import { fillZoneLegends, seasonLine } from "./core/league.js";
import { loadIndex } from "./core/api.js";
import { LANG, chooseLanguage, loadDictionary, translateStatic, tx } from "./core/i18n.js";
import * as temporada from "./views/temporada.js";
import * as partidas from "./views/partidas.js";
import * as partida from "./views/partida.js";
import * as times from "./views/times.js";
import * as time from "./views/time.js";
import * as estatisticas from "./views/estatisticas.js";
import * as jogadores from "./views/jogadores.js";
import * as jogador from "./views/jogador.js";
import * as selecao from "./views/selecao.js";
import * as arbitragem from "./views/arbitragem.js";
import * as simulador from "./views/simulador.js";

void temporada;  // draws on "index": no route of its own besides the fallback

// #/<name>/<params>. Every view but Admin draws from the season payload: without one (a first run,
// before any collection) they fall back, and a route that needs an id falls back without one.
const season = (handler) => (...params) => state.index ? handler(...params) : false;
route("partidas", season((mode) => partidas.open(mode)));
route("partida", season((id, tab) => id ? partida.open(Number(id), tab) : false));
route("times", season(() => times.open()));
route("time", season((id, tab) => id ? time.open(Number(id), tab) : false));
route("estatisticas", season((tab) => estatisticas.open(tab)));
route("jogadores", season(() => jogadores.open()));
route("jogador", season((id) => id ? jogador.open(Number(id)) : false));
route("selecao", season((slot) => selecao.open(slot)));
route("arbitragem", season((tab) => arbitragem.open(tab)));
route("arbitro", season((id) => id ? arbitragem.openReferee(Number(id)) : false));
route("simulador", season(() => simulador.open()));
route("admin", () => state.adminOn ? setView("admin") : false);
otherwise(() => setView(state.index || !state.adminOn ? "temporada" : "admin"));

$("main-tabs").addEventListener("click", (ev) => {
  const btn = ev.target.closest('[role="tab"]');
  if (btn) go("#/" + btn.dataset.view);
});

// The design system's two editions: Floodlight (dark) and Broadsheet (light). With nothing saved the
// page follows the OS; Tema flips and remembers (the <head> script applies it before first paint).
$("theme").addEventListener("click", () => {
  const light = matchMedia("(prefers-color-scheme: light)").matches;
  const now = document.documentElement.getAttribute("data-theme") || (light ? "broadsheet" : "floodlight");
  const next = now === "floodlight" ? "broadsheet" : "floodlight";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("tema", next); } catch (_) {}
  emit("theme");
});

// PT, EN, ES: the choice reloads the page in that language (core/i18n.js).
$("lang").value = LANG;
$("lang").addEventListener("change", (ev) => chooseLanguage(ev.target.value));

// Whatever the season payload brings that is not one view's: the header line and the zone legends.
on("index", () => {
  $("loading").hidden = true;
  $("season-label").textContent = seasonLine();
  fillZoneLegends();
});

async function bootAdmin() {
  let first;
  try {
    const res = await fetch("/api/admin?since=0");
    if (!res.ok) return;  // --no-admin, or the public copy: the tab never shows
    first = await res.json();
  } catch (_) {
    return;
  }
  const admin = await import("./views/admin.js");
  state.adminOn = true;
  admin.mount(first);
}

async function boot() {
  await loadDictionary();  // before anything is drawn: every text looks itself up once
  translateStatic();
  let failure = null;
  try {
    await loadIndex();
  } catch (err) {
    failure = err;
  }
  await bootAdmin();
  if (failure) {
    // No season yet (a first run) lands on the Admin tab, where the first collection starts.
    clear($("loading")).appendChild(el("span", { class: "err", text: tx("Não foi possível ler os dados: {erro}", { erro: failure.message })
      + (state.adminOn ? ". Use a aba Admin para a primeira coleta." : "") }));
    if (!state.adminOn) return;
  }
  start();
}

boot();
