// Desempenho individual: the season's ratings per player, with a minimum of games and a position.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView } from "../core/router.js";
import { tipLine } from "../core/tooltip.js";
import { dotPlot } from "../core/charts.js";
import { teamName, tiles } from "../core/ui.js";
import { POS_LABEL, RANKING_LIMIT, minGamesOptions, playerTable } from "../core/players.js";
import { tx, txn } from "../core/i18n.js";

const local = { minGames: 0, pos: "" };

export function open() { setView("jogadores"); }

function renderPlayerFilters() {
  const options = minGamesOptions();
  if (!options.some(([v]) => v === local.minGames)) local.minGames = options[0][0];
  const fm = clear($("f-min"));
  options.forEach(([v, label]) => fm.appendChild(el("option", { value: String(v), text: label })));
  fm.value = String(local.minGames);
  fm.onchange = () => { local.minGames = Number(fm.value); renderPlayers(); };

  const fp = clear($("f-pos"));
  fp.appendChild(el("option", { value: "", text: "Todas as posições" }));
  Object.entries(POS_LABEL).forEach(([k, label]) => fp.appendChild(el("option", { value: k, text: label })));
  fp.value = local.pos;
  fp.onchange = () => { local.pos = fp.value; renderPlayers(); };

  // Busca por nome: escolher uma sugestão abre a temporada do jogador.
  const list = clear($("players-list"));
  state.index.players.forEach((p) => list.appendChild(
    el("option", { value: `${p.name} (${p.code || p.team})`, "data-id": String(p.id) })));
  const find = $("f-find");
  find.onchange = () => {
    const hit = [...list.options].find((o) => o.value === find.value);
    if (hit) { find.value = ""; go("#/jogador/" + hit.dataset.id); }
  };
}

// O servidor já entrega os jogadores ordenados por nota média.
const qualified = () => state.index.players.filter(
  (p) => p.j >= local.minGames && (!local.pos || p.position === local.pos));

function renderPlayerKpis() {
  const t = state.index.playerTotals;
  const best = t.best;
  tiles($("player-kpis"), [
    ["Jogadores avaliados", fmt(t.players), "com ao menos uma nota"],
    ["Notas coletadas", fmt(t.ratings), tx("{n} por partida", { n: fmt(t.ratings / state.index.totals.matches, 1) })],
    ["Nota média da liga", fmt(t.avg, 2), "linha de referência do gráfico"],
    ["Maior nota individual", best ? fmt(best.rating, 1) : "-",
     best ? el("span", {}, txn("{nome} ({time}), rodada {n}", { nome: best.name, time: teamName(best.team), n: best.round })) : "sem notas"],
  ]);
}

// Dot plot, e não barras: as médias vivem entre 6 e 7,5, e barras a partir do zero
// sairiam todas do mesmo tamanho. Pontos admitem um eixo que não começa em zero.
function renderTopRated(list) {
  const top = list.slice(0, 10);
  const host = clear($("top-rated-chart"));
  const sub = $("top-rated-sub");
  if (!top.length) {
    sub.textContent = "";
    clear($("top-rated-table"));
    host.appendChild(el("div", { class: "empty", text: "Nenhum jogador atende a esses filtros." }));
    return;
  }
  sub.textContent = tx(local.minGames > 1 ? "Média das notas de cada partida disputada. Mínimo de {n} jogos"
    : "Média das notas de cada partida disputada. Mínimo de {n} jogo", { n: local.minGames })
    + (local.pos ? tx(", só {posicao}.", { posicao: tx(POS_LABEL[local.pos]).toLowerCase() }) : tx(", todas as posições."));

  const league = state.index.playerTotals.avg;
  dotPlot(host, top, {
    label: "Top 10 jogadores por nota média", value: (p) => p.avg, digits: 2,
    reference: league ? { value: league, label: tx("média da liga {v}", { v: fmt(league, 2) }) } : null,
    name: (p) => p.name || "", note: (p) => p.code || p.team || "", face: (p) => p.face, logo: (p) => p.logo,
    open: (p) => "#/jogador/" + p.id,
    tip: (p) => [
      el("div", { class: "l" }, p.name + " - ", teamName(p.team)),
      tipLine("nota média", fmt(p.avg, 2), "var(--data-dot)"),
      el("div", { class: "l", text: tx("{n} jogos, {min} minutos", { n: p.j, min: fmt(p.min) }) }),
      el("div", { class: "l", text: tx("{g} gols, {a} assistências", { g: p.goals, a: p.assists }) }),
      el("div", { class: "l", text: tx("melhor nota: {n}", { n: fmt(p.best, 1) }) }),
    ],
  });
  playerTable($("top-rated-table"), top, 10);
}

function renderPlayers() {
  const list = qualified();
  const total = state.index.playerTotals.players;
  $("players-scope").textContent = tx("{n} de {total} jogadores no recorte.", { n: fmt(list.length), total: fmt(total) });
  renderTopRated(list);
  $("ranking-sub").textContent = list.length > RANKING_LIMIT
    ? tx("Os {limite} primeiros de {n} jogadores do recorte, por nota média.", { limite: RANKING_LIMIT, n: fmt(list.length) })
    : tx("{n} jogadores do recorte, por nota média.", { n: fmt(list.length) });
  playerTable($("ranking-table"), list, RANKING_LIMIT);
}

on("index", () => { renderPlayerKpis(); renderPlayerFilters(); renderPlayers(); });
on("theme", () => { if (state.index) renderTopRated(qualified()); });
