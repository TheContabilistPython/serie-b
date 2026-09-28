// Estatísticas: the season's leaders in three sub-tabs, #/estatisticas/{times|jogadores|distancia}.
// Each block is a ranking: bars with the first ten and the whole list behind "Ver dados em tabela".
// Clicking a row opens the team or the player.
import { $, el, clear, fmt, counted } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView, syncTabs } from "../core/router.js";
import { tipLine } from "../core/tooltip.js";
import { barList, dotPlot } from "../core/charts.js";
import { cardBox, crest, face, teamName, tiles } from "../core/ui.js";
import { POS_CODE, POS_LABEL, POS_ONE, RANKING_LIMIT, playerById, playerCards, redsOf, teamCards } from "../core/players.js";
import { LANG, tx, txn } from "../core/i18n.js";

const STABS = ["times", "jogadores", "distancia"];
// Distância: position ("" = all), total or per 90, the intensity band ("km" = all of it) and which tables are open
const local = { tab: "times", distPos: "", distMeasure: "total", distBand: "km", distOpen: {} };
const STAT_TITLES = {
  J: "Jogos disputados", GP: "Gols marcados", GC: "Gols sofridos",
  "Por jogo": "Média por jogo disputado", xG: "Gols esperados a favor",
  xGC: "Gols esperados sofridos", CS: "Jogos sem sofrer gol",
  A: "Cartões amarelos, incluindo o primeiro de uma expulsão por dois amarelos",
  "2ºA": "Expulsões por segundo amarelo", V: "Vermelhos diretos",
  C: "Cartões sem jogador identificado: técnico ou comissão",
  Total: "Amarelos + segundos amarelos + vermelhos",
  Gols: "Gols marcados, sem contar gols contra",
  Pênaltis: "Gols de pênalti, já incluídos no total",
  "Sem pênalti": "Gols excluindo os de pênalti",
  Assistências: "Passes para gol registrados pelo SofaScore",
};

export function open(tab) {
  local.tab = STABS.includes(tab) ? tab : "times";
  setView("estatisticas");
  syncTabs($("stats-tabs"), "stab", local.tab);
  render();
}

function statsBlock(title, sub) {
  const chart = el("div", {}), table = el("table", {});
  const card = cardBox(title, sub, chart,
    el("details", {}, el("summary", { text: "Ver dados em tabela" }),
      el("div", { class: "scroll" }, table)));
  return { card, chart, table };
}

// `titles` explains each header on hover; a row whose href is null is not a link.
function statsTable(node, rows, columns, open, titles = STAT_TITLES) {
  const table = clear(node);
  table.appendChild(el("thead", {}, el("tr", {},
    el("th", { class: "left", text: "#" }),
    // `say`: the head a letter stands for where the letter means something else in another language (A: amarelos)
    columns.map((c) => el("th", { class: c.left ? "left" : "", text: LANG !== "pt" && c.say ? tx(c.say) : c.head, title: titles[c.head] || "" })))));
  table.appendChild(el("tbody", {}, rows.map((r, i) => {
    const href = open.href(r);
    return el("tr", href ? { class: "row-link", title: open.title, onclick: () => go(href) } : {},
      el("td", { class: "left pos", text: String(i + 1) }),
      columns.map((c) => el("td", { class: (c.left ? "left" : "") + (c.strong ? " strong" : "") }, c.cell(r))));
  })));
}

