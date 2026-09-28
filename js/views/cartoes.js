// Arbitragem › Previsão de cartões (/api/cards, analysis/cards.py): the cards expected in each match
// still to play, counted as the bookmakers' line counts them (yellow 1, red 2, players only), with
// the referee once named and the line once SofaScore has it; and how the forecast did this season,
// day by day, against the league average and against that line.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { showTip, hideTip, tipLine } from "../core/tooltip.js";
import { crest, teamName, tiles } from "../core/ui.js";
import { dateOf, dated, daySpan, pct, timeOf, weekdayOf } from "../core/format.js";
import { getJSON } from "../core/api.js";
import { LOCALE, ord, tx, txn } from "../core/i18n.js";

const local = { cards: null, round: null };
const onScreen = () => state.view === "arbitragem" && !$("cards-main").hidden;

export async function open() {
  if (!local.cards) {
    clear($("cards-kpis")); clear($("cards-list")); clear($("cards-test"));
    $("cards-sub").textContent = tx("Calculando a previsão...");
    $("cards-test-sub").textContent = "";
    try {
      local.cards = await getJSON("/api/cards");
    } catch (err) {
      $("cards-sub").textContent = tx("Não foi possível calcular a previsão: {erro}", { erro: err.message });
      return;
    }
  }
  if (onScreen()) render();
}

function render() {
  const d = local.cards, list = d.matches, t = d.test;
  tiles($("cards-kpis"), [
    ["Jogos a disputar", fmt(list.length), tx("{arbitro} com árbitro escalado, {linha} com linha das casas",
      { arbitro: fmt(list.filter((m) => m.referee).length), linha: fmt(list.filter((m) => m.market).length) })],
    ["Média da liga", fmt(d.league, 1), "cartões por jogo como a linha das casas conta: amarelo 1, vermelho 2, só jogadores"],
    // Early in a season the forecast can do worse than the plain average: the note says which way.
    ...(t ? [["Ganho sobre a média", fmt(100 * t.gain, 1) + "%", tx(t.gain >= 0 ? "menos erro que prever a média da liga, em {n} jogos da temporada"
      : "mais erro que prever a média da liga, em {n} jogos da temporada", { n: fmt(t.n) })]] : []),
    ...(t && t.market ? [["Linha das casas", fmt(100 * t.market.gain, 1) + "%",
      tx("o mesmo ganho nos {n} jogos com linha guardada; o nosso ali, {nosso}%", { n: fmt(t.market.n), nosso: fmt(100 * t.market.ours, 1) })]] : []),
  ]);
  renderTest(d);
  const host = clear($("cards-list")), sub = $("cards-sub");
  const pick = clear($("cards-round"));
  if (!d.hasCalendar) {
    pick.hidden = true;
    sub.textContent = tx("Sem calendário em disco.");
    host.appendChild(el("div", { class: "empty" }, "Baixe-o em Admin › Atualizar calendário ou rode ",
      el("code", { text: "python coletar.py calendario" }), "."));
    return;
  }
  // Rounds in playing order, as in Próximas rodadas: a postponed game with a date before a later
  // round comes first. The round of the next kickoff opens by default.
  const rounds = new Map();
  list.filter(dated).sort((a, b) => a.timestamp - b.timestamp).forEach((m) => {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round).push(m);
  });
  const undated = list.filter((m) => !dated(m));
  const now = Date.now() / 1000;
  const next = list.filter((m) => dated(m) && m.timestamp > now).reduce((best, m) => (!best || m.timestamp < best.timestamp ? m : best), null);
  const keys = [...rounds.keys()].map(String);
  if (local.round === null || (local.round && local.round !== "sem" && !keys.includes(local.round))) {
    local.round = next ? String(next.round) : "";
  }
  pick.hidden = false;
  pick.appendChild(el("option", { value: "", text: "Todas as rodadas" }));
  rounds.forEach((_, r) => pick.appendChild(el("option", { value: String(r), text: tx("Rodada {n}", { n: r ?? "?" }) })));
  if (undated.length) pick.appendChild(el("option", { value: "sem", text: "Sem data definida" }));
  pick.value = local.round;
  pick.onchange = () => { local.round = pick.value; render(); };
  const updated = d.updated ? new Date(d.updated * 1000).toLocaleString(LOCALE, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  sub.textContent = tx("Cartões esperados em cada jogo, contados como a linha das casas (amarelo 1, vermelho 2, só jogadores): a média da liga ajustada pelo árbitro e pelo quanto cada time recebe e faz o adversário receber. O árbitro escalado e a linha das casas entram ao atualizar o calendário, para os jogos dos próximos 7 dias; até lá o árbitro conta como um da média. Passe o mouse num jogo para ver a conta.")
    + (updated ? tx(" Calendário atualizado em {quando}.", { quando: updated }) : "");
  if (!list.length) { host.appendChild(el("div", { class: "empty", text: "Nenhum jogo a disputar no calendário." })); return; }
  const block = (title, games) => [el("div", { class: "round-name", text: title }), el("div", {}, games.map((m) => cardRow(m, next, d)))];
  rounds.forEach((games, r) => {
    if (local.round === "" || local.round === String(r)) {
      host.append(...block(tx("Rodada {n} · {dias}", { n: r ?? "?", dias: daySpan(games[0].timestamp, games[games.length - 1].timestamp) }), games));
    }
  });
  if (undated.length && (local.round === "" || local.round === "sem")) host.append(...block("Sem data definida", undated));
}

