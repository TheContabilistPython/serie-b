// Arbitragem: the season's referees and each referee's profile (#/arbitragem, #/arbitro/{id}), plus
// the cards forecast sub-tab (#/arbitragem/cartoes, views/cartoes.js).
//
// Tudo vem de /api/referees (analysis/referees.py): por árbitro, a média por jogo de cada número, a
// mesma média na liga e o quanto ela se afasta do resto da liga em erros-padrão. Quem decide um
// traço é o servidor (mínimo de jogos e diferença além do acaso); a página só dá o nome.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView, syncTabs } from "../core/router.js";
import { showTip, hideTip, tipLine } from "../core/tooltip.js";
import { barList, dotPlot } from "../core/charts.js";
import { CARD_REASONS, cardBox, crest, teamName, tiles } from "../core/ui.js";
import { teamCards } from "../core/players.js";
import { dateOf, pctText } from "../core/format.js";
import { getJSON } from "../core/api.js";
import * as cartoes from "./cartoes.js";
import { LANG, tx } from "../core/i18n.js";

// The order of the keys is the order of the profile's rows.
const REF_METRICS = {
  cards: { name: "Cartões por jogo", phrase: "cartões por jogo", digits: 1, up: "Muitos cartões", down: "Poucos cartões" },
  reds: { name: "Expulsões por jogo", phrase: "expulsões por jogo", digits: 2, up: "Expulsa com frequência", down: "Raramente expulsa" },
  fouls: { name: "Faltas por jogo", phrase: "faltas marcadas por jogo", digits: 1, up: "Apita muito", down: "Deixa o jogo correr" },
  cardsPerFoul: { name: "Cartões a cada 10 faltas", phrase: "cartões a cada 10 faltas", digits: 1, up: "Cartão fácil", down: "Segura o cartão" },
  argument: { name: "Reclamação: cartões por jogo", phrase: "cartões por reclamação por jogo", digits: 2, up: "Não tolera reclamação", down: "Tolera reclamação" },
  penalties: { name: "Pênaltis por jogo", phrase: "pênaltis por jogo", digits: 2, up: "Marca muitos pênaltis", down: "Marca poucos pênaltis" },
  var: { name: "Decisões do VAR por jogo", phrase: "decisões do VAR por jogo", digits: 2, up: "VAR muito acionado", down: "VAR pouco acionado" },
  added1: { name: "Acréscimo no 1º tempo", phrase: "min de acréscimo no 1º tempo", digits: 1, unit: " min", up: "Acréscimo longo no 1º tempo", down: "Acréscimo curto no 1º tempo" },
  added2: { name: "Acréscimo no 2º tempo", phrase: "min de acréscimo no 2º tempo", digits: 1, unit: " min", up: "Acréscimo longo no 2º tempo", down: "Acréscimo curto no 2º tempo" },
  firstCard: { name: "Minuto do 1º cartão", phrase: "min até o primeiro cartão, em média", digits: 0, unit: "'", up: "Demora a dar cartão", down: "Cartão cedo" },
  awayGap: { name: "Cartões: visitante − mandante", digits: 1, signed: true, up: "Mais cartões ao visitante", down: "Mais cartões ao mandante" },
};
const REF_TITLES = {
  J: "Partidas apitadas nesta temporada", "Cart./J": "Cartões por jogo, os da comissão técnica incluídos",
  A: "Amarelos", "Exp.": "Expulsões: segundo amarelo e vermelho direto", "Faltas/J": "Faltas marcadas por jogo",
  "Pên.": "Pênaltis marcados", VAR: "Decisões do VAR registradas pelo SofaScore",
  "Acrésc.": "Acréscimo médio anunciado no 2º tempo, em minutos",
  Perfil: "Onde o árbitro se afasta do resto da liga mais do que o acaso explicaria",
  Cartões: "Cartões recebidos pelo time nos jogos deste árbitro, os da comissão técnica incluídos",
  "Por jogo": "Cartões recebidos por jogo com este árbitro", Temporada: "Cartões recebidos por jogo em toda a temporada",
  "Pên. a favor": "Pênaltis marcados a favor do time", Faltas: "Faltas marcadas na partida, somando os dois times",
};
const RTABS = ["arbitros", "var", "cartoes"];
const local = { refs: null, byId: null, referee: null, metric: "cards", tab: "arbitros" };

