// Simulador: the rest of the season. The model (analysis/simulation.py) gives each game's chances and,
// over thousands of drawn seasons, each team's chance of every column liga.json lists (title, direct
// promotion, the playoff places, relegation...). Two modes: the user types each score and the table
// adds them up, like the ge simulator; or the model's probabilities.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView, syncTabs } from "../core/router.js";
import { showTip, hideTip, tipLine } from "../core/tooltip.js";
import { oddsBar } from "../core/charts.js";
import { crest, teamName, tiles } from "../core/ui.js";
import { league, zoneOf } from "../core/league.js";
import { dateOf, pctText } from "../core/format.js";
import { getJSON } from "../core/api.js";
import { LOCALE, tx } from "../core/i18n.js";

const local = { sim: null, mode: "manual", picks: null, manRound: 0, round: null, guess: null };

// tone: neutral, good or bad; the bar is a third of its tone behind the figure.
const pctCell = (value, tone) => el("td", {}, el("span", { class: "ooyl-prob ooyl-prob--" + tone + (value <= 0.00005 ? " is-zero" : "") },
  el("i", { style: `width:${Math.min(100, 100 * value)}%` }),
  el("b", { text: pctText(value) })));

// The season is over when every team has played its double round-robin and the calendar has nothing left:
// there is nothing to simulate, and the public copy has no /api/simulacao to ask for (a plain 404).
function seasonOver() {
  const index = state.index, left = index && index.calendar && index.calendar.matches;
  return !!left && !left.length && index.table.length > 1 && index.table.every((r) => r.j >= 2 * (index.table.length - 1));
}

function renderOver() {
  const over = tx("A temporada terminou: não há jogos a simular. A classificação final está na aba Temporada.");
  syncTabs($("sim-modes"), "smode", local.mode);
  $("sim-manual").hidden = local.mode !== "manual";
  $("sim-prob").hidden = local.mode !== "prob";
  $("sim-sub").textContent = over;
  $("siman-sub").textContent = over;
  [$("sim-kpis"), $("sim-table"), $("sim-games"), $("siman-table"), $("siman-games")].forEach(clear);
  ["siman-fill", "siman-clear", "sim-reload", "sim-second"].forEach((id) => { $(id).hidden = true; });
  [$("siman-games"), $("sim-games")].forEach((node) => { node.closest(".ooyl-card").hidden = true; });
}

export async function open(again) {
  setView("simulador");
  if (seasonOver()) { renderOver(); return; }
  if (local.sim && !again) { renderSimView(); return; }
  $("sim-sub").textContent = tx(again ? "Sorteando outras temporadas…" : "Simulando o resto da temporada…");
  $("siman-sub").textContent = tx("Carregando o calendário e o modelo…");
  clear($("sim-kpis")); clear($("sim-table")); clear($("sim-games"));
  try {
    // The server answers 409 with the reason (no calendar yet); the public copy, a plain 404.
    local.sim = await getJSON("/api/simulacao" + (again ? "?refresh=1" : ""));
    local.guess = null;
    renderSimView();
  } catch (err) {
    $("sim-sub").textContent = tx("Não foi possível simular: {erro}", { erro: err.message });
    $("siman-sub").textContent = tx("Não foi possível carregar o calendário: {erro}", { erro: err.message });
  }
}

// ---- manual: the user decides each score --------------------------------------------------
// The model still gives the calendar, the most likely score and each game's chances, but here it only
// suggests: the table adds up what was typed.
const simKey = () => "simulacao-" + state.index.season;
const matchKey = (m) => m.id ? String(m.id) : `${m.home.id}-${m.away.id}`;
const allSimMatches = () => local.sim.rounds.flatMap((b) => b.matches);
// The criteria that break a tie on points, as liga.json names them ("tiebreak").
const TIEBREAK = { wins: (r) => r.v, goal_difference: (r) => r.gp - r.gc, goals_for: (r) => r.gp };
function loadPicks() {
  try { return JSON.parse(localStorage.getItem(simKey()) || "{}") || {}; } catch (_) { return {}; }
}
const savePicks = () => { try { localStorage.setItem(simKey(), JSON.stringify(local.picks)); } catch (_) {} };