function teamStats() {
  const rows = state.index.table;
  const open = { title: "abrir o time", href: (r) => "#/time/" + r.team.id };
  const byName = (a, b) => (a.team.name || "").localeCompare(b.team.name || "");
  const name = (r) => r.team.short || r.team.name || "";
  const per = (v, j) => fmt(j ? v / j : 0, 2);
  const colTeam = { head: "Time", left: true, cell: (r) => [crest(r.team), el("span", { text: r.team.name || "" })] };
  const colJ = { head: "J", cell: (r) => fmt(r.j) };
  const cards = [];
  const add = (title, sub, list, chart, columns) => {
    const block = statsBlock(title, sub);
    barList(block.chart, list.slice(0, 10), Object.assign({ name, note: (r) => tx("{n}j", { n: r.j }), open: open.href,
                                                                logo: (r) => r.team.logo }, chart));
    statsTable(block.table, list, columns, open);
    cards.push(block.card);
  };

  const attack = [...rows].sort((a, b) => b.gp - a.gp || b.gp / b.j - a.gp / a.j || byName(a, b));
  add("Melhor ataque", "Gols marcados na temporada. Times com jogo adiado têm menos partidas, "
    + "então a coluna por jogo compara em base igual.", attack, {
    label: "Gols marcados por time", value: (r) => r.gp, text: (r) => fmt(r.gp),
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine("gols marcados", fmt(r.gp), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{media} por jogo em {n} partidas", { media: per(r.gp, r.j), n: r.j }) }),
                 el("div", { class: "l", text: tx("xG a favor: {v}", { v: fmt(r.xg, 1) }) })],
  }, [colTeam, colJ, { head: "GP", strong: true, cell: (r) => fmt(r.gp) },
      { head: "Por jogo", cell: (r) => per(r.gp, r.j) }, { head: "xG", cell: (r) => fmt(r.xg, 1) }]);

  const defense = [...rows].sort((a, b) => a.gc - b.gc || a.gc / a.j - b.gc / b.j || byName(a, b));
  add("Melhor defesa", "Gols sofridos na temporada, do menos vazado ao mais vazado. "
    + "A barra é o total sofrido, então aqui a barra curta é a boa.", defense, {
    label: "Gols sofridos por time", value: (r) => r.gc, text: (r) => fmt(r.gc),
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine("gols sofridos", fmt(r.gc), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{media} por jogo em {n} partidas", { media: per(r.gc, r.j), n: r.j }) }),
                 el("div", { class: "l", text: tx("xG sofrido: {v}", { v: fmt(r.xga, 1) }) })],
  }, [colTeam, colJ, { head: "GC", strong: true, cell: (r) => fmt(r.gc) },
      { head: "Por jogo", cell: (r) => per(r.gc, r.j) }, { head: "xGC", cell: (r) => fmt(r.xga, 1) }]);

  const sheets = [...rows].sort((a, b) => b.cs - a.cs || a.gc - b.gc || byName(a, b));
  add("Clean sheets", "Partidas em que o time não sofreu nenhum gol, contadas sobre os jogos coletados.", sheets, {
    label: "Jogos sem sofrer gol", value: (r) => r.cs, text: (r) => fmt(r.cs),
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine("clean sheets", fmt(r.cs), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{pct}% dos {n} jogos", { pct: fmt(r.j ? (100 * r.cs) / r.j : 0, 0), n: r.j }) }),
                 el("div", { class: "l", text: tx("{n} gols sofridos no total", { n: fmt(r.gc) }) })],
  }, [colTeam, colJ, { head: "CS", strong: true, cell: (r) => fmt(r.cs) },
      { head: "% dos jogos", cell: (r) => fmt(r.j ? (100 * r.cs) / r.j : 0, 0) + "%" },
      { head: "GC", cell: (r) => fmt(r.gc) }]);

  const booked = [...rows].sort((a, b) => teamCards(b) - teamCards(a) || redsOf(b) - redsOf(a) || byName(a, b));
  add("Mais cartões: times", "Total de cartões recebidos. O segundo amarelo entra à parte, e o primeiro "
    + "amarelo dessa expulsão continua contado em A. Comissão são cartões sem jogador identificado.", booked, {
    label: "Cartões por time", value: teamCards, text: (r) => fmt(teamCards(r)),
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine("cartões", fmt(teamCards(r)), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{amarelos} amarelos, {expulsoes} expulsões", { amarelos: fmt(r.yellow), expulsoes: fmt(redsOf(r)) }) }),
                 el("div", { class: "l", text: tx("{n} por jogo", { n: per(teamCards(r), r.j) }) })],
  }, [colTeam, colJ, { head: "A", say: "A (amarelos)", cell: (r) => fmt(r.yellow) }, { head: "2ºA", cell: (r) => fmt(r.yellow2) },
      { head: "V", say: "V (vermelhos)", cell: (r) => fmt(r.red) }, { head: "C", say: "C (comissão)", cell: (r) => fmt(r.staff) },
      { head: "Total", strong: true, cell: (r) => fmt(teamCards(r)) },
      { head: "Por jogo", cell: (r) => per(teamCards(r), r.j) }]);

  const changes = state.index.changes || { formations: [], managers: [], managersKnown: 0 };
  add("Mais trocas de formação", "Quantas vezes o time entrou em campo com uma formação diferente da partida anterior, "
    + "pela escalação inicial do SofaScore. Distintas é o repertório da temporada.", changes.formations, {
    label: "Trocas de formação", value: (r) => r.switches, text: (r) => fmt(r.switches),
    note: (r) => tx("{n} distintas", { n: r.distinct }),
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine("trocas", fmt(r.switches), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{n} formações distintas; mais usada {formacao} ({vezes}x)",
                   { n: r.distinct, formacao: r.mostUsed || "-", vezes: fmt(r.mostUsedCount) }) })],
  }, [colTeam, colJ, { head: "Trocas", strong: true, cell: (r) => fmt(r.switches) },
      { head: "Distintas", cell: (r) => fmt(r.distinct) },
      { head: "Mais usada", left: true, cell: (r) => (r.mostUsed || "-") + " (" + fmt(r.mostUsedCount) + ")" }]);
  add("Trocas de técnico", changes.managersKnown
    ? "Técnicos distintos que comandaram o time, pelo registro de quem esteve no banco em cada partida "
      + "(endpoint de técnicos do SofaScore). Auxiliares que cobrem suspensão do treinador contam como técnico "
      + "diferente; Trocas conta as mudanças de uma partida para a seguinte, ida e volta incluídas."
    : "Ainda sem dados de técnico: rode python coletar.py partidas para baixar managers.json de cada partida.",
    changes.managers, {
    label: "Técnicos distintos", value: (r) => r.distinct, text: (r) => fmt(r.distinct),
    note: (r) => tx(r.changes === 1 ? "{n} troca" : "{n} trocas", { n: fmt(r.changes) }),
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine("técnicos distintos", fmt(r.distinct), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{n} trocas entre partidas", { n: fmt(r.changes) }) }),
                 el("div", { class: "l", text: r.managers.length ? r.managers.join(" → ") : "sem dados" })],
  }, [colTeam, colJ, { head: "Distintos", strong: true, cell: (r) => fmt(r.distinct) },
      { head: "Trocas", cell: (r) => fmt(r.changes) },
      { head: "Sequência no banco", left: true, cell: (r) => r.managers.length ? r.managers.join(" → ") : "sem dados" },
      { head: "Atual", left: true, cell: (r) => r.current || "-" }]);

  const headline = rows.length ? [
    ["Melhor ataque", fmt(attack[0].gp), el("span", {}, txn("{time}, {n} por jogo", { time: teamName(attack[0].team), n: per(attack[0].gp, attack[0].j) }))],
    ["Melhor defesa", fmt(defense[0].gc), el("span", {}, txn("{time}, {n} por jogo", { time: teamName(defense[0].team), n: per(defense[0].gc, defense[0].j) }))],
    ["Mais clean sheets", fmt(sheets[0].cs), el("span", {}, txn("{time}, em {n} jogos", { time: teamName(sheets[0].team), n: sheets[0].j }))],
    ["Mais cartões", fmt(teamCards(booked[0])), el("span", {}, txn("{time}, {n} expulsões", { time: teamName(booked[0].team), n: fmt(redsOf(booked[0])) }))],
    ...(changes.formations.length ? [["Mais trocas de formação", fmt(changes.formations[0].switches),
      el("span", {}, txn("{time}, {n} formações distintas", { time: teamName(changes.formations[0].team), n: changes.formations[0].distinct }))]] : []),
    ...(changes.managersKnown ? [["Mais técnicos distintos", fmt(changes.managers[0].distinct),
      el("span", {}, txn("{time}, {n} trocas entre partidas", { time: teamName(changes.managers[0].team), n: fmt(changes.managers[0].changes) }))]] : []),
  ] : [];
  return { tiles: headline, cards };
}