// The team's name, or on phones its three-letter code (see the CSS), as on the match scoreboard.
const teamLabel = (t) => [t.code ? el("span", { class: "cards-row__code", "aria-hidden": "true", text: t.code }) : null,
  el("span", { class: "cards-row__name", text: t.name })];

// A match to play: date, the teams, the expected cards where a result would sit, then the referee,
// the chance of more than 4.5 cards and the bookmakers' line (with both chances over it) when out.
function cardRow(m, next, d) {
  const f = m.factors, when = dated(m);
  const row = el("div", { class: "cards-row" + (next && m.id === next.id ? " is-next" : "") },
    el("span", { class: "ooyl-match__when" }, when ? [el("small", { text: weekdayOf(m.timestamp) + " " + timeOf(m.timestamp) }), dateOf(m.timestamp)] : "–"),
    el("span", { class: "cards-row__side is-home" }, teamLabel(m.home), crest(m.home)),
    el("span", { class: "cards-row__exp", "aria-label": tx("{n} cartões esperados", { n: fmt(m.expected, 1) }) },
      el("b", { text: fmt(m.expected, 1) }), el("small", { text: `${fmt(m.sides[0], 1)} + ${fmt(m.sides[1], 1)}` })),
    el("span", { class: "cards-row__side is-away" }, crest(m.away), teamLabel(m.away)),
    el("span", { class: "cards-row__info" },
      m.referee
        ? el("span", { class: "cards-row__cell" },
            el("a", { href: "#/arbitro/" + m.referee.id, title: "abrir o perfil do árbitro", text: m.referee.name || "árbitro escalado" }),
            el("small", { text: tx(m.referee.games === 1 ? "árbitro ×{fator} · {n} jogo" : "árbitro ×{fator} · {n} jogos",
              { fator: fmt(f.referee, 2), n: m.referee.games }) }))
        : el("span", { class: "cards-row__cell is-muted" }, el("span", { text: "árbitro a definir" }), el("small", { text: "conta como ×1,00" })),
      el("span", { class: "cards-row__cell" }, el("b", { text: pct(m.over["4.5"]) }), el("small", { text: "mais de 4,5" })),
      m.market
        ? el("span", { class: "cards-row__cell" }, el("span", {}, "linha das casas ", el("b", { text: fmt(m.market.line, 1) })),
            el("small", { text: tx("mais: casas {casas}, nós {nos}", { casas: pct(m.market.pOver), nos: pct(m.market.ours) }) }))
        : el("span", { class: "cards-row__cell is-muted" }, el("span", { text: "sem linha das casas" }), el("small", { text: "sai perto do jogo" }))));
  row.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, [
    el("div", { class: "l" }, teamName(m.home), " x ", teamName(m.away)),
    tipLine("cartões esperados", fmt(m.expected, 2), "var(--data-dot)"),
    el("div", { class: "l", text: tx(m.referee ? "média da liga {liga} · árbitro ×{fator}" : "média da liga {liga} · árbitro ×{fator} (a definir)",
      { liga: fmt(f.league, 2), fator: fmt(f.referee, 2) }) }),
    el("div", { class: "l", text: tx("{time}: recebe ×{recebe}, provoca ×{provoca}", { time: m.home.short, recebe: fmt(f.home[0], 2), provoca: fmt(f.home[1], 2) }) }),
    el("div", { class: "l", text: tx("{time}: recebe ×{recebe}, provoca ×{provoca}", { time: m.away.short, recebe: fmt(f.away[0], 2), provoca: fmt(f.away[1], 2) }) }),
    el("div", { class: "l", text: d.lines.map((l) => tx("mais de {n}: {pct}", { n: fmt(l, 1), pct: pct(m.over[String(l)]) })).join(" · ") }),
  ]));
  row.addEventListener("pointerleave", hideTip);
  return row;
}