function renderSimView() {
  syncTabs($("sim-modes"), "smode", local.mode);
  $("sim-manual").hidden = local.mode !== "manual";
  $("sim-prob").hidden = local.mode !== "prob";
  if (local.mode === "manual") renderSimManual(); else renderSim();
}

// Real standings plus every scoreline the user typed, ranked by the league's criteria.
function manualTable() {
  const rows = state.index.table.map((r) => ({ team: r.team, was: r.pos, j: r.j, v: r.v, e: r.e, d: r.d,
                                               gp: r.gp, gc: r.gc, pts: r.pts }));
  const byId = new Map(rows.map((r) => [r.team.id, r]));
  allSimMatches().forEach((m) => {
    const pick = local.picks[matchKey(m)];
    const h = byId.get(m.home.id), a = byId.get(m.away.id);
    if (!pick || !h || !a) return;
    const [gh, ga] = pick;
    h.j++; a.j++; h.gp += gh; h.gc += ga; a.gp += ga; a.gc += gh;
    if (gh > ga) { h.v++; h.pts += 3; a.d++; } else if (gh === ga) { h.e++; a.e++; h.pts++; a.pts++; } else { a.v++; a.pts += 3; h.d++; }
  });
  // Points, then the league's tiebreak (liga.json; the CBF's order from a server that does not send it), then the name.
  const rules = (league().tiebreak || ["wins", "goal_difference", "goals_for"]).map((k) => TIEBREAK[k]).filter(Boolean);
  rows.sort((x, y) => y.pts - x.pts || rules.reduce((found, rule) => found || rule(y) - rule(x), 0)
    || (x.team.name || "").localeCompare(y.team.name || ""));
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}

function renderManualTable() {
  const rows = manualTable();
  const picked = allSimMatches().filter((m) => local.picks[matchKey(m)]).length;
  $("siman-sub").textContent = tx("{n} de {total} jogos com placar. A tabela parte da classificação real e soma só os placares que você digitou.",
    { n: fmt(picked), total: fmt(allSimMatches().length) });
  const table = clear($("siman-table"));
  const head = ["#", "", "Time", "J", "V", "E", "D", "GP", "GC", "SG", "P"];
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { class: i <= 2 ? "left" : "", text: h })))));
  table.appendChild(el("tbody", {}, rows.map((r) => {
    const delta = r.was - r.pos;
    return el("tr", { class: "row-link", title: "abrir o time", onclick: () => go("#/time/" + r.team.id) },
      el("td", { class: "left pos" }, el("i", { class: "zone " + zoneOf(r.pos) }), String(r.pos)),
      el("td", { class: "left delta " + (delta > 0 ? "up" : delta < 0 ? "down" : ""),
                 text: delta > 0 ? "▲" + delta : delta < 0 ? "▼" + (-delta) : "" }),
      el("td", { class: "left" }, crest(r.team), el("span", { text: r.team.name })),
      el("td", { text: fmt(r.j) }), el("td", { text: fmt(r.v) }), el("td", { text: fmt(r.e) }), el("td", { text: fmt(r.d) }),
      el("td", { text: fmt(r.gp) }), el("td", { text: fmt(r.gc) }),
      el("td", { text: (r.gp - r.gc > 0 ? "+" : "") + fmt(r.gp - r.gc) }),
      el("td", { class: "strong", text: fmt(r.pts) }));
  })));
}

// One draw per match from the model's win/draw/loss chances; the scoreline is the model's most likely
// one when it agrees with the drawn outcome, else the simplest one that does.
function drawScore(m) {
  const r = Math.random();
  const outcome = r < m.pHome ? 1 : r < m.pHome + m.pDraw ? 0 : -1;
  const [sh, sa] = m.score;
  if (Math.sign(sh - sa) === outcome) return [sh, sa];
  return outcome > 0 ? [sa + 1, sa] : outcome === 0 ? [1, 1] : [sh, sh + 1];
}