const pairSum = (p) => p[0] + p[1];
const varTotal = (r) => Object.values(r.var).reduce((a, b) => a + b, 0);
const qualifiedRefs = () => local.refs.referees.filter((r) => r.j >= local.refs.minGames);
const metricText = (key, v) => {
  const spec = REF_METRICS[key];
  return v === null || v === undefined ? "-" : (spec.signed && v > 0 ? "+" : "") + fmt(v, spec.digits) + (spec.unit || "");
};
const traitName = (t) => REF_METRICS[t.metric][t.dir > 0 ? "up" : "down"];
// The trait as a sentence with its numbers: "6,7 cartões por jogo; na liga, 5,1".
function traitSentence(t, r) {
  const spec = REF_METRICS[t.metric], v = r.metrics[t.metric], league = local.refs.league.metrics[t.metric];
  if (t.metric === "awayGap") {
    const side = (x) => tx(x >= 0 ? "o visitante" : "o mandante");
    return tx("{n} cartão a mais por jogo para {lado}; na liga, {m} a mais para {ladoLiga}",
      { n: fmt(Math.abs(v), 1), lado: side(v), m: fmt(Math.abs(league), 1), ladoLiga: side(league) });
  }
  return tx("{v} {frase}; na liga, {liga}", { v: fmt(v, spec.digits), frase: tx(spec.phrase), liga: fmt(league, spec.digits) });
}
// Initials for the hero, since there is no photo: first and last names, particles skipped.
const initials = (name) => {
  const words = (name || "").split(/\s+/).filter((w) => w && !/^(de|da|do|das|dos|e|filho|j[uú]nior|neto|sobrinho)$/i.test(w));
  return words.length ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() : "?";
};
const reasonName = (k) => {
  const text = tx(k === "none" ? "sem motivo registrado" : CARD_REASONS[k] || k);
  return text.charAt(0).toUpperCase() + text.slice(1);
};
// Minutes of each bucket, from the upper bounds the server sends: 1–15', ..., 31–45+', 76–90+'.
const bucketName = (b, i) => `${i ? b[i - 1] + 1 : 1}–${b[i]}${b[i] === 45 || b[i] === 90 ? "+" : ""}'`;

function refTags(r) {
  if (r.j < local.refs.minGames) return el("span", { class: "ref-muted", text: "amostra pequena" });
  if (!r.traits.length) return el("span", { class: "ref-muted", text: "no padrão da liga" });
  return el("span", { class: "ref-tags" }, r.traits.slice(0, 3).map((t) => el("span", { class: "ooyl-tag", text: traitName(t) })),
    r.traits.length > 3 ? el("span", { class: "ref-muted", text: "+" + (r.traits.length - 3) }) : null);
}

async function loadReferees() {
  if (local.refs) return;
  const payload = await getJSON("/api/referees");
  local.refs = payload;
  local.byId = new Map(payload.referees.map((r) => [r.id, r]));
}

export async function open(tab) {
  local.tab = RTABS.includes(tab) ? tab : "arbitros";
  setView("arbitragem");
  syncTabs($("ref-tabs"), "rtab", local.tab);
  $("refs-main").hidden = local.tab !== "arbitros";
  $("var-main").hidden = local.tab !== "var";
  $("cards-main").hidden = local.tab !== "cartoes";
  if (local.tab === "cartoes") { cartoes.open(); return; }
  if (!local.refs) {
    clear($("ref-kpis")); clear($("refs-table")); clear($("refs-chart"));
    $("refs-sub").textContent = tx("Carregando os árbitros...");
  }
  try {
    await loadReferees();
  } catch (err) {
    $("refs-sub").textContent = tx("Não foi possível ler a arbitragem: {erro}", { erro: err.message });
    return;
  }
  if (state.view === "arbitragem" && local.tab === "arbitros") renderReferees();
  if (state.view === "arbitragem" && local.tab === "var") renderVar();
}

// VAR: the reviews that changed a decision, for and against each team (the `var` of /api/referees).
const VAR_KINDS = { goalOn: "Gol validado", goalOff: "Gol anulado", penaltyOn: "Pênalti marcado", penaltyOff: "Pênalti cancelado",
  redOn: "Expulsão após revisão", redOff: "Expulsão retirada", kept: "Decisão de campo mantida" };