// The walk-forward test: thirds of the forecast against what happened, then the market's line.
function renderTest(d) {
  const t = d.test, host = clear($("cards-test"));
  if (!t) {
    $("cards-test-sub").textContent = "";
    host.appendChild(el("div", { class: "empty", text: "Ainda há poucos jogos na temporada para testar a previsão." }));
    return;
  }
  $("cards-test-sub").textContent = tx("Cada dia da temporada, a partir do {n} jogo, previsto só com os dias anteriores, como o simulador é testado. Os jogos vão em três grupos iguais, dos que a previsão esperava menos cartões aos que esperava mais.",
    { n: ord(d.minPrior) });
  const table = el("table", { class: "cards-thirds" });
  const head = ["Previsão", "Jogos", "Cartões previstos", "Cartões reais", "Mais de 4,5: previsto", "Mais de 4,5: real"];
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { class: i === 0 ? "left" : "", text: h })))));
  table.appendChild(el("tbody", {}, t.thirds.map((g, i) => el("tr", {},
    el("td", { class: "left", text: ["Baixa", "Média", "Alta"][i] || "" }), el("td", { text: fmt(g.n) }),
    el("td", { text: fmt(g.forecast, 2) }), el("td", { class: "strong", text: fmt(g.real, 2) }),
    el("td", { text: pct(g.over45Forecast) }), el("td", { class: "strong", text: pct(g.over45) })))));
  host.appendChild(el("div", { class: "scroll" }, table));
  // A gain is the error saved against the league average; early in a season it can be negative.
  const less = (v) => tx(v >= 0 ? "{n}% menos" : "{n}% mais", { n: fmt(100 * Math.abs(v), 1) });
  const notes = [el("p", { class: "cards-note" }, txn("Na temporada, o erro quadrático da previsão ficou {ganho} que o de prever a média da liga em todo jogo. Um jogo sozinho continua imprevisível: a mesma previsão de 5 cartões termina com 2 ou com 9.",
    { ganho: el("b", { text: tx(t.gain >= 0 ? "{n}% menor" : "{n}% maior", { n: fmt(100 * Math.abs(t.gain), 1) }) }) }))];
  const m = t.market;
  if (m) {
    notes.push(el("p", { class: "cards-note" }, txn("Nos {n} desses jogos com a linha de fechamento das casas guardada pelo SofaScore, a linha errou {linha} que a média da liga e a nossa previsão {nossa}; a média das duas, {media}%, {veredito}{arbitro}", {
      n: fmt(m.n), linha: el("b", { text: less(m.gain) }), nossa: el("b", { text: less(m.ours) }), media: fmt(100 * m.blend, 1),
      veredito: tx(m.blend > m.gain + 0.005 ? "melhora um pouco a linha. " : "não melhora a linha: a nossa previsão não sabe nada que as casas não saibam. "),
      arbitro: m.withReferee !== null ? tx("Com os times descontados, a linha ainda sobe e desce com o árbitro (correlação {r}): as casas contam com a escala. ",
        { r: fmt(m.withReferee, 2) }) : "" })));
    notes.push(el("p", { class: "cards-note" }, tx("Na própria linha, o over saiu em {real} desses jogos; as casas davam {casas} em média, já sem a margem delas ({margem}%), e nós {nos}. O SofaScore não diz como o mercado conta os cartões; na Série A de 2026, só a conta com o vermelho valendo 2 pôs a frequência real ao lado da das casas, e por isso a previsão conta assim.",
      { real: pct(m.overReal), casas: pct(m.overMarket), margem: fmt(100 * m.margin, 1), nos: pct(m.overOurs) })));
  }
  notes.forEach((n) => host.appendChild(n));
}

on("index", () => { local.cards = null; if (onScreen()) open(); });
on("theme", () => { if (onScreen() && local.cards) render(); });