// The model's pick for each game left, shown greyed in the boxes and written by the fill buttons.
// The favourite wins 1-0 or 0-1, except in the most balanced games (win chances closest together),
// which end 1-1: as many as the draws the model expects, the sum of the draw chances. The draw is
// never the biggest single chance, so without that quota the season would have no draws at all.
function modelGuess() {
  if (local.guess) return local.guess;
  const games = allSimMatches();
  const draws = Math.round(games.reduce((sum, m) => sum + m.pDraw, 0));
  const level = new Set(games.slice().sort((x, y) => Math.abs(x.pHome - x.pAway) - Math.abs(y.pHome - y.pAway))
    .slice(0, draws));
  const byKey = new Map(games.map((m) => [matchKey(m), level.has(m) ? [1, 1] : m.pHome >= m.pAway ? [1, 0] : [0, 1]]));
  local.guess = { byKey, draws, total: games.length };
  return local.guess;
}
const guessOf = (m) => modelGuess().byKey.get(matchKey(m)).slice();

function renderSimManual() {
  if (!local.picks) local.picks = loadPicks();
  const rounds = local.sim.rounds;
  if (!rounds.length) {
    $("siman-sub").textContent = tx("Nenhum jogo a disputar no calendário.");
    clear($("siman-games"));
    return;
  }
  local.manRound = Math.min(Math.max(0, local.manRound), rounds.length - 1);
  const block = rounds[local.manRound];
  const guess = modelGuess();
  $("siman-round-title").textContent = tx(block.round ? "Rodada {n}" : "Jogos sem data definida", { n: block.round });
  $("siman-hint").textContent = tx("Digite os placares ou use 1, X e 2. A barrinha mostra as chances de vitória do mandante, empate e vitória do visitante. O número apagado é o palpite do modelo: os jogos mais equilibrados viram 1-1, na quantidade de empates que ele espera até o fim da temporada ({empates} de {total}), e nos outros vence o favorito, por 1-0 ou 0-1. Zebras só aparecem no sorteio.",
    { empates: fmt(guess.draws), total: fmt(guess.total) });
  const pick = clear($("siman-round"));
  rounds.forEach((b, i) => pick.appendChild(el("option", { value: String(i), text: tx(b.round ? "Rodada {n}" : "Sem data", { n: b.round }) })));
  pick.value = String(local.manRound);
  pick.onchange = () => { local.manRound = Number(pick.value); renderSimManual(); };
  $("siman-prev").disabled = local.manRound === 0;
  $("siman-next").disabled = local.manRound === rounds.length - 1;
  $("siman-prev").onclick = () => { local.manRound--; renderSimManual(); };
  $("siman-next").onclick = () => { local.manRound++; renderSimManual(); };
  const setAll = (matches, choose, onlyEmpty) => {
    matches.forEach((m) => { const k = matchKey(m); if (!onlyEmpty || !local.picks[k]) local.picks[k] = choose(m); });
    savePicks();
    renderSimManual();
  };
  $("siman-fill").onclick = () => setAll(allSimMatches(), guessOf, true);
  $("siman-clear").onclick = () => { local.picks = {}; savePicks(); renderSimManual(); };
  $("siman-fill-round").onclick = () => setAll(block.matches, guessOf, false);
  $("siman-draw-round").onclick = () => setAll(block.matches, drawScore, false);
  const host = clear($("siman-games"));
  block.matches.forEach((m) => host.appendChild(manualMatchNode(m)));
  renderManualTable();
}