function playerStats() {
  const open = { title: "abrir a temporada do jogador", href: (p) => "#/jogador/" + p.id };
  const colPlayer = { head: "Jogador", left: true, cell: (p) => [face(p), el("span", { text: p.name || "" })] };
  const colTeam = { head: "Time", left: true, cell: (p) => [crest(p), el("span", { text: p.team || "" })] };
  const cards = [];
  const add = (title, sub, list, chart, columns) => {
    const block = statsBlock(title, sub);
    barList(block.chart, list.slice(0, 10), Object.assign({
      name: (p) => p.name || "", note: (p) => p.team || "", open: open.href,
      face: (p) => p.face, logo: (p) => p.logo }, chart));
    statsTable(block.table, list, columns, open);
    cards.push(block.card);
  };

  const scorers = state.index.scorers, assists = state.index.assists, booked = state.index.cards;
  add("Artilheiros", "Gols marcados na temporada. Gol contra não é creditado ao autor e "
    + "os pênaltis aparecem à parte, já somados no total.", scorers, {
    label: "Artilheiros", value: (p) => p.goals, text: (p) => fmt(p.goals),
    tip: (p) => [el("div", { class: "l" }, p.name + " - ", teamName(p.team)), tipLine("gols", fmt(p.goals), "var(--data-dot)"),
                 el("div", { class: "l", text: p.penalties ? tx("{n} de pênalti", { n: p.penalties }) : "nenhum de pênalti" })],
  }, [colPlayer, colTeam, { head: "Gols", strong: true, cell: (p) => fmt(p.goals) },
      { head: "Pênaltis", cell: (p) => fmt(p.penalties) },
      { head: "Sem pênalti", cell: (p) => fmt(p.goals - p.penalties) }]);

  add("Líderes de assistências", "Passe para o gol conforme o SofaScore: no máximo um por gol, "
    + "e só quando a jogada teve assistência.", assists, {
    label: "Líderes de assistências", value: (p) => p.assists, text: (p) => fmt(p.assists),
    tip: (p) => [el("div", { class: "l" }, p.name + " - ", teamName(p.team)),
                 tipLine("assistências", fmt(p.assists), "var(--data-dot)")],
  }, [colPlayer, colTeam, { head: "Assistências", strong: true, cell: (p) => fmt(p.assists) }]);

  add("Mais cartões: jogadores", "Cartões recebidos na temporada. O segundo amarelo entra à parte, "
    + "e o primeiro amarelo dessa expulsão continua contado em A.", booked, {
    label: "Cartões por jogador", value: playerCards, text: (p) => fmt(playerCards(p)),
    tip: (p) => [el("div", { class: "l" }, p.name + " - ", teamName(p.team)),
                 tipLine("cartões", fmt(playerCards(p)), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{amarelos} amarelos, {expulsoes} expulsões", { amarelos: fmt(p.yellow), expulsoes: fmt(redsOf(p)) }) })],
  }, [colPlayer, colTeam, { head: "A", say: "A (amarelos)", cell: (p) => fmt(p.yellow) }, { head: "2ºA", cell: (p) => fmt(p.yellow2) },
      { head: "V", say: "V (vermelhos)", cell: (p) => fmt(p.red) },
      { head: "Total", strong: true, cell: (p) => fmt(playerCards(p)) }]);

  const headline = [];
  const who = (p) => el("span", {}, p.name + " · ", teamName(p.team));
  if (scorers.length) headline.push(["Artilheiro", fmt(scorers[0].goals), who(scorers[0])]);
  if (assists.length) headline.push(["Líder de assistências", fmt(assists[0].assists), who(assists[0])]);
  if (booked.length) headline.push(["Mais cartões", fmt(playerCards(booked[0])), who(booked[0])]);
  return { tiles: headline, cards };
}

// ---- distância percorrida ------------------------------------------------------------
// Times pela média por jogo do "Distance covered" das estatísticas de cada partida; jogadores pela
// soma do kilometersCovered das escalações, no total ou a cada 90 minutos, com filtro de posição.
// O divisor de intensidade troca a distância inteira por uma das três faixas do SofaScore (corrida,
// alta velocidade e sprint), que só existem por jogador: a de um time é a soma dos jogadores dele.
// Tudo vem de index.distance (analysis/teams.league_distance). O servidor manda só os jogadores que
// algum recorte mostra (os 50 primeiros de cada), em ordem de distância total: os outros rankings são
// ordenações estáveis por cima dessa ordem, as mesmas que o servidor fez para escolher quem entra.
const DIST_MEASURES = [
  { key: "total", label: "Total na temporada", hint: "Quilômetros somados em todas as partidas com a medição" },
  { key: "p90", label: "Por 90 minutos", hint: "Quilômetros a cada 90 minutos em campo, de quem tem o mínimo de minutos" },
];
// "km" is the whole distance; the three bands don't overlap (teams.BANDS). `digits`: a team's km per game.
const DIST_BANDS = [
  { key: "km", label: "Todas", phrase: "", digits: 1, hint: "Toda a distância percorrida, da caminhada ao sprint" },
  { key: "running", label: "Corrida", phrase: "em corrida", digits: 1,
    hint: "Distância em corrida, a mais lenta das três faixas de intensidade do SofaScore" },
  { key: "highSpeed", label: "Alta velocidade", phrase: "em alta velocidade", digits: 2,
    hint: "Distância em alta velocidade, entre a corrida e o sprint" },
  { key: "sprinting", label: "Sprint", phrase: "em sprint", digits: 2, hint: "Distância em sprint, a mais rápida das três faixas" },
];
// Header hints, with the band's words where the number is the band's.
const distTitles = (band) => {
  const faixa = band.phrase ? " " + tx(band.phrase) : "";
  return {
    J: "Partidas com a distância medida", Km: tx("Quilômetros{faixa} somados nessas partidas", { faixa }),
    "Km/jogo": tx("Média de quilômetros{faixa} por jogo, somando os jogadores do time", { faixa }),
    "Adv./jogo": tx("Média de quilômetros{faixa} dos adversários nos mesmos jogos", { faixa }),
    "Dif.": "Km por jogo do time menos o dos adversários", "% do total": tx("Parte da distância percorrida{faixa}", { faixa }),
    "Sprints/jogo": "Média de sprints do time por jogo", Pos: "Posição mais frequente na escalação",
    Min: "Minutos nas partidas com a distância medida", "Km/90": tx("Quilômetros{faixa} a cada 90 minutos em campo", { faixa }),
    Sprints: "Sprints somados nessas partidas", "Vel. máx.": "Maior velocidade registrada numa partida, em km/h",
  };
};
const distStrip = (label, options, current, pick) => el("div", {
  class: "ooyl-tabs ooyl-tabs--segmented dist-filter", role: "tablist", "aria-label": label },
  options.map((o) => el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(o.key === current),
    title: o.hint || null, onclick: () => pick(o.key) }, o.label, o.n == null ? null : el("span", { class: "n", text: fmt(o.n) }))));
