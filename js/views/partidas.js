// Partidas: two lists under the Resultados and Próximas rodadas tabs, with the same round and team
// filters. Each list keeps its own round: the rounds ahead are not the ones already played.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView, syncTabs } from "../core/router.js";
import { crest, teamName } from "../core/ui.js";
import { dateOf, dated, daysAway, daySpan, longDay, timeOf, weekdayOf } from "../core/format.js";
import { LOCALE, tx, txn } from "../core/i18n.js";

const MMODES = ["resultados", "proximas"];
const local = { mode: "resultados", round: "", nextRound: "", team: "" };
const aheadMode = () => local.mode === "proximas";
const calendarMatches = () => (state.index.calendar && state.index.calendar.matches) || [];

export function open(mode) {
  local.mode = MMODES.includes(mode) ? mode : "resultados";
  setView("partidas");
  renderFilters();
  renderMatchList();
}

function renderFilters() {
  const ahead = aheadMode(), key = ahead ? "nextRound" : "round";
  // Played rounds newest first, rounds ahead soonest first.
  const rounds = [...new Set((ahead ? calendarMatches() : state.index.matches).map((m) => m.round))]
    .filter((r) => r !== null).sort((a, b) => ahead ? a - b : b - a);
  if (!rounds.some((r) => String(r) === local[key])) local[key] = "";  // a round ahead gets played and leaves
  const fr = clear($("f-round"));
  fr.appendChild(el("option", { value: "", text: "Todas as rodadas" }));
  rounds.forEach((r) => fr.appendChild(el("option", { value: String(r), text: tx("Rodada {n}", { n: r }) })));
  fr.value = local[key];
  fr.onchange = () => { local[key] = fr.value; renderMatchList(); };

  // Teams of both lists, so the one picked stays put across the tabs.
  const teams = [...new Map([...state.index.matches, ...calendarMatches()].flatMap((m) => [[m.home.id, m.home], [m.away.id, m.away]])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const ft = clear($("f-team"));
  ft.appendChild(el("option", { value: "", text: "Todos os times" }));
  teams.forEach((t) => ft.appendChild(el("option", { value: String(t.id), text: t.name })));
  ft.value = local.team;
  ft.onchange = () => { local.team = ft.value; renderMatchList(); };
}

function renderMatchList() {
  const ahead = aheadMode(), round = ahead ? local.nextRound : local.round;
  syncTabs($("match-modes"), "mmode", local.mode);
  $("matches-title").textContent = tx(ahead ? "Próximas rodadas" : "Resultados");
  const host = clear($("match-list"));
  let list = ahead ? calendarMatches() : state.index.matches;
  if (round) list = list.filter((m) => String(m.round) === round);
  if (local.team) list = list.filter((m) => String(m.home.id) === local.team || String(m.away.id) === local.team);
  if (ahead) { renderUpcoming(host, list); return; }
  $("matches-sub").textContent = tx(list.length === 1 ? "{n} partida. Clique para abrir os dados completos."
    : "{n} partidas. Clique para abrir os dados completos.", { n: fmt(list.length) });
  if (!list.length) { host.appendChild(el("div", { class: "empty", text: "Nenhuma partida com esses filtros." })); return; }
  list.forEach((m) => {
    // The winner in ink-strong, the loser muted; a draw keeps both in ink.
    const res = m.gh > m.ga ? "home" : m.gh < m.ga ? "away" : "draw";
    const side = (t, which) => el("span", { class: `ooyl-match__side is-${which}` + (res === which ? " is-win" : res === "draw" ? " is-draw" : "") },
      which === "home" ? [el("span", { text: t.name }), crest(t)] : [crest(t), el("span", { text: t.name })]);
    host.appendChild(el("button", { class: "ooyl-match", onclick: () => go("#/partida/" + m.id) },
      el("span", { class: "ooyl-match__when", text: dateOf(m.timestamp) }),
      side(m.home, "home"),
      el("span", { class: "ooyl-match__score" }, el("span", { text: String(m.gh) }), el("i", { text: "–" }), el("span", { text: String(m.ga) })),
      side(m.away, "away"),
      el("span", { class: "ooyl-match__end" }, "xG ", el("b", { text: fmt(m.xgh, 1) }), " – ", el("b", { text: fmt(m.xga, 1) }))));
  });
}

// The calendar ahead: the same list the simulator plays out (fixtures.json minus what is collected),
// grouped by round in playing order: a postponed game moved ahead of a later round comes first.
// Games still without a date close the list. None has a page yet, so no row is a link.
function renderUpcoming(host, list) {
  const cal = state.index.calendar, sub = clear($("matches-sub"));
  if (!cal) {
    sub.textContent = tx("Sem calendário em disco.");
    host.appendChild(el("div", { class: "empty" },
      ["Baixe-o em Admin › Atualizar calendário ou rode ", el("code", { text: "python coletar.py calendario" }), "."]));
    return;
  }
  const now = Date.now() / 1000;
  const next = list.filter((m) => dated(m) && m.timestamp > now)
    .reduce((best, m) => (!best || m.timestamp < best.timestamp ? m : best), null);
  const together = next ? list.filter((m) => dated(m) && m.timestamp === next.timestamp).length - 1 : 0;
  const updated = cal.updated ? new Date(cal.updated * 1000).toLocaleString(LOCALE,
    { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  if (list.length) sub.append(tx(list.length === 1 ? "{n} jogo a disputar. " : "{n} jogos a disputar. ", { n: fmt(list.length) }));
  if (next) sub.append(...txn(together ? "Próximo jogo: {dia}, às {hora}, {casa} x {fora} e mais {n} no mesmo horário. "
    : "Próximo jogo: {dia}, às {hora}, {casa} x {fora}. ", { dia: longDay(next.timestamp), hora: timeOf(next.timestamp),
    casa: teamName(next.home), fora: teamName(next.away), n: together }));
  if (updated) sub.append(tx("Calendário atualizado em {quando}.", { quando: updated }));
  if (!list.length) {
    host.appendChild(el("div", { class: "empty", text: cal.matches.length ? "Nenhum jogo a disputar com esses filtros."
      : "Nenhum jogo a disputar no calendário." }));
    return;
  }
  const rounds = new Map();  // filled in kickoff order, so each round sits where its first game is
  list.filter(dated).sort((a, b) => a.timestamp - b.timestamp).forEach((m) => {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round).push(m);
  });
  const block = (title, games) => [el("div", { class: "round-name", text: title }),
    el("div", { class: "ooyl-matches" }, games.map((m) => upcomingNode(m, now, next)))];
  rounds.forEach((games, rnd) => host.append(...block(
    tx("Rodada {n} · {dias}", { n: rnd ?? "?", dias: daySpan(games[0].timestamp, games[games.length - 1].timestamp) }), games)));
  const undated = list.filter((m) => !dated(m));
  if (undated.length) host.append(...block("Sem data definida", undated));
}

// Date and kickoff where a result has its score; the next kickoff gets the accent.
function upcomingNode(m, now, next) {
  const when = dated(m), isNext = when && !!next && m.timestamp === next.timestamp;
  const note = !when ? (m.status === "canceled" ? "cancelado" : "adiado")
    : m.timestamp <= now ? "aguardando coleta" : daysAway(m.timestamp);  // kicked off, no result on disk yet
  return el("div", { class: "ooyl-match is-upcoming" + (isNext ? " is-next" : "") },
    el("span", { class: "ooyl-match__when" }, when ? [el("small", { text: weekdayOf(m.timestamp) }), dateOf(m.timestamp)] : "–"),
    el("span", { class: "ooyl-match__side is-home is-draw" }, el("span", { text: m.home.name }), crest(m.home)),
    el("span", { class: "ooyl-match__score", title: when ? `${longDay(m.timestamp)}, ${timeOf(m.timestamp)}` : "sem data definida" },
      when ? timeOf(m.timestamp) : "x"),
    el("span", { class: "ooyl-match__side is-away is-draw" }, crest(m.away), el("span", { text: m.away.name })),
    el("span", { class: "ooyl-match__end" }, isNext ? el("span", { class: "ooyl-tag ooyl-tag--accent", text: "Próximo" }) : note));
}

$("match-modes").addEventListener("click", (ev) => {
  const btn = ev.target.closest('[role="tab"]');
  if (btn) go("#/partidas/" + btn.dataset.mmode);
});

on("index", () => { renderFilters(); renderMatchList(); });