function manualMatchNode(m) {
  const key = matchKey(m);
  const current = local.picks[key];
  const guess = guessOf(m);
  const inputs = [];
  const node = el("div", { class: "siman-row" });
  const paint = () => {
    const p = local.picks[key];
    node.classList.toggle("done", !!p);
    node.classList.toggle("home-win", !!p && p[0] > p[1]);
    node.classList.toggle("away-win", !!p && p[0] < p[1]);
  };
  const apply = () => {  // both boxes filled = a result; anything else = not simulated
    const vals = inputs.map((i) => i.value === "" ? null : Math.max(0, Math.min(15, Math.floor(Number(i.value)))));
    if (vals.some((v) => v === null || Number.isNaN(v))) delete local.picks[key];
    else local.picks[key] = vals;
    savePicks();
    paint();
    renderManualTable();
  };
  [["home", 0], ["away", 1]].forEach(([side, i]) => {
    const inp = el("input", { type: "number", min: "0", max: "15", inputmode: "numeric", class: "gol",
      placeholder: String(guess[i]), "aria-label": tx("gols {time}", { time: side === "home" ? m.home.short : m.away.short }) });
    if (current) inp.value = String(current[i]);
    inp.oninput = apply;
    inputs.push(inp);
  });
  const set = (gh, ga) => { inputs[0].value = String(gh); inputs[1].value = String(ga); apply(); };
  node.append(
    el("span", { class: "side home" }, el("span", { text: m.home.short || m.home.name }), crest(m.home)),
    el("span", { class: "score" }, inputs[0], el("span", { class: "x", text: "x" }), inputs[1]),
    el("span", { class: "side away" }, crest(m.away), el("span", { text: m.away.short || m.away.name })),
    el("span", { class: "quick" },
      el("button", { class: "ooyl-btn ooyl-btn--sm", title: "vitória do mandante, 1-0", text: "1", onclick: () => set(1, 0) }),
      el("button", { class: "ooyl-btn ooyl-btn--sm", title: "empate, 1-1", text: "X", onclick: () => set(1, 1) }),
      el("button", { class: "ooyl-btn ooyl-btn--sm", title: "vitória do visitante, 0-1", text: "2", onclick: () => set(0, 1) }),
      el("button", { class: "ooyl-btn ooyl-btn--sm ooyl-btn--ghost", title: "palpite do modelo para este jogo", text: "palpite",
                     onclick: () => set(guess[0], guess[1]) })),
    oddsBar(m.pHome, m.pDraw, m.pAway, false));
  paint();
  return node;
}