const VAR_EFFECT = { goalOn: 1, penaltyOn: 1, redOff: 1, goalOff: -1, penaltyOff: -1, redOn: -1, kept: 0 };
let varTeam = null;  // the team whose reviews the second card lists
function renderVar() {
  const d = local.refs.var, signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  const table = clear($("var-table")), list = clear($("var-list")), pick = clear($("var-team"));
  if (!d || !d.total) {
    clear($("var-kpis"));
    table.appendChild(el("tbody", {}, el("tr", {}, el("td", { class: "left", text: "Nenhuma revisão do VAR nas partidas coletadas." }))));
    return;
  }
  const best = d.table[0], worst = d.table[d.table.length - 1];
  tiles($("var-kpis"), [
    ["Revisões do VAR", fmt(d.total), tx("em {n} dos {total} jogos", { n: fmt(d.reviewed), total: fmt(d.matches) })],
    ["Decisões mudadas", fmt(d.changed), tx("{pct} das revisões", { pct: pctText(d.changed / d.total) })],
    ["Mais favorecido", signed(best.net), teamName(best.team)],
    ["Mais prejudicado", signed(worst.net), teamName(worst.team)],
  ]);
  const head = [["#", ""], ["Time", ""], ["Revisões", "Revisões do VAR nos jogos do time"], ["A favor", "Decisões mudadas a favor do time"],
    ["Contra", "Decisões mudadas contra o time"], ["Saldo", "A favor menos contra"], ["Gols", "Saldo das revisões de gol"],
    ["Pênaltis", "Saldo das revisões de pênalti"], ["Expulsões", "Saldo das revisões de expulsão"]];
  table.appendChild(el("thead", {}, el("tr", {}, head.map(([h, title], i) => el("th", { class: i <= 1 ? "left" : "", text: h, title })))));
  table.appendChild(el("tbody", {}, d.table.map((r, i) => el("tr", {
    class: "row-link", title: "ver as revisões do time", onclick: () => { varTeam = r.team.id; renderVar(); },
  },
    el("td", { class: "left pos", text: String(i + 1) }),
    el("td", { class: "left" }, crest(r.team), el("span", { text: r.team.name })),
    el("td", { text: fmt(r.reviews) }), el("td", { text: fmt(r.for) }), el("td", { text: fmt(r.against) }),
    el("td", { class: "strong", text: signed(r.net) }),
    el("td", { text: signed(r.goals) }), el("td", { text: signed(r.penalties) }), el("td", { text: signed(r.reds) })))));

  const teams = d.table.map((r) => r.team).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (!teams.some((t) => t.id === varTeam)) varTeam = best.team.id;
  teams.forEach((t) => pick.appendChild(el("option", { value: String(t.id), text: t.name })));
  pick.value = String(varTeam);
  pick.onchange = () => { varTeam = Number(pick.value); renderVar(); };
  const mine = d.reviews.filter((v) => v.team === varTeam || v.rival === varTeam);
  list.appendChild(el("thead", {}, el("tr", {}, ["Rod.", "Jogo", "Min.", "Decisão", "Lance de", "Jogador", "Para o time"].map((h, i) =>
    el("th", { class: i === 0 || i === 2 ? "" : "left", text: h })))));
  list.appendChild(el("tbody", {}, mine.length ? mine.map((v) => {
    const effect = VAR_EFFECT[v.kind] * (v.team === varTeam ? 1 : -1), subject = v.team === v.home.id ? v.home : v.away;
    return el("tr", { class: "row-link", title: "abrir a partida", onclick: () => go("#/partida/" + v.match) },
      el("td", { text: v.round == null ? "-" : String(v.round) }),
      el("td", { class: "left" }, el("span", { text: `${v.home.short || v.home.name} x ${v.away.short || v.away.name}` })),
      el("td", { text: v.minute == null ? "-" : v.minute + (v.added ? "+" + v.added : "") + "'" }),
      el("td", { class: "left", text: VAR_KINDS[v.kind] || v.kind }),
      el("td", { class: "left" }, el("span", { text: subject.short || subject.name })),
      el("td", { class: "left" }, el("span", { text: v.player || "-" })),
      el("td", { class: "left" + (effect ? " strong" : ""), text: effect > 0 ? "a favor" : effect < 0 ? "contra" : "sem mudança" }));
  }) : el("tr", {}, el("td", { class: "left", text: "Nenhuma revisão nos jogos deste time." }))));
}

export async function openReferee(id) {
  setView("arbitro");
  local.referee = id;
  if (!local.refs) clear($("referee-body")).appendChild(el("div", { class: "empty", text: "Carregando árbitro..." }));
  try {
    await loadReferees();
  } catch (err) {
    clear($("referee-body")).appendChild(el("div", { class: "empty err", text: tx("Falha ao ler o árbitro: {erro}", { erro: err.message }) }));
    return;
  }
  if (state.view === "arbitro" && local.referee === id) renderReferee();
}