// A band switch redraws the whole board: each table comes back as open as it was.
function keepOpen(details, key) {
  details.open = !!local.distOpen[key];
  details.addEventListener("toggle", () => { local.distOpen[key] = details.open; });
}

function distanceStats() {
  const d = state.index.distance;
  if (!d || !d.players || !d.teams.every((r) => r.bands)) {
    return { tiles: [], cards: [], empty: "As estatísticas das partidas coletadas não trazem a distância percorrida." };
  }
  const sum = (f) => d.teams.reduce((a, r) => a + f(r), 0);
  const hasBands = sum((r) => r.bandGames) > 0;
  const band = (hasBands && DIST_BANDS.find((b) => b.key === local.distBand)) || DIST_BANDS[0];
  const key = band.key, whole = key === "km", words = band.phrase ? " " + tx(band.phrase) : "";
  // A team in the band: the whole distance is the team statistic, a band the sum of its players.
  const games = (r) => whole ? r.games : r.bandGames;
  const total = (r) => whole ? r.km : r.bands[key];
  const per = (r) => whole ? r.perGame : r.bandGames ? r.bands[key] / r.bandGames : null;
  // The opponents only where they were measured too: one sent as 0,0 km (teams.team_distance) is left out.
  const faced = (r) => whole ? r.againstGames : r.bandGames;
  const against = (r) => faced(r) ? (whole ? r.kmAgainst : r.bandsAgainst[key]) / faced(r) : null;
  const share = (r) => r.bands.km ? r.bands[key] / r.bands.km : null;  // of the players' own total, same matches
  const shareOf = (k) => sum((r) => r.bands[k]) / sum((r) => r.bands.km);
  // A player: the numbers the server ranked, in its order of operations, so the order comes out the same.
  const value = (p) => p[key];
  const rate90 = (p) => p[key] * 90 / p.minutes;
  const club = (p) => ({ name: p.team, logo: p.logo });
  const ranked = d.teams.filter((r) => per(r) != null);
  if (!whole) ranked.sort((a, b) => per(b) - per(a));  // stable: ties keep the order by the whole distance
  if (!ranked.length) return { tiles: [], cards: [], empty: "As estatísticas das partidas coletadas não trazem a distância percorrida." };
  const league = whole ? d.avg : sum((r) => r.bands[key]) / sum((r) => r.bandGames);
  const filters = hasBands ? el("div", { class: "filter-row" }, el("span", { class: "label-caps", text: "Intensidade" }),
    distStrip("Intensidade", DIST_BANDS, key, (k) => { local.distBand = k; render(); })) : null;
  const cards = [];

  const teamOpen = { title: "abrir a distância do time", href: (r) => `#/time/${r.team.id}/distancia` };
  const block = statsBlock("Times que mais correm", whole
    ? tx("Quilômetros por jogo, somando todos os jogadores do time, nos {medidos} dos {jogos} jogos em que o SofaScore mediu a distância. A linha tracejada é a média da liga; clique num time para ver a distância dele jogo a jogo.",
      { medidos: fmt(d.measured), jogos: fmt(d.matches) })
    : tx("Quilômetros {faixa} por jogo, somando os jogadores do time. O SofaScore separa três faixas de intensidade que não se sobrepõem, corrida, alta velocidade e sprint, e juntas elas são {pct}% da distância; o resto é caminhada e trote. A linha tracejada é a média da liga.",
      { faixa: tx(band.phrase), pct: fmt(100 * (shareOf("running") + shareOf("highSpeed") + shareOf("sprinting")), 0) }));
  keepOpen(block.card.querySelector("details"), "teams");
  dotPlot(block.chart, ranked, {
    label: tx("Quilômetros{faixa} por jogo, por time", { faixa: words }), value: per, digits: band.digits,
    reference: league != null ? { value: league, label: tx("liga {v}", { v: fmt(league, band.digits) }) } : null,  // short: phones have little room
    name: (r) => r.team.short || r.team.name || "", note: (r) => tx("{n}j", { n: games(r) }), logo: (r) => r.team.logo, open: teamOpen.href,
    tip: (r) => [el("div", { class: "l" }, teamName(r.team)), tipLine(tx("km{faixa} por jogo", { faixa: words }), fmt(per(r), band.digits), "var(--data-dot)"),
      el("div", { class: "l", text: tx("{km} km{faixa} em {jogos}", { km: fmt(total(r), whole ? 0 : 1), faixa: words, jogos: counted(games(r), "jogo", "jogos") }) }),
      el("div", { class: "l", text: tx("adversários: {km} km por jogo", { km: fmt(against(r), band.digits) }) }),
      whole ? (r.sprintGames ? el("div", { class: "l", text: tx("{n} sprints por jogo", { n: fmt(r.sprints / r.sprintGames, 0) }) }) : null)
        : el("div", { class: "l", text: tx("{pct}% da distância do time", { pct: fmt(100 * share(r), 1) }) })].filter(Boolean),
  });
  statsTable(block.table, ranked, [
    { head: "Time", left: true, cell: (r) => [crest(r.team), el("span", { text: r.team.name || "" })] },
    { head: "J", cell: (r) => fmt(games(r)) }, { head: "Km", cell: (r) => fmt(total(r), whole ? 0 : 1) },
    { head: "Km/jogo", strong: true, cell: (r) => fmt(per(r), band.digits) },
    { head: "Adv./jogo", cell: (r) => fmt(against(r), band.digits) },
    { head: "Dif.", cell: (r) => {
      if (against(r) == null) return "-";
      const gap = per(r) - against(r);
      return (gap >= 0 ? "+" : "−") + fmt(Math.abs(gap), band.digits);
    } },
    ...(whole ? [] : [{ head: "% do total", cell: (r) => fmt(100 * share(r), 1) + "%" }]),
    { head: "Sprints/jogo", cell: (r) => r.sprintGames ? fmt(r.sprints / r.sprintGames, 0) : "-" },
  ], teamOpen, distTitles(band));
  cards.push(block.card);

  // Players: a position strip and a measure strip redraw only this card, so an open table stays open.
  // Goalkeepers get a segment only when most of their appearances carry the distance.
  const keepers = d.positions.G || { played: 0, measured: 0 };
  const withKeepers = keepers.played > 0 && keepers.measured >= keepers.played / 2;
  const groups = ["", ...(withKeepers ? ["G"] : []), "D", "M", "F"];
  if (!groups.includes(local.distPos)) local.distPos = "";
  const open = (p) => playerById(p.id) ? "#/jogador/" + p.id : null;  // only rated players have a season page
  const sub = el("p", { class: "ooyl-sub" }), controls = el("div", { class: "filter-row dist-controls" });
  const chart = el("div"), table = el("table");
  const details = el("details", {}, el("summary", { text: "Ver dados em tabela" }), el("div", { class: "scroll" }, table));
  keepOpen(details, "players");
  cards.push(el("section", { class: "ooyl-card" },
    el("header", { class: "ooyl-card__head" }, el("div", { class: "ooyl-card__titles" },
      el("h2", { class: "ooyl-headline", text: "Jogadores que mais correm" }), sub)),
    controls, chart, details));

  const draw = () => {
    const pos = local.distPos, rate = local.distMeasure === "p90", group = d.positions[pos || "all"];
    const pool = d.players.filter((p) => !pos || p.position === pos);
    const list = (rate ? pool.filter((p) => p.minutes >= d.minMinutes).sort((a, b) => rate90(b) - rate90(a))
      : whole ? pool : pool.sort((a, b) => value(b) - value(a))).slice(0, RANKING_LIMIT);
    clear(controls).append(
      distStrip("Posição", groups.map((g) => ({ key: g, label: g ? POS_LABEL[g] : "Todas as posições",
        n: (d.positions[g || "all"] || {})[rate ? "qualified" : "players"] })), pos, (k) => { local.distPos = k; draw(); }),
      distStrip("Medida", DIST_MEASURES, local.distMeasure, (k) => { local.distMeasure = k; draw(); }));

    const parts = ["D", "M", "F"].filter((g) => d.positions[g] && d.positions[g].per90[key] != null)
      .map((g) => `${tx(POS_LABEL[g]).toLowerCase()} ${fmt(d.positions[g].per90[key], 2)}`);
    const averages = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${tx("e")} ${parts[parts.length - 1]}` : parts.join("");
    sub.textContent = (rate
      ? tx("Quilômetros{faixa} a cada 90 minutos em campo, só de quem tem ao menos {min} minutos medidos (um terço das rodadas em jogos completos), porque quem entra no fim do jogo corre descansado. A linha tracejada é a média {grupo}",
        { faixa: words, min: fmt(d.minMinutes), grupo: pos ? tx("dos {posicao}", { posicao: tx(POS_LABEL[pos]).toLowerCase() }) : tx("de todos eles") })
        + (averages ? tx("; por posição: {medias}.", { medias: averages }) : ".")
      : tx("Distância{faixa} somada de cada jogador na temporada, nas partidas em que o SofaScore mediu. Quem trocou de clube soma os dois, com o escudo do atual. Por 90 minutos compara em base igual quem jogou menos.", { faixa: words }))
      + (withKeepers || !keepers.played ? "" : tx(" Goleiros ficam fora do filtro: nos jogos com medição, só {medidas} das {total} atuações de goleiro trazem a distância.",
        { medidas: fmt(keepers.measured), total: fmt(keepers.played) }));

    const tip = (p) => [el("div", { class: "l" }, p.name + " - ", teamName(club(p))),
      rate ? tipLine(tx("km{faixa} por 90 min", { faixa: words }), fmt(rate90(p), 2), "var(--data-dot)") : tipLine(tx("km{faixa}", { faixa: words }), fmt(value(p), 1), "var(--data-dot)"),
      el("div", { class: "l", text: [tx(POS_ONE[p.position]), tx("{jogos}, {minutos} minutos", { jogos: counted(p.games, "jogo", "jogos"), minutos: fmt(p.minutes) })].filter(Boolean).join(" · ") }),
      el("div", { class: "l", text: rate ? tx("{km} km{faixa} no total", { km: fmt(value(p), 1), faixa: words })
        : p.minutes >= 90 ? tx("{km} km{faixa} por 90 minutos", { km: fmt(rate90(p), 2), faixa: words }) : "menos de 90 minutos em campo" }),
      whole || !p.km ? null : el("div", { class: "l", text: tx("{pct}% dos {km} km percorridos", { pct: fmt(100 * p[key] / p.km, 1), km: fmt(p.km, 1) }) }),
      el("div", { class: "l", text: tx("{n} sprints · máxima de {v} km/h", { n: fmt(p.sprints), v: fmt(p.topSpeed, 1) }) })].filter(Boolean);
    const shared = { name: (p) => p.name || "", note: (p) => p.team || "", face: (p) => p.face, logo: (p) => p.logo, open, tip };
    if (!list.length) {
      clear(chart).appendChild(el("div", { class: "empty", text: rate
        ? tx(pos ? "Ninguém nesta posição tem {min} minutos com a distância medida." : "Ninguém tem {min} minutos com a distância medida.", { min: fmt(d.minMinutes) })
        : "Nenhum jogador com a distância medida." }));
    } else if (rate) {  // dots for a rate, as everywhere on the page: the axis need not start at zero
      const mean = group.per90[key];
      dotPlot(chart, list.slice(0, 10), Object.assign({
        label: tx("Quilômetros{faixa} por 90 minutos, por jogador", { faixa: words }), value: rate90, digits: 2,
        reference: mean != null ? { value: mean, label: tx("média {v}", { v: fmt(mean, 2) }) } : null }, shared));
    } else {
      barList(chart, list.slice(0, 10), Object.assign({
        label: tx("Distância{faixa} na temporada, por jogador", { faixa: words }), value, text: (p) => fmt(value(p), 1) + " km" }, shared));
    }
    statsTable(table, list, [
      { head: "Jogador", left: true, cell: (p) => [face(p), el("span", { text: p.name || "" })] },
      { head: "Time", left: true, cell: (p) => [crest(p), el("span", { text: p.team || "" })] },
      { head: "Pos", left: true, cell: (p) => POS_CODE[p.position] || "-" },
      { head: "J", cell: (p) => fmt(p.games) }, { head: "Min", cell: (p) => fmt(p.minutes) },
      { head: "Km", strong: !rate, cell: (p) => fmt(value(p), 1) },
      { head: "Km/90", strong: rate, cell: (p) => p.minutes >= 90 ? fmt(rate90(p), 2) : "-" },
      ...(whole ? [] : [{ head: "% do total", cell: (p) => p.km ? fmt(100 * p[key] / p.km, 1) + "%" : "-" }]),
      { head: "Sprints", cell: (p) => fmt(p.sprints) }, { head: "Vel. máx.", cell: (p) => fmt(p.topSpeed, 1) },
    ], { title: "abrir a temporada do jogador", href: open }, distTitles(band));
  };
  draw();

  const byTotal = whole ? d.players : [...d.players].sort((a, b) => value(b) - value(a));
  const qualified = d.players.filter((p) => p.minutes >= d.minMinutes).sort((a, b) => rate90(b) - rate90(a));
  const headline = [
    ["Time que mais corre", fmt(per(ranked[0]), band.digits), el("span", {}, txn("km{faixa} por jogo, {time}", { faixa: words, time: teamName(ranked[0].team) }))],
    ["Média da liga", fmt(league, band.digits), whole
      ? tx("km por time e por jogo, em {medidos} das {total} partidas", { medidos: fmt(d.measured), total: fmt(d.matches) })
      : tx("km{faixa} por time e por jogo, {pct}% da distância", { faixa: words, pct: fmt(100 * shareOf(key), 1) })],
    ...(byTotal.length ? [["Quem mais correu", fmt(value(byTotal[0]), 1),
      el("span", {}, txn("km{faixa}, {nome} · {time}", { faixa: words, nome: byTotal[0].name, time: teamName(club(byTotal[0])) }))]] : []),
    ...(qualified.length ? [["Mais km por 90 min", fmt(rate90(qualified[0]), 2),
      el("span", {}, txn(whole ? "{nome} · {time}, em {min} min" : "km{faixa}, {nome} · {time}, em {min} min",
        { faixa: words, nome: qualified[0].name, time: teamName(club(qualified[0])), min: fmt(qualified[0].minutes) }))]] : []),
  ];
  return { tiles: headline, cards, filters };
}

function render() {
  if (!state.index) return;
  const host = clear($("stats-body"));
  const built = { times: teamStats, jogadores: playerStats, distancia: distanceStats }[local.tab]();
  const filters = clear($("stats-filters"));  // a sub-tab's own switch, above its tiles (Distância: intensity)
  if (built.filters) filters.appendChild(built.filters);
  filters.hidden = !built.filters;
  tiles($("stats-kpis"), built.tiles);
  $("stats-kpis").hidden = !built.tiles.length;
  if (!built.tiles.length) {
    host.appendChild(el("div", { class: "ooyl-card" }, el("div", { class: "empty", text: built.empty || "Sem partidas coletadas nesta temporada." })));
    return;
  }
  built.cards.forEach((card) => host.appendChild(card));
}

$("stats-tabs").addEventListener("click", (ev) => {
  const btn = ev.target.closest('[role="tab"]');
  if (btn) go("#/estatisticas/" + btn.dataset.stab);
});

on("index", () => { if (state.view === "estatisticas") render(); });
on("theme", () => { if (state.view === "estatisticas") render(); });