// ---- the model's probabilities ------------------------------------------------------------
// The columns are the league's: sim.columns, each a range of final positions with a tone.
function renderSim() {
  const sim = local.sim, info = sim.model, columns = sim.columns || [];
  const when = sim.updated ? new Date(sim.updated * 1000).toLocaleDateString(LOCALE,
    { day: "2-digit", month: "2-digit", year: "numeric" }) : tx("data desconhecida");
  $("sim-sub").textContent = tx("{jogados} jogos disputados, {restantes} a simular e {sorteios} temporadas sorteadas. Força de ataque e defesa de cada time pelo xG e pelos gols, descontando os adversários enfrentados, com os jogos recentes pesando mais. Calendário lido em {quando}.",
    { jogados: fmt(info.played), restantes: fmt(info.remaining), sorteios: fmt(sim.runs), quando: when });
  $("sim-reload").onclick = () => open(true);

  // The tiles: the title favourite, the fight for the widest good column (the one a team can still
  // play for), and who is threatened by the bad one.
  const title = columns.find((c) => c.from === 1 && c.to === 1);
  const goods = columns.filter((c) => c.tone === "good");
  const fight = goods.length ? goods.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a)) : null;
  const bad = columns.find((c) => c.tone === "bad");
  const chance = (r, c) => r.chances[c.key];
  const cards = [];
  if (title) {
    const favourite = sim.table.reduce((a, b) => (chance(b, title) > chance(a, title) ? b : a));
    cards.push([tx("Favorito ao {coluna}", { coluna: tx(title.label).toLowerCase() }), pctText(chance(favourite, title)), teamName(favourite.team)]);
  }
  if (fight) {
    const fighting = sim.table.filter((r) => chance(r, fight) > 0.01 && chance(r, fight) < 0.99).length;
    cards.push([tx("Briga pelo {coluna}", { coluna: tx(fight.label) }), String(fighting), "times entre 1% e 99% de chance"]);
  }
  if (bad) {
    const threatened = sim.table.filter((r) => chance(r, bad) > 0.01).length;
    const worst = sim.table.reduce((a, b) => (chance(b, bad) > chance(a, bad) ? b : a));
    cards.push(["Ameaçados", String(threatened), el("span", {}, "mais provável: ", teamName(worst.team.short), ` (${pctText(chance(worst, bad))})`)]);
  }
  cards.push(["Jogos a simular", fmt(info.remaining), tx("{n} rodadas restantes", { n: sim.rounds.length })]);
  tiles($("sim-kpis"), cards);

  const table = clear($("sim-table"));
  const head = ["#", "Time", "J", "Pts", "Pts fim", ...columns.map((c) => c.label)];
  const hints = { "Pts fim": "Pontos médios ao fim da temporada nas simulações",
                  ...Object.fromEntries(columns.map((c) => [c.label, c.hint || ""])) };
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) =>
    el("th", { class: i <= 1 ? "left" : "", text: h, title: hints[h] || "" })))));
  table.appendChild(el("tbody", {}, sim.table.map((r) => el("tr", {
    class: "row-link", title: "abrir o time", onclick: () => go("#/time/" + r.team.id),
  },
    el("td", { class: "left pos" }, el("i", { class: "zone " + zoneOf(r.pos) }), String(r.pos)),
    el("td", { class: "left" }, crest(r.team), el("span", { text: r.team.name })),
    el("td", { text: fmt(r.j) }), el("td", { text: fmt(r.pts) }),
    el("td", { class: "strong", text: fmt(r.ptsProj, 1) }),
    columns.map((c) => pctCell(chance(r, c), c.tone))))));

  const pick = clear($("sim-round"));
  pick.appendChild(el("option", { value: "todas", text: "Todas as rodadas" }));
  sim.rounds.forEach((b) => pick.appendChild(el("option", { value: String(b.round),
    text: tx(b.round ? "Rodada {n}" : "Sem data", { n: b.round }) })));
  if (!local.round || !sim.rounds.some((b) => String(b.round) === local.round)) {
    local.round = String(sim.rounds[0].round);
  }
  pick.value = local.round;
  pick.onchange = () => { local.round = pick.value; renderSimGames(); };
  renderSimGames();
}

function renderSimGames() {
  const host = clear($("sim-games"));
  const blocks = local.round === "todas" ? local.sim.rounds
    : local.sim.rounds.filter((b) => String(b.round) === local.round);
  blocks.forEach((block) => {
    host.appendChild(el("div", { class: "round-name",
      text: tx(block.round ? "Rodada {n} · mandante, empate, visitante" : "Sem data definida · mandante, empate, visitante", { n: block.round }) }));
    host.appendChild(el("div", { class: "ooyl-matches" }, block.matches.map(simMatchNode)));
  });
  renderSimSecond(blocks);
}