function renderReferees() {
  const d = local.refs, L = d.league, M = L.metrics;
  if (!d.referees.length) {
    clear($("ref-kpis")); clear($("refs-table")); clear($("refs-chart"));
    $("refs-sub").textContent = tx("Nenhuma partida coletada traz o árbitro.");
    $("refs-compare-sub").textContent = "";
    return;
  }
  tiles($("ref-kpis"), [
    ["Árbitros", fmt(d.referees.length), tx("{n} com {min} jogos ou mais", { n: fmt(qualifiedRefs().length), min: d.minGames })],
    ["Cartões por jogo", fmt(M.cards, 1), tx("{amarelos} amarelos, {expulsoes} expulsões", { amarelos: fmt(pairSum(L.yellow)), expulsoes: fmt(pairSum(L.reds)) })],
    ["Faltas por jogo", fmt(M.fouls, 1), tx("{n} cartões a cada 10 faltas", { n: fmt(M.cardsPerFoul, 1) })],
    ["Pênaltis", fmt(pairSum(L.penalties)), tx("{n} por jogo, {m} para o mandante", { n: fmt(M.penalties, 2), m: fmt(L.penalties[0]) })],
    ["Decisões do VAR", fmt(varTotal(L)), tx("{n} por jogo", { n: fmt(M.var, 2) })],
    ["Acréscimo no 2º tempo", fmt(M.added2, 1), tx("minutos anunciados, em média; {n} no 1º tempo", { n: metricText("added1", M.added1) })],
  ]);
  $("refs-sub").textContent = tx("{n} árbitros apitaram as {partidas} partidas coletadas. Clique num nome para abrir o perfil. Um traço só aparece com {min} jogos ou mais e quando a diferença para o resto da liga passa do que o acaso explicaria. A escala não é sorteada, e os jogos grandes ficam com poucos nomes: o perfil descreve os jogos que cada um apitou, não intenção.",
    { n: d.referees.length, partidas: fmt(L.j), min: d.minGames });
  const table = clear($("refs-table"));
  const head = ["#", "Árbitro", "J", "Cart./J", "A", "Exp.", "Faltas/J", "Pên.", "VAR", "Acrésc.", "Perfil"];
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) =>
    el("th", { class: i <= 1 || i === head.length - 1 ? "left" : "", text: h === "A" && LANG !== "pt" ? tx("A (amarelos)") : h,
      title: REF_TITLES[h] || "" })))));
  table.appendChild(el("tbody", {}, d.referees.map((r, i) => el("tr", {
    class: "row-link", title: "abrir o perfil do árbitro", onclick: () => go("#/arbitro/" + r.id) },
    el("td", { class: "left pos", text: String(i + 1) }),
    el("td", { class: "left", text: r.name }),
    el("td", { text: fmt(r.j) }),
    el("td", { class: "strong", text: fmt(r.metrics.cards, 1) }),
    el("td", { text: fmt(pairSum(r.yellow)) }), el("td", { text: fmt(pairSum(r.reds)) }),
    el("td", { text: fmt(r.metrics.fouls, 1) }),
    el("td", { text: fmt(pairSum(r.penalties)) }), el("td", { text: fmt(varTotal(r)) }),
    el("td", { text: fmt(r.metrics.added2, 1) }),
    el("td", { class: "left" }, refTags(r))))));

  const pick = clear($("ref-metric"));
  Object.entries(REF_METRICS).forEach(([key, spec]) => pick.appendChild(el("option", { value: key, text: spec.name })));
  pick.value = local.metric;
  pick.onchange = () => { local.metric = pick.value; renderRefCompare(); };
  renderRefCompare();
}

