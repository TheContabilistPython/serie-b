// Temporada: the headline numbers, the standings with the league's zones, goals per round, top scorers.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { tipLine } from "../core/tooltip.js";
import { lineChart, barList } from "../core/charts.js";
import { crest, face, teamName, tiles } from "../core/ui.js";
import { zoneOf } from "../core/league.js";
import { tx } from "../core/i18n.js";

const TITLES = { P: "Pontos", J: "Jogos", V: "Vitórias", E: "Empates", D: "Derrotas", GP: "Gols pró", GC: "Gols contra", SG: "Saldo de gols", xG: "Gols esperados a favor", xGC: "Gols esperados sofridos" };

function renderKpis(t) {
  tiles($("kpis"), [
    ["Partidas", fmt(t.matches), "finalizadas e coletadas"],
    ["Gols", fmt(t.goals), tx("{n} por jogo", { n: fmt(t.goals / t.matches, 2) })],
    ["xG total", fmt(t.xg, 1), tx("{n} por jogo", { n: fmt(t.xg / t.matches, 2) })],
    ["Finalizações", fmt(t.shots), tx("{n} por jogo", { n: fmt(t.shots / t.matches, 1) })],
    ["Cartões", fmt(t.yellow + t.red), tx("{amarelos} amarelos, {vermelhos} vermelhos", { amarelos: fmt(t.yellow), vermelhos: fmt(t.red) })],
  ]);
}

function renderStandings(rows) {
  const table = clear($("standings"));
  const head = ["#", "Time", "P", "J", "V", "E", "D", "GP", "GC", "SG", "xG", "xGC"];
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) =>
    el("th", { class: i === 1 ? "left" : "", text: h, title: TITLES[h] || "" })))));
  const body = el("tbody");
  rows.forEach((r) => {
    // A row is the team: clicking anywhere on it opens the team's page in the Times tab.
    body.appendChild(el("tr", { class: "row-link", title: tx("abrir {time} na aba Times", { time: r.team.name }),
                                onclick: () => go("#/time/" + r.team.id) },
      el("td", { class: "left pos" }, el("i", { class: "zone " + zoneOf(r.pos) }), String(r.pos)),
      el("td", { class: "left" }, crest(r.team), el("span", { text: r.team.name })),
      el("td", { class: "strong", text: fmt(r.pts) }),
      el("td", { text: fmt(r.j) }), el("td", { text: fmt(r.v) }), el("td", { text: fmt(r.e) }), el("td", { text: fmt(r.d) }),
      el("td", { text: fmt(r.gp) }), el("td", { text: fmt(r.gc) }),
      el("td", { text: (r.sg > 0 ? "+" : "") + fmt(r.sg) }),
      el("td", { class: "muted", text: fmt(r.xg, 1) }), el("td", { class: "muted", text: fmt(r.xga, 1) })));
  });
  table.appendChild(body);
}

// line chart: one series against the season average, the latest round highlighted
function renderRounds(rounds) {
  const max = Math.max(10, ...rounds.map((r) => r.goals));
  const avg = rounds.length ? rounds.reduce((a, r) => a + r.goals, 0) / rounds.length : 0;
  const last = rounds[rounds.length - 1];
  lineChart($("rounds-chart"), {
    label: "Gols por rodada", yMin: 0, yMax: Math.ceil(max / 5) * 5, yStep: 5,
    reference: { value: avg, label: tx("média {v}", { v: fmt(avg, 1) }) }, lastLabel: last ? tx("{n} gols", { n: last.goals }) : null,
    points: rounds.map((r) => ({ x: r.round, y: r.goals, tip: () => [
      el("div", { class: "l", text: tx("Rodada {n}", { n: r.round }) }),
      tipLine("gols", fmt(r.goals), "var(--data-dot)"),
      el("div", { class: "l", text: tx("{n} partidas, {media} por jogo", { n: r.matches, media: fmt(r.goals / r.matches, 2) }) }),
    ] })),
  });

  const table = clear($("rounds-table"));
  table.appendChild(el("thead", {}, el("tr", {}, el("th", { class: "left", text: "Rodada" }), el("th", { text: "Partidas" }), el("th", { text: "Gols" }), el("th", { text: "Média" }))));
  table.appendChild(el("tbody", {}, rounds.map((r) => el("tr", {},
    el("td", { class: "left", text: String(r.round) }), el("td", { text: fmt(r.matches) }),
    el("td", { text: fmt(r.goals) }), el("td", { text: fmt(r.goals / r.matches, 2) })))));
}

// horizontal bars: one series, direct labels at the tip
// O servidor manda a artilharia inteira (a aba Estatísticas usa); aqui cabe o topo.
function renderScorers(all) {
  const scorers = all.slice(0, 15);
  barList($("scorers-chart"), scorers, {
    label: "Artilheiros", value: (s) => s.goals, text: (s) => fmt(s.goals),
    name: (s) => s.name, note: (s) => s.team, face: (s) => s.face, logo: (s) => s.logo,
    open: (s) => "#/jogador/" + s.id,
    tip: (s) => [
      el("div", { class: "l" }, s.name + " - ", teamName(s.team)),
      tipLine("gols", fmt(s.goals), "var(--data-dot)"),
      el("div", { class: "l", text: s.penalties ? tx("{n} de pênalti", { n: s.penalties }) : "nenhum de pênalti" }),
    ],
  });

  const table = clear($("scorers-table"));
  table.appendChild(el("thead", {}, el("tr", {}, el("th", { class: "left", text: "Jogador" }), el("th", { class: "left", text: "Time" }), el("th", { text: "Gols" }), el("th", { text: "Pênaltis" }))));
  table.appendChild(el("tbody", {}, scorers.map((s) => el("tr", {},
    el("td", { class: "left" }, face(s), el("span", { text: s.name })),
    el("td", { class: "left" }, crest(s), el("span", { text: s.team })),
    el("td", { text: fmt(s.goals) }), el("td", { text: fmt(s.penalties) })))));
}

on("index", () => {
  const index = state.index;
  renderKpis(index.totals);
  renderStandings(index.table);
  renderRounds(index.rounds);
  renderScorers(index.scorers);
});

on("theme", () => {
  if (!state.index) return;
  renderRounds(state.index.rounds);
  renderScorers(state.index.scorers);
});