// The second model (analysis/ratings.py) next to the simulator's: the chosen round's games by both and by
// their mean, then every team's rating. sim.second.games goes by "home id-away id"; a payload without it
// hides the card.
function renderSimSecond(blocks) {
  const second = local.sim.second;
  $("sim-second").hidden = !second;
  if (!second) return;
  const trio = (chances) => chances.map((p) => fmt(100 * p, 0)).join(" · ");
  const signed = (v) => (v > 0 ? "+" : "") + fmt(v, 2);
  const host = clear($("sim-second-games"));
  blocks.forEach((block) => {
    host.appendChild(el("div", { class: "round-name",
      text: tx(block.round ? "Rodada {n} · mandante, empate e visitante, em %" : "Sem data definida · mandante, empate e visitante, em %", { n: block.round }) }));
    host.appendChild(el("div", { class: "scroll" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Jogo", "Simulador", "Notas", "Média dos dois"].map((h, i) => el("th", { class: i ? "" : "left", text: h })))),
      el("tbody", {}, block.matches.map((m) => {
        const theirs = [m.pHome, m.pDraw, m.pAway], ours = second.games[`${m.home.id}-${m.away.id}`];
        return el("tr", {},
          el("td", { class: "left" }, crest(m.home), el("span", { text: `${m.home.short || m.home.name} x ${m.away.short || m.away.name}` })),
          el("td", { text: trio(theirs) }), el("td", { text: ours ? trio(ours) : "-" }),
          el("td", { class: "strong", text: ours ? trio(theirs.map((p, i) => (p + ours[i]) / 2)) : "-" }));
      })))));
  });
  const table = clear($("sim-second-table"));
  table.appendChild(el("thead", {}, el("tr", {}, ["#", "Time", "Em casa", "Fora", "Média"].map((h, i) =>
    el("th", { class: i <= 1 ? "left" : "", text: h })))));
  table.appendChild(el("tbody", {}, second.table.map((r, i) => el("tr", {
    class: "row-link", title: "abrir o time", onclick: () => go("#/time/" + r.team.id),
  },
    el("td", { class: "left pos", text: String(i + 1) }),
    el("td", { class: "left" }, crest(r.team), el("span", { text: r.team.name })),
    el("td", { text: signed(r.home) }), el("td", { text: signed(r.away) }),
    el("td", { class: "strong", text: signed(r.rating) })))));
}

// The model's most likely score in an outlined box, the odds as one split bar.
function simMatchNode(m) {
  const node = el("div", { class: "ooyl-match is-predicted has-odds" },
    el("span", { class: "ooyl-match__when", text: m.timestamp ? dateOf(m.timestamp) : "s/ data" }),
    el("span", { class: "ooyl-match__side is-home is-draw" }, el("span", { text: m.home.short || m.home.name }), crest(m.home)),
    el("span", { class: "ooyl-match__score" }, el("span", { text: String(m.score[0]) }), el("i", { text: "–" }),
      el("span", { text: String(m.score[1]) })),
    el("span", { class: "ooyl-match__side is-away is-draw" }, crest(m.away), el("span", { text: m.away.short || m.away.name })),
    el("span", { class: "ooyl-match__end" }, oddsBar(m.pHome, m.pDraw, m.pAway)));
  const show = (ev) => showTip(ev.clientX, ev.clientY, [
    el("div", { class: "l", text: tx("{casa} x {fora}", { casa: m.home.short, fora: m.away.short }) }),
    tipLine("vitória do mandante", pctText(m.pHome), "var(--home)"),
    tipLine("empate", pctText(m.pDraw), "var(--data-context)"),
    tipLine("vitória do visitante", pctText(m.pAway), "var(--away)"),
    el("div", { class: "l", text: tx("gols esperados {casa} x {fora}", { casa: fmt(m.lh, 2), fora: fmt(m.la, 2) }) }),
    el("div", { class: "l", text: tx("placar mais provável {placar} ({pct})", { placar: `${m.score[0]}-${m.score[1]}`, pct: pctText(m.scoreP) }) }),
    el("div", { class: "l", text: m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString(LOCALE,
      { day: "2-digit", month: "long" }) : "sem data definida" }),
  ]);
  node.addEventListener("pointermove", show);
  node.addEventListener("pointerleave", hideTip);
  return node;
}

$("sim-modes").addEventListener("click", (ev) => {
  const btn = ev.target.closest('[role="tab"]');
  if (!btn) return;
  local.mode = btn.dataset.smode;
  if (local.sim) renderSimView(); else open();
});

// A new match or a new calendar moves the simulation: draw it again on the next visit.
on("index", () => { local.sim = null; local.guess = null; if (state.view === "simulador") open(); });