// Dot plot, as for the ratings: the numbers sit far from zero, so bars from zero would all look
// alike. Only referees with enough matches, the league as the dashed line.
function renderRefCompare() {
  const d = local.refs, key = local.metric, spec = REF_METRICS[key], league = d.league.metrics[key];
  const rows = qualifiedRefs().filter((r) => r.metrics[key] !== null)
    .sort((a, b) => b.metrics[key] - a.metrics[key] || a.name.localeCompare(b.name, "pt-BR"));
  $("refs-compare-sub").textContent = tx("{numero}, de quem apitou {min} jogos ou mais, do maior para o menor. A linha tracejada é a média da liga. Clique para abrir o perfil.",
    { numero: tx(spec.name), min: d.minGames });
  const host = clear($("refs-chart"));
  if (!rows.length) { host.appendChild(el("div", { class: "empty", text: "Nenhum árbitro com jogos suficientes." })); return; }
  dotPlot(host, rows, {
    label: tx("{numero} por árbitro", { numero: tx(spec.name) }), value: (r) => r.metrics[key], digits: spec.digits,
    reference: league !== null ? { value: league, label: tx("liga {v}", { v: metricText(key, league) }) } : null,
    name: (r) => r.name, note: (r) => tx("{n}j", { n: r.j }), open: (r) => "#/arbitro/" + r.id,
    tip: (r) => [el("div", { class: "l", text: r.name }),
                 tipLine(tx(spec.name).toLowerCase(), metricText(key, r.metrics[key]), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{n} jogos · liga {v}", { n: r.j, v: metricText(key, league) }) })],
  });
}

function renderReferee() {
  const host = clear($("referee-body"));
  const r = local.byId && local.byId.get(local.referee);
  if (!r) { host.appendChild(el("div", { class: "empty", text: "Árbitro não encontrado nesta temporada." })); return; }
  const d = local.refs, L = d.league, M = L.metrics, m = r.metrics;
  const rounds = r.matches.map((x) => x.round).filter((x) => x !== null && x !== undefined);
  const first = Math.min(...rounds), last = Math.max(...rounds);
  const c = r.career;
  host.appendChild(el("header", { class: "page-hero" },
    el("span", { class: "page-hero__media" }, el("span", { class: "monogram", "aria-hidden": "true", text: initials(r.name) })),
    el("div", {},
      el("h1", { text: r.name }),
      el("p", { class: "ooyl-sub", text: [
        tx("Árbitro"), tx(r.j === 1 ? "{n} jogo nesta temporada" : "{n} jogos nesta temporada", { n: r.j }),
        rounds.length ? (first === last ? tx("rodada {n}", { n: first }) : tx("rodadas {de} a {ate}", { de: first, ate: last })) : null,
        c ? tx("na carreira, pelo SofaScore: {jogos} jogos, {amarelos} amarelos, {expulsoes} expulsões",
          { jogos: fmt(c.games), amarelos: fmt(c.yellow), expulsoes: fmt((c.red || 0) + (c.yellowRed || 0)) }) : null,
      ].filter(Boolean).join(" · ") }))));

  const kpis = el("div", { class: "ooyl-tiles" });
  tiles(kpis, [
    ["Cartões por jogo", fmt(m.cards, 1), tx("liga {liga} · {amarelos} amarelos, {expulsoes} expulsões",
      { liga: fmt(M.cards, 1), amarelos: fmt(pairSum(r.yellow)), expulsoes: fmt(pairSum(r.reds)) })],
    ["Faltas por jogo", fmt(m.fouls, 1), tx("liga {liga} · {n} cartões a cada 10 faltas", { liga: fmt(M.fouls, 1), n: fmt(m.cardsPerFoul, 1) })],
    ["Pênaltis", fmt(pairSum(r.penalties)), tx("{n} por jogo · liga {liga}", { n: fmt(m.penalties, 2), liga: fmt(M.penalties, 2) })],
    ["Decisões do VAR", fmt(varTotal(r)), tx("{n} por jogo · liga {liga}", { n: fmt(m.var, 2), liga: fmt(M.var, 2) })],
    ["Acréscimo no 2º tempo", fmt(m.added2, 1), tx("minutos em média; {primeiro} no 1º tempo · liga {liga2} e {liga1}",
      { primeiro: metricText("added1", m.added1), liga2: fmt(M.added2, 1), liga1: fmt(M.added1, 1) })],
  ]);
  host.appendChild(kpis);

  const traits = el("div", {});
  if (r.j < d.minGames) {
    traits.appendChild(el("p", { class: "ref-note", text: tx(r.j === 1
      ? "Com {n} jogo a amostra ainda é pequena: o perfil é traçado a partir de {min} jogos. Os números abaixo já valem como registro."
      : "Com {n} jogos a amostra ainda é pequena: o perfil é traçado a partir de {min} jogos. Os números abaixo já valem como registro.",
      { n: r.j, min: d.minGames }) }));
  } else if (!r.traits.length) {
    traits.appendChild(el("p", { class: "ref-note", text: "Nenhum número se afasta do resto da liga mais do que o acaso "
      + "explicaria com esses jogos: um árbitro no padrão da competição." }));
  } else {
    traits.appendChild(el("ul", { class: "ref-traits" }, r.traits.map((t) => el("li", { class: "ref-trait" },
      el("span", { class: "ooyl-tag", title: tx("a {n} erros-padrão do resto da liga", { n: fmt(Math.abs(t.z), 1) }),
                   text: (t.dir > 0 ? "▲ " : "▼ ") + tx(traitName(t)) }),
      el("span", { text: traitSentence(t, r) })))));
  }
  const strip = el("div", {});
  host.appendChild(cardBox("Perfil traçado", tx("Cada linha é um número deste árbitro (o ponto em destaque) entre os outros árbitros com {min} jogos ou mais (pontos claros; passe o mouse para ver quem é), com a média da liga tracejada. Um traço entra no perfil quando a diferença para o resto da liga passa de duas vezes o erro esperado para o número de jogos dele, o que o acaso raramente produz. A barra à esquerda marca essas linhas.",
    { min: d.minGames }), traits, strip));
  refStrip(strip, r);

  host.appendChild(el("div", { class: "ref-pair" },
    cardBox("Mando de campo", "Como o que ele marcou se dividiu entre mandante e visitante. Embaixo de cada linha, "
      + "a parte do mandante com ele e na liga.", homeAway(r)),
    cardBox("Decisões do VAR", tx(varTotal(r) === 1 ? "{n} decisão registrada pelo SofaScore nos jogos dele, {porJogo} por jogo (liga {liga})."
      : "{n} decisões registradas pelo SofaScore nos jogos dele, {porJogo} por jogo (liga {liga}).",
      { n: fmt(varTotal(r)), porJogo: fmt(m.var, 2), liga: fmt(M.var, 2) }), varList(r))));
  host.appendChild(el("div", { class: "ref-pair" },
    cardBox("Motivos dos cartões", "O motivo que o SofaScore registrou em cada cartão, com a parte de cada um "
      + "nos cartões dele; ao lado, a mesma parte na liga.", reasonsList(r)),
    cardBox("Minuto dos cartões", tx("Parte dos cartões em cada faixa de 15 minutos; o tracejado é a liga, e os acréscimos ficam na última faixa de cada tempo. Primeiro cartão aos {minuto} em média (liga {liga}).",
      { minuto: metricText("firstCard", m.firstCard), liga: metricText("firstCard", M.firstCard) }), minutesChart(r, d.buckets))));

  const teams = el("table");
  const teamHead = ["Time", "J", "V", "E", "D", "Cartões", "Por jogo", "Temporada", "Exp.", "Pên. a favor"];
  teams.appendChild(el("thead", {}, el("tr", {}, teamHead.map((h, i) =>
    el("th", { class: i === 0 ? "left" : "", text: h, title: REF_TITLES[h] || "" })))));
  teams.appendChild(el("tbody", {}, r.teams.map((t) => {
    const season = state.index && state.index.table.find((row) => row.team.id === t.team.id);
    return el("tr", { class: "row-link", title: "abrir o time", onclick: () => go("#/time/" + t.team.id) },
      el("td", { class: "left" }, crest(t.team), el("span", { text: t.team.name })),
      el("td", { text: fmt(t.j) }), el("td", { text: fmt(t.v) }), el("td", { text: fmt(t.e) }), el("td", { text: fmt(t.d) }),
      el("td", { class: "strong", text: fmt(t.cards) }), el("td", { text: fmt(t.cards / t.j, 1) }),
      el("td", { class: "muted", text: season && season.j ? fmt(teamCards(season) / season.j, 1) : "-" }),
      el("td", { text: fmt(t.reds) }), el("td", { text: fmt(t.penalties) }));
  })));
  host.appendChild(cardBox("Times", "Os jogos de cada time com este árbitro, do lado do time. Temporada é a média de "
    + "cartões do time em todos os jogos, para comparar. Clique para abrir o time.", el("div", { class: "scroll" }, teams)));

  const games = el("table", { class: "ref-games" });
  const gameHead = ["Rod.", "Data", "Jogo", "Cartões", "Exp.", "Faltas", "Pên.", "VAR", "Acrésc."];
  const gameTitles = { Cartões: "Cartões na partida, somando os dois times", "Acrésc.": "Acréscimo anunciado no 1º e no 2º tempo" };
  games.appendChild(el("thead", {}, el("tr", {}, gameHead.map((h, i) =>
    el("th", { class: i <= 2 ? "left" : "", text: h, title: gameTitles[h] || REF_TITLES[h] || "" })))));
  games.appendChild(el("tbody", {}, r.matches.map((x) => el("tr", { class: "row-link", title: "abrir a partida", onclick: () => go("#/partida/" + x.id) },
    el("td", { class: "left", text: String(x.round ?? "-") }),
    el("td", { class: "left", text: dateOf(x.timestamp) }),
    el("td", { class: "left" }, teamName(x.home), el("b", { class: "ref-score", text: `${x.gh}–${x.ga}` }), teamName(x.away)),
    el("td", { class: "strong", title: tx("{casa} para o mandante, {fora} para o visitante", { casa: x.cards[0], fora: x.cards[1] }), text: fmt(pairSum(x.cards)) }),
    el("td", { text: fmt(pairSum(x.reds)) }),
    el("td", { title: x.fouls ? tx("{casa} do mandante, {fora} do visitante", { casa: x.fouls[0], fora: x.fouls[1] }) : null, text: x.fouls ? fmt(pairSum(x.fouls)) : "-" }),
    el("td", { text: fmt(pairSum(x.penalties)) }), el("td", { text: fmt(x.var) }),
    el("td", { text: x.added.map((a) => a === null ? "-" : "+" + a).join(" / ") })))));
  host.appendChild(cardBox("Partida a partida", "Cartões, expulsões, faltas e pênaltis somam os dois times; passe o mouse "
    + "para ver a divisão. Clique numa linha para abrir a partida.", el("div", { class: "scroll" }, games)));
}

// Where the referee stands on each number: the others with enough matches as faint dots (the name
// on hover, a click opens them), the league mean dashed, this one in accent with the value at the
// end. Each row gets its own scale, fitted to the dots.
function refStrip(host, r) {
  const d = local.refs, peers = qualifiedRefs().filter((p) => p.id !== r.id);
  const box = el("div", { class: "ref-strip" });
  Object.entries(REF_METRICS).forEach(([key, spec]) => {
    const mine = r.metrics[key], league = d.league.metrics[key];
    if (mine === null) return;
    const others = peers.filter((p) => p.metrics[key] !== null);
    const all = [mine, ...others.map((p) => p.metrics[key]), ...(league !== null ? [league] : [])];
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1;
    const x = (v) => (100 * (v - lo + pad)) / (hi - lo + 2 * pad);
    const plot = el("span", { class: "ref-strip__plot" },
      league !== null ? el("span", { class: "ooyl-dotplot__ref", style: `left:${x(league)}%` }) : null);
    others.forEach((p) => {
      const dot = el("i", { class: "ref-strip__peer", style: `left:${x(p.metrics[key])}%` });
      dot.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, [el("div", { class: "l", text: p.name }),
        tipLine(tx(spec.name).toLowerCase(), metricText(key, p.metrics[key]), "var(--data-context)"),
        el("div", { class: "l", text: tx("{n} jogos · clique para abrir", { n: p.j }) })]));
      dot.addEventListener("pointerleave", hideTip);
      dot.addEventListener("click", () => { hideTip(); go("#/arbitro/" + p.id); });
      plot.appendChild(dot);
    });
    plot.appendChild(el("i", { class: "ref-strip__me", style: `left:${x(mine)}%` }));
    box.appendChild(el("div", { class: "ref-strip__row" + (r.traits.some((t) => t.metric === key) ? " is-trait" : "") },
      el("span", { class: "ref-strip__name" }, el("b", { text: spec.name, title: spec.name }),
        el("small", { text: league !== null ? tx("liga {v}", { v: metricText(key, league) }) : "" })),
      plot,
      el("span", { class: "ref-strip__val", text: metricText(key, mine) })));
  });
  host.appendChild(box);
}

