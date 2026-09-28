// Jogador: one player's season, match by match (#/jogador/{id}, /api/player/{id}).
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView } from "../core/router.js";
import { tipLine } from "../core/tooltip.js";
import { lineChart } from "../core/charts.js";
import { cardBox, crest, face, rateChip, teamName, tiles } from "../core/ui.js";
import { POS_ONE } from "../core/players.js";
import { getJSON } from "../core/api.js";
import { tx, txn } from "../core/i18n.js";

const CARD_LABEL = { yellow: "amarelo", red: "vermelho", yellowRed: "2º amarelo" };
const local = { player: null };

export async function open(id) {
  if (local.player && local.player.id === id) { setView("jogador"); return; }
  setView("jogador");
  clear($("player-body")).appendChild(el("div", { class: "empty", text: "Carregando jogador..." }));
  try {
    local.player = await getJSON("/api/player/" + id);
    renderPlayer();
  } catch (err) {
    clear($("player-body")).appendChild(el("div", { class: "empty err", text: tx("Falha ao ler o jogador: {erro}", { erro: err.message }) }));
  }
}

function renderPlayer() {
  const p = local.player, s = p.summary || {}, rows = p.matches;
  const host = clear($("player-body"));
  const rated = rows.filter((r) => r.rating !== null && r.rating !== undefined);
  const avg = rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : null;
  const best = rated.length ? Math.max(...rated.map((r) => r.rating)) : null;
  const sum = (key) => rows.reduce((a, r) => a + (r[key] || 0), 0);
  const last = rows[rows.length - 1];
  const photo = face(p, "xl");
  host.appendChild(el("header", { class: "page-hero" },
    el("span", { class: "page-hero__media" }, photo || crest(s, "xl"), photo ? crest(s, true) : null),
    el("div", {},
      el("h1", { text: s.name || tx("Jogador {id}", { id: p.id }) }),
      el("p", { class: "ooyl-sub" }, teamName(s.team || (last && last.team) || ""),
        " · " + [tx(POS_ONE[s.position]), tx("{n} jogos com nota", { n: rows.length })].filter(Boolean).join(" · ")))));
  const kpis = el("div", { class: "ooyl-tiles" });
  tiles(kpis, [
    ["Nota média", fmt(avg, 2), tx("melhor: {n}", { n: fmt(best, 1) })],
    ["Minutos", fmt(sum("minutes")), tx("{n} por jogo", { n: fmt(sum("minutes") / rows.length, 0) })],
    ["Gols", fmt(sum("goals")), sum("ownGoals") ? tx("{n} contra", { n: sum("ownGoals") }) : "pelos incidentes da partida"],
    ["Assistências", fmt(sum("assists")), ""],
    ["Cartões", fmt(p.cards.yellow + p.cards.red), tx("{amarelos} amarelos, {vermelhos} vermelhos", { amarelos: fmt(p.cards.yellow), vermelhos: fmt(p.cards.red) })],
  ]);
  host.appendChild(kpis);

  const chartHost = el("div", {});
  host.appendChild(cardBox("Nota por rodada", "Uma nota por partida disputada. A linha tracejada é a média da liga.", chartHost));
  renderPlayerChart(chartHost, rows);

  const table = el("table");
  const head = ["Rod.", "Adversário", "Local", "Placar", "Min", "Nota", "G", "A", "xG", "xA", "Cartão"];
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { class: i <= 3 ? "left" : "", text: h })))));
  table.appendChild(el("tbody", {}, rows.map((r) => el("tr", { class: "row-link", title: "abrir a partida", onclick: () => go("#/partida/" + r.match) },
    el("td", { class: "left", text: String(r.round ?? "-") }),
    el("td", { class: "left" }, crest({ logo: r.opponentLogo }), el("span", { text: r.opponent })),
    el("td", { class: "left", text: r.home ? "casa" : "fora" }),
    el("td", { class: "left " + (r.result === "V" ? "win" : r.result === "D" ? "lose" : ""), text: `${r.gf}-${r.ga} (${tx(r.result)})` }),
    el("td", { text: fmt(r.minutes) }), el("td", {}, rateChip(r.rating) || "-"),
    el("td", { text: fmt(r.goals) }), el("td", { text: fmt(r.assists) }),
    el("td", { text: r.xg == null ? "-" : fmt(r.xg, 2) }), el("td", { text: r.xa == null ? "-" : fmt(r.xa, 2) }),
    el("td", { text: CARD_LABEL[r.card] || "" })))));
  host.appendChild(cardBox("Partida a partida", "Clique numa linha para abrir a partida.", el("div", { class: "scroll" }, table)));
}

// Uma série, eixo X = rodada: um jogo que o jogador não disputou aparece como salto na linha.
function renderPlayerChart(host, rows) {
  const pts = rows.filter((r) => r.rating != null && r.round != null);
  const league = state.index.playerTotals.avg;
  const vals = pts.map((r) => r.rating);
  const lo = Math.max(3, Math.floor(Math.min(league || 10, ...vals) - 0.5));
  const hi = Math.min(10, Math.ceil(Math.max(league || 0, ...vals) + 0.5));
  const last = pts[pts.length - 1];
  lineChart(host, {
    label: "Nota por rodada", empty: "Sem notas registradas.", yMin: lo, yMax: hi, yStep: 1, height: 260, dots: true,
    reference: league ? { value: league, label: tx("média da liga {v}", { v: fmt(league, 2) }) } : null,
    lastLabel: last ? fmt(last.rating, 1) : null,
    points: pts.map((r) => ({ x: r.round, y: r.rating, tip: () => [
      el("div", { class: "l" }, txn(r.home ? "Rodada {n} · {adversario} {placar}" : "Rodada {n} · fora, {adversario} {placar}",
        { n: r.round, adversario: teamName({ name: r.opponent, logo: r.opponentLogo }), placar: `${r.gf}-${r.ga}` })),
      tipLine("nota", fmt(r.rating, 1), "var(--data-dot)"),
      el("div", { class: "l", text: tx(r.goals === 1 ? "{min} min, {g} gol, {a} assist." : "{min} min, {g} gols, {a} assist.",
        { min: r.minutes, g: r.goals, a: r.assists }) }),
    ] })),
  });
}

$("player-back").addEventListener("click", () => go("#/jogadores"));

on("index", () => { local.player = null; });  // a new match changes the series: read it again on the next visit
on("theme", () => { if (state.view === "jogador" && local.player) renderPlayer(); });