// Home against away in the match view's comparison rows. Each side's count, the split as bars,
// and underneath the home share with this referee and across the league.
function homeAway(r) {
  const L = local.refs.league;
  const share = (p) => pairSum(p) ? fmt((100 * p[0]) / pairSum(p), 0) + "%" : "-";
  const rows = [
    ["Cartões recebidos", r.cards, L.cards],
    ["Expulsões", r.reds, L.reds],
    ["Faltas cometidas", r.fouls, L.fouls],
    ["Pênaltis a favor", r.penalties, L.penalties],
    ["Vitórias", [r.results[0], r.results[2]], [L.results[0], L.results[2]],
     tx(r.results[1] === 1 ? "{n} empate" : "{n} empates", { n: r.results[1] })],
  ];
  return el("div", { class: "ooyl-compare" },
    el("div", { class: "ooyl-compare__legend" },
      el("span", { class: "tname" }, el("i", { class: "swatch", style: "background:var(--home)" }), el("span", { text: "Mandante" })),
      el("span", { class: "tname" }, el("span", { text: "Visitante" }), el("i", { class: "swatch", style: "background:var(--away)" }))),
    rows.map(([name, mine, league, extra]) => {
      const [h, a] = mine, total = h + a;
      const lead = h === a ? "" : h > a ? "home" : "away";
      return el("div", { class: "ooyl-compare__row" },
        el("span", { class: "ooyl-compare__v is-home" + (lead === "home" ? " is-lead" : ""), text: fmt(h) }),
        el("span", { class: "ooyl-compare__name" }, name,
          el("small", { text: tx("mandante {casa} · liga {liga}", { casa: share(mine), liga: share(league) }) + (extra ? " · " + extra : "") })),
        el("span", { class: "ooyl-compare__v is-away" + (lead === "away" ? " is-lead" : ""), text: fmt(a) }),
        el("div", { class: "ooyl-compare__bars", "aria-hidden": "true" },
          el("span", { class: "ooyl-compare__half is-home" }, el("i", { class: lead !== "away" ? "is-lead" : null, style: `width:${total ? (100 * h) / total : 0}%` })),
          el("span", { class: "ooyl-compare__half is-away" }, el("i", { class: lead !== "home" ? "is-lead" : null, style: `width:${total ? (100 * a) / total : 0}%` }))));
    }));
}

function varList(r) {
  const host = el("div", {}), L = local.refs.league;
  const rows = Object.entries(r.var).map(([kind, n]) => ({ kind, n }));
  if (!rows.length) { host.appendChild(el("div", { class: "empty", text: "Nenhuma decisão do VAR registrada nos jogos dele." })); return host; }
  barList(host, rows, {
    label: "Decisões do VAR", value: (x) => x.n, text: (x) => fmt(x.n), name: (x) => VAR_KINDS[x.kind] || x.kind,
    tip: (x) => [el("div", { class: "l", text: VAR_KINDS[x.kind] || x.kind }), tipLine("decisões", fmt(x.n), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{n} por jogo · liga {liga}", { n: fmt(x.n / r.j, 2), liga: fmt((L.var[x.kind] || 0) / L.j, 2) }) })],
  });
  return host;
}

function reasonsList(r) {
  const host = el("div", {}), L = local.refs.league;
  const total = Object.values(r.reasons).reduce((a, b) => a + b, 0);
  const leagueTotal = Object.values(L.reasons).reduce((a, b) => a + b, 0);
  const share = (n, of) => of ? fmt((100 * n) / of, 0) + "%" : "-";
  const rows = Object.entries(r.reasons).map(([kind, n]) => ({ kind, n }));
  if (!rows.length) { host.appendChild(el("div", { class: "empty", text: "Nenhum cartão nos jogos dele." })); return host; }
  barList(host, rows, {
    label: "Motivos dos cartões", value: (x) => x.n, text: (x) => `${fmt(x.n)} · ${share(x.n, total)}`,
    name: (x) => reasonName(x.kind), note: (x) => tx("liga {v}", { v: share(L.reasons[x.kind] || 0, leagueTotal) }),
    tip: (x) => [el("div", { class: "l", text: reasonName(x.kind) }), tipLine("cartões", fmt(x.n), "var(--data-dot)"),
                 el("div", { class: "l", text: tx("{pct} dos cartões dele · {liga} na liga", { pct: share(x.n, total), liga: share(L.reasons[x.kind] || 0, leagueTotal) }) })],
  });
  return host;
}

// Columns in HTML, as the ranking bars: the share of the referee's cards in each 15 minutes, the
// busiest in accent, the league's share as a dashed mark across the column.
function minutesChart(r, buckets) {
  const L = local.refs.league;
  const total = r.minutes.reduce((a, b) => a + b, 0), leagueTotal = L.minutes.reduce((a, b) => a + b, 0);
  if (!total) return el("div", { class: "empty", text: "Nenhum cartão nos jogos dele." });
  const mine = r.minutes.map((n) => n / total), league = L.minutes.map((n) => leagueTotal ? n / leagueTotal : 0);
  const top = Math.max(...mine, ...league) * 1.08, lead = mine.indexOf(Math.max(...mine));
  return el("div", { class: "ref-minutes", role: "img", "aria-label": tx("Parte dos cartões em cada faixa de 15 minutos: {lista}",
    { lista: mine.map((s, i) => `${bucketName(buckets, i)} ${fmt(100 * s, 0)}%`).join(", ") }) },
    mine.map((s, i) => {
      const col = el("div", { class: "ref-minutes__col" + (i === lead ? " is-lead" : "") },
        el("span", { class: "ref-minutes__plot" },
          el("i", { class: "ref-minutes__bar", style: `height:${(100 * s) / top}%` }),
          el("i", { class: "ref-minutes__league", style: `bottom:${(100 * league[i]) / top}%` })),
        el("span", { class: "ref-minutes__val", text: fmt(100 * s, 0) + "%" }),
        el("span", { class: "ref-minutes__label", text: bucketName(buckets, i) }));
      col.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, [
        el("div", { class: "l", text: tx("Minutos {faixa}", { faixa: bucketName(buckets, i) }) }),
        tipLine("cartões", `${fmt(r.minutes[i])} (${fmt(100 * s, 0)}%)`, "var(--data-dot)"),
        el("div", { class: "l", text: tx("liga: {pct}% dos cartões", { pct: fmt(100 * league[i], 0) }) })]));
      col.addEventListener("pointerleave", hideTip);
      return col;
    }));
}

$("ref-tabs").addEventListener("click", (ev) => {
  const btn = ev.target.closest('[role="tab"]');
  if (btn) go(btn.dataset.rtab === "arbitros" ? "#/arbitragem" : "#/arbitragem/" + btn.dataset.rtab);
});
$("referee-back").addEventListener("click", () => go("#/arbitragem"));

// A new match changes every referee's numbers: read them again, now if they are on screen.
on("index", () => {
  local.refs = null;
  local.byId = null;
  if ((state.view === "arbitragem" && local.tab === "arbitros") || state.view === "arbitro") {
    loadReferees().then(() => {
      if (state.view === "arbitragem") renderReferees();
      if (state.view === "arbitro") renderReferee();
    }).catch(() => {});
  }
});
on("theme", () => {
  if (state.view === "arbitragem" && local.tab === "arbitros" && local.refs) renderReferees();
  if (state.view === "arbitro" && local.refs) renderReferee();
});
