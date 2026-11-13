// Partida: the scoreboard and four tabs, each with its route #/partida/{id}/{aba}: the timeline,
// the statistics side by side, the lineups on the pitch and the shotmap.
import { $, el, clear, fmt, css } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView, syncTabs } from "../core/router.js";
import { showTip, hideTip, tipLine } from "../core/tooltip.js";
import { CARD_REASONS, cardMark, crest, playerDisc, rateChip, teamName, turf } from "../core/ui.js";
import { decimalComma } from "../core/format.js";
import { BODY, PITCH, SHOT_LABEL, SITUATION, formationRows, legendMark, pitchSvg } from "../core/pitch.js";
import { getJSON } from "../core/api.js";
import { LOCALE, tx } from "../core/i18n.js";

const MTABS = ["resumo", "estatisticas", "escalacoes", "shotmap", "gols"];
const local = { match: null, tab: "resumo", shotFilter: "todos" };

export async function open(id, tab) {
  tab = MTABS.includes(tab) ? tab : "resumo";
  if (local.match && local.match.id === id) {  // the same match, another tab: no new request
    local.tab = tab;
    setView("partida");
    syncTabs($("match-tabs"), "mtab", tab);
    renderMatchBody();
    return;
  }
  setView("partida");
  const body = clear($("match-body"));
  body.appendChild(el("div", { class: "empty", text: "Carregando partida..." }));
  try {
    local.match = await getJSON("/api/match/" + id);
    local.tab = tab;
    syncTabs($("match-tabs"), "mtab", local.tab);
    renderMatchHead();
    renderMatchBody();
  } catch (err) {
    clear($("match-body")).appendChild(el("div", { class: "empty err", text: tx("Falha ao ler a partida: {erro}", { erro: err.message }) }));
  }
}

function renderMatchHead() {
  const m = local.match;
  const host = clear($("match-head"));
  const meta = [m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString(LOCALE, { day: "2-digit", month: "long", year: "numeric" }) : null,
    m.venue].filter(Boolean).join(" · ");
  // The referee's name opens the profile in Arbitragem when the payload carries the id.
  const referee = m.referee ? ["Árbitro: ", m.refereeId
    ? el("a", { href: "#/arbitro/" + m.refereeId, title: "abrir o perfil do árbitro", text: m.referee }) : m.referee] : null;
  // The side ticks are home and away, the same colors as every comparison below.
  const team = (t, which) => el("div", { class: "ooyl-scoreboard__team is-" + which },
    which === "away" ? crest(t, true) : null,
    // Phones show the three-letter code in place of the name (see the CSS); readers still get the name.
    el("div", { class: "ooyl-scoreboard__name" }, el("h2", { class: "ooyl-headline" },
        t.code ? el("span", { class: "ooyl-scoreboard__code", "aria-hidden": "true", text: t.code }) : null,
        el("span", { class: "ooyl-scoreboard__full", text: t.name })),
      el("i", { class: "ooyl-scoreboard__tick", style: `background:var(--${which})`, "aria-hidden": "true" })),
    which === "home" ? crest(t, true) : null);
  const ht = m.score.htHome !== null && m.score.htHome !== undefined;
  host.appendChild(el("div", { class: "ooyl-scoreboard" },
    m.round ? el("p", { class: "ooyl-kicker", text: tx("Rodada {n}", { n: m.round }) }) : null,
    el("div", { class: "ooyl-scoreboard__row" },
      team(m.home, "home"),
      el("div", { class: "ooyl-scoreboard__score", "aria-label": `${m.home.name} ${m.score.home}, ${m.away.name} ${m.score.away}` },
        el("span", { text: String(m.score.home) }), el("i", { "aria-hidden": "true", text: "–" }), el("span", { text: String(m.score.away) })),
      team(m.away, "away")),
    ht ? el("div", { class: "ooyl-scoreboard__ht", text: tx("intervalo {placar}", { placar: `${m.score.htHome}–${m.score.htAway}` }) }) : null,
    meta || referee ? el("div", { class: "ooyl-scoreboard__meta" }, meta, meta && referee ? " · " : null, referee) : null));
}

function renderMatchBody() {
  const host = clear($("match-body"));
  const m = local.match;
  if (local.tab === "resumo") return renderTimeline(host, m);
  if (local.tab === "estatisticas") return renderStats(host, m);
  if (local.tab === "escalacoes") return renderLineups(host, m);
  if (local.tab === "gols") return renderGoals(host, m);
  return renderShotmap(host, m);
}

// The match story on a center spine: home events on the left, away on the right, the minute
// in the middle (accent for goals), periods as rules. Kick-off first.
const PERIOD_NAMES = { FT: "Fim de jogo", HT: "Intervalo" };
const GOAL_TAGS = { ownGoal: "Gol contra", penalty: "Pênalti" };
function renderTimeline(host, m) {
  const shown = m.incidents.filter((i) => ["goal", "card", "substitution", "period"].includes(i.type));
  if (!shown.length) { host.appendChild(el("div", { class: "empty", text: "Sem incidentes registrados." })); return; }
  const list = el("ol", { class: "ooyl-timeline" });
  shown.slice().reverse().forEach((i) => {
    if (i.type === "period") {
      list.appendChild(el("li", { class: "ooyl-tl is-period" }, el("span", {}, PERIOD_NAMES[i.text] || i.text || "",
        i.homeScore !== null && i.homeScore !== undefined ? el("b", { text: `${i.homeScore}–${i.awayScore}` }) : null)));
      return;
    }
    const min = i.time !== null && i.time !== undefined ? i.time + (i.added ? "+" + i.added : "") + "'" : "";
    let body, kind;
    if (i.type === "goal") {
      kind = "goal";
      body = [el("span", { class: "ooyl-tl__who", text: i.player || "Gol" }),
        el("span", { class: "ooyl-tag" + (i.class === "ownGoal" ? "" : " ooyl-tag--accent"), text: GOAL_TAGS[i.class] || "Gol" }),
        el("span", { class: "ooyl-tl__score", text: `${i.homeScore}–${i.awayScore}` }),
        i.assist ? el("span", { class: "ooyl-tl__meta", text: tx("assist. {nome}", { nome: i.assist }) }) : null];
    } else if (i.type === "card") {
      kind = "card";
      body = [cardMark(i.class), el("span", { class: "ooyl-tl__who", text: i.player || "" }),
        i.reason ? el("span", { class: "ooyl-tl__meta", text: CARD_REASONS[i.reason] || i.reason }) : null];
    } else {
      kind = "sub";
      body = [el("span", { class: "ooyl-tl__who", text: i.playerIn || "" }),
        el("span", { class: "ooyl-tl__meta", text: tx("no lugar de {nome}", { nome: i.playerOut || "" }) })];
    }
    list.appendChild(el("li", { class: "ooyl-tl is-" + kind },
      el("div", { class: "ooyl-tl__side is-home" }, i.isHome ? body : null),
      el("div", { class: "ooyl-tl__min", text: min }),
      el("div", { class: "ooyl-tl__side is-away" }, i.isHome ? null : body)));
  });
  host.appendChild(list);
}

const GROUP_NAMES = {
  "Match overview": "Visão geral", Shots: "Finalizações", Attack: "Ataque", Passes: "Passes",
  Duels: "Duelos", Defending: "Defesa", Goalkeeping: "Goleiro",
};
const STAT_NAMES = {
  "Ball possession": "Posse de bola", "Expected goals": "Gols esperados (xG)",
  "Expected goals on target": "xG no alvo", "Total shots": "Finalizações",
  "Shots on target": "Finalizações no alvo", "Shots off target": "Finalizações para fora",
  "Blocked shots": "Finalizações bloqueadas", "Shots inside box": "Finalizações na área",
  "Shots outside box": "Finalizações de fora da área", "Big chances": "Grandes chances",
  "Big chances missed": "Grandes chances perdidas", "Big chances scored": "Grandes chances convertidas",
  "Hit woodwork": "Bolas na trave", "Goalkeeper saves": "Defesas do goleiro",
  "Total saves": "Total de defesas", "Big saves": "Defesas difíceis",
  "Penalty saves": "Pênaltis defendidos", "Goals prevented": "Gols evitados",
  "Goal kicks": "Tiros de meta", "High claims": "Saídas de cruzamento", Punches: "Socos",
  "Corner kicks": "Escanteios", "Free kicks": "Tiros livres", "Throw-ins": "Laterais",
  Offsides: "Impedimentos", Fouls: "Faltas", "Fouled in final third": "Faltas sofridas no último terço",
  "Yellow cards": "Cartões amarelos", "Red cards": "Cartões vermelhos",
  Passes: "Passes", "Accurate passes": "Passes certos", "Long balls": "Bolas longas",
  Crosses: "Cruzamentos", "Through balls": "Passes em profundidade",
  "Final third entries": "Entradas no último terço", "Final third phase": "Fase no último terço",
  "Touches in penalty area": "Toques na área", Duels: "Duelos", "Ground duels": "Duelos no chão",
  "Aerial duels": "Duelos aéreos", Dribbles: "Dribles", Dispossessed: "Perdas de posse",
  Tackles: "Desarmes", "Total tackles": "Total de desarmes", "Tackles won": "Desarmes certos",
  Interceptions: "Interceptações", Recoveries: "Recuperações", Clearances: "Cortes",
  "Errors lead to a shot": "Erros que geraram finalização", "Errors lead to a goal": "Erros que geraram gol",
  "Distance covered": "Distância percorrida", "Number of sprints": "Sprints",
  "Average rating": "Nota média",
};

// Home against away, stat by stat: both values, the name, and a split bar where the leading
// side is full strength. For these, fewer is better.
const LOWER_IS_BETTER = new Set(["Big chances missed", "Errors lead to a shot", "Errors lead to a goal", "Dispossessed",
                                 "Yellow cards", "Red cards"]);
function renderStats(host, m) {
  const period = m.statistics.find((p) => p.period === "ALL");
  if (!period) { host.appendChild(el("div", { class: "empty", text: "Sem estatísticas para esta partida." })); return; }
  const box = el("div", { class: "ooyl-compare" },
    el("div", { class: "ooyl-compare__legend" },
      el("span", { class: "tname" }, el("i", { class: "swatch", style: "background:var(--home)" }), crest(m.home), el("span", { text: m.home.name })),
      el("span", { class: "tname" }, el("span", { text: m.away.name }), crest(m.away), el("i", { class: "swatch", style: "background:var(--away)" }))));
  // A side SofaScore did not track still comes as 0,0 km and 0 sprints (analysis/teams.team_distance): it
  // reads "sem medição", and those two rows compare nothing.
  const km = period.groups.flatMap((g) => g.items).find((i) => i.key === "kilometersCovered");
  const untracked = { home: !!km && !Number(km.homeValue), away: !!km && !Number(km.awayValue) };
  period.groups.forEach((group) => {
    box.appendChild(el("h3", { class: "ooyl-compare__group", text: GROUP_NAMES[group.name] || group.name }));
    group.items.forEach((item) => {
      const hv = Number(item.homeValue) || 0, av = Number(item.awayValue) || 0;
      const blind = ["kilometersCovered", "numberOfSprints"].includes(item.key) && (untracked.home || untracked.away);
      const total = blind ? 0 : Math.abs(hv) + Math.abs(av);
      const lead = blind || hv === av ? "" : (LOWER_IS_BETTER.has(item.name) ? hv < av : hv > av) ? "home" : "away";
      const hs = total ? (Math.abs(hv) / total) * 100 : 0, as = total ? (Math.abs(av) / total) * 100 : 0;
      const shown = (side) => blind && untracked[side] ? "sem medição" : decimalComma(item[side]);
      box.appendChild(el("div", { class: "ooyl-compare__row" },
        el("span", { class: "ooyl-compare__v is-home" + (lead === "home" ? " is-lead" : ""), text: shown("home") }),
        el("span", { class: "ooyl-compare__name", text: STAT_NAMES[item.name] || item.name }),
        el("span", { class: "ooyl-compare__v is-away" + (lead === "away" ? " is-lead" : ""), text: shown("away") }),
        el("div", { class: "ooyl-compare__bars", "aria-hidden": "true" },
          el("span", { class: "ooyl-compare__half is-home" }, el("i", { class: lead !== "away" ? "is-lead" : null, style: `width:${hs}%` })),
          el("span", { class: "ooyl-compare__half is-away" }, el("i", { class: lead !== "home" ? "is-lead" : null, style: `width:${as}%` })))));
    });
  });
  host.appendChild(box);
}

// What the match left on a player: a ringed dot per goal and the card as marks; own goals,
// assists and substitution minutes as words.
function marksText(marks) {
  const bits = [];
  if (marks.own) bits.push(tx("gol contra"));
  if (marks.assists) bits.push((marks.assists > 1 ? marks.assists + " " : "") + tx("assist."));
  if (marks.off) bits.push(tx("sai {min}'", { min: marks.off }));
  if (marks.on) bits.push(tx("entra {min}'", { min: marks.on }));
  return bits.join(" · ");
}

function playerNode(p) {
  const marks = p.marks || {};
  const goals = Array.from({ length: marks.goals || 0 }, () => el("i", { class: "ooyl-goalmark", title: "gol" }));
  const words = marksText(marks);
  const node = el("div", { class: "ooyl-player", tabindex: "0" },
    playerDisc(p),
    el("span", { class: "ooyl-player__name", text: p.name || "" }),
    el("span", { class: "ooyl-player__meta" }, rateChip((p.stats || {}).rating), goals, marks.card ? cardMark(marks.card) : null),
    words ? el("span", { class: "ooyl-player__marks", text: words }) : null);
  const show = (ev) => {
    const s = p.stats || {};
    const rows = [el("div", { class: "l", text: `${p.name} - ${p.position || ""} ${p.shirt ? "#" + p.shirt : ""}` })];
    if (s.rating !== undefined) rows.push(tipLine("nota", fmt(s.rating, 1)));
    if (s.minutesPlayed !== undefined) rows.push(el("div", { class: "l", text: tx("{n} minutos", { n: s.minutesPlayed }) }));
    if (s.totalShots !== undefined) rows.push(el("div", { class: "l", text: tx("{n} finalizações", { n: s.totalShots }) }));
    if (s.accuratePass !== undefined && s.totalPass !== undefined) rows.push(el("div", { class: "l", text: tx("passes {certos}/{total}", { certos: s.accuratePass, total: s.totalPass }) }));
    if (s.touches !== undefined) rows.push(el("div", { class: "l", text: tx("{n} toques", { n: s.touches }) }));
    if (s.kilometersCovered !== undefined) rows.push(el("div", { class: "l", text: tx("{km} km percorridos", { km: fmt(s.kilometersCovered, 1) }) }));
    const box = node.getBoundingClientRect();
    showTip(ev.clientX ?? box.left, ev.clientY ?? box.bottom, rows);
  };
  node.addEventListener("pointermove", show);
  node.addEventListener("focus", show);
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("blur", hideTip);
  return node;
}

// One side's eleven on the pitch, attacking up; `which` rings the players and edges the pitch
// in the home or away color.
function sideColumn(side, team, which) {
  const col = el("div", { class: "ooyl-lineup" },
    el("div", { class: "ooyl-lineup__head" },
      el("span", { class: "tname" }, crest(team), el("span", { text: team.name })),
      el("span", { class: "ooyl-lineup__formation", text: side.formation || "formação não informada" })));
  const pitch = el("div", { class: "ooyl-pitch", style: `--side: var(--${which})` }, turf());
  formationRows(side.formation, side.starters || []).forEach((row) => {
    if (!row.length) return;
    pitch.appendChild(el("div", { class: "ooyl-pitch__row" }, row.map(playerNode)));
  });
  col.appendChild(pitch);
  // Bench and absences share one box, so every side has exactly three rows to line up.
  const rest = el("div");
  if ((side.bench || []).length) {
    rest.appendChild(el("div", { class: "group-name", text: "Banco" }));
    rest.appendChild(el("div", { class: "bench" }, side.bench.map(playerNode)));
  }
  if ((side.missing || []).length) {
    rest.appendChild(el("div", { class: "group-name", text: "Desfalques" }));
    rest.appendChild(el("p", { class: "ooyl-sub", text: side.missing.map((x) => x.name).filter(Boolean).join(", ") }));
  }
  col.appendChild(rest);
  return col;
}

function renderLineups(host, m) {
  const lu = m.lineups || {};
  if (!lu.home || !(lu.home.starters || []).length) { host.appendChild(el("div", { class: "empty", text: "Sem escalações para esta partida." })); return; }
  host.appendChild(el("p", { class: "ooyl-sub", style: "margin-bottom:var(--space-4)",
    text: "Nota do SofaScore no chip colorido. Passe o cursor ou use Tab para ver os números de cada jogador." }));
  host.appendChild(el("div", { class: "ooyl-lineups" },
    sideColumn(lu.home, m.home, "home"),
    sideColumn(lu.away, m.away, "away")));
}

// Gols: each goal of the match with the play that led to it (the match's `goals`), on a whole pitch that always
// attacks to the right. Across the pitch it follows the shotmap, turned a quarter: the same touchline on the same side.
const STEP_LABEL = { pass: "passe", cross: "cruzamento", "ball-movement": "condução", goal: "finalização", "throw-in": "lateral",
  save: "defesa", "ball-touch": "toque", miss: "finalização para fora", post: "trave", interception: "interceptação",
  tackle: "desarme", clearance: "corte", block: "bloqueio", "penalty-save": "pênalti defendido" };
const FIELD = { W: 1050, H: 680 };  // a 105 x 68 m pitch, ten units a metre
function playSvg(goal) {
  const { W, H } = FIELD, at = ([x, y]) => [x * W / 100, (100 - y) * H / 100];
  const svg = el("svg", { class: "ooyl-shotmap__pitch", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Jogada do gol" });
  svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, rx: 10, style: "fill:var(--pitch)" }));
  const box = (a) => el("rect", Object.assign({ class: "ooyl-shot-line" }, a));
  svg.appendChild(box({ x: 2, y: 2, width: W - 4, height: H - 4, rx: 8 }));
  svg.appendChild(el("line", { class: "ooyl-shot-line", x1: W / 2, x2: W / 2, y1: 2, y2: H - 2 }));
  svg.appendChild(el("circle", { class: "ooyl-shot-line", cx: W / 2, cy: H / 2, r: 91.5 }));
  [0, 1].forEach((right) => {
    svg.appendChild(box({ x: right ? W - 167 : 2, y: (H - 403.2) / 2, width: 165, height: 403.2 }));
    svg.appendChild(box({ x: right ? W - 57 : 2, y: (H - 183.2) / 2, width: 55, height: 183.2 }));
    svg.appendChild(el("circle", { cx: right ? W - 110 : 110, cy: H / 2, r: 4, style: "fill:var(--pitch-line)" }));
  });
  svg.appendChild(el("line", { x1: W - 3, x2: W - 3, y1: H / 2 - 36.6, y2: H / 2 + 36.6, "stroke-width": 6, style: "stroke:var(--ink-muted)" }));
  goal.steps.forEach((step, i) => {  // a carry says only where it started: it ends where the next touch begins
    const next = goal.steps[i + 1], end = step.to || (next && next.from);
    if (!end) return;
    const [x1, y1] = at(step.from), [x2, y2] = at(end), shot = step.type === "goal", ink = css(step.isHome ? "--home" : "--away");
    const stroke = { stroke: ink, "stroke-width": shot ? 9 : 5, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" };
    if (step.type === "ball-movement") stroke["stroke-dasharray"] = "2 15";
    svg.appendChild(el("line", Object.assign({ x1, y1, x2, y2 }, stroke)));
    if (Math.hypot(x2 - x1, y2 - y1) < 40) return;
    const angle = Math.atan2(y2 - y1, x2 - x1), size = shot ? 28 : 19;
    const wing = (turn) => `${x2 - size * Math.cos(angle + turn)} ${y2 - size * Math.sin(angle + turn)}`;
    delete stroke["stroke-dasharray"];
    svg.appendChild(el("path", Object.assign({ d: `M ${wing(0.45)} L ${x2} ${y2} L ${wing(-0.45)}` }, stroke)));
  });
  goal.steps.forEach((step, i) => {  // the numbered spots last, over the lines
    const [x, y] = at(step.from), ink = css(step.isHome ? "--home" : "--away");
    svg.appendChild(el("circle", { cx: x, cy: y, r: 21, fill: css("--pitch"), stroke: ink, "stroke-width": 4 }));
    svg.appendChild(el("text", { x, y: y + 9, "text-anchor": "middle", "font-size": 25, "font-weight": 700, fill: ink }, String(i + 1)));
  });
  return svg;
}

function renderGoals(host, m) {
  const goals = m.goals || [];
  if (!goals.length) { host.appendChild(el("div", { class: "empty", text: "Partida sem gols." })); return; }
  host.appendChild(el("p", { class: "ooyl-sub", text: "Cada gol com a jogada que o originou: passes e cruzamentos em linha cheia, condução pontilhada e a finalização em linha grossa. O campo está sempre virado para o ataque ir para a direita, e os números seguem a ordem dos toques." }));
  goals.forEach((g) => {
    const minute = g.time == null ? "" : g.time + (g.added ? "+" + g.added : "") + "'";
    const words = [SITUATION[g.situation], BODY[g.body]].filter(Boolean).map((w) => tx(w));
    if (g.xg != null) words.push("xG " + fmt(g.xg, 2));
    host.appendChild(el("div", { class: "round-name" }, el("span", { text: `${minute} · ${g.homeScore ?? "?"}–${g.awayScore ?? "?"}` })));
    host.appendChild(el("p", { style: "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 var(--space-2)" },
      crest(g.isHome ? m.home : m.away), el("b", {}, el("span", { text: g.player || "Gol" })),
      g.class === "ownGoal" ? el("span", { class: "ooyl-tag", text: "Gol contra" })
        : g.class === "penalty" ? el("span", { class: "ooyl-tag ooyl-tag--accent", text: "Pênalti" }) : null,
      g.assist ? el("span", { class: "ooyl-tl__meta", text: tx("assist. {nome}", { nome: g.assist }) }) : null,
      words.length ? el("span", { class: "ooyl-tl__meta" }, el("span", { text: words.join(", ") })) : null));
    if (!g.steps.length) { host.appendChild(el("div", { class: "empty", text: "Os dados não trazem a jogada deste gol." })); return; }
    host.appendChild(el("div", { style: "max-width:760px" }, playSvg(g)));
    const passes = g.steps.filter((s) => s.type === "pass" || s.type === "cross" || s.type === "throw-in").length;
    const touches = g.steps.map((s, i) => `${i + 1} ${s.player || "?"} (${tx(STEP_LABEL[s.type] || s.type)})`).join(" · ");
    host.appendChild(el("p", { class: "ooyl-sub" }, el("span", {
      text: tx("{passes} antes da finalização.", { passes: `${fmt(passes)} ${tx(passes === 1 ? "passe" : "passes")}` }) + " " + touches })));
  });
}

function renderShotmap(host, m) {
  const all = m.shotmap || [];
  if (!all.length) { host.appendChild(el("div", { class: "empty", text: "Sem shotmap para esta partida." })); return; }
  const wrap = el("div", { class: "ooyl-shotmap" });
  const left = el("div", {});
  const filter = el("div", { class: "ooyl-tabs ooyl-tabs--segmented", role: "tablist", "aria-label": "Filtrar finalizações" });
  [["todos", "Todas"], ["goal", "Só gols"], ["target", "No alvo"]].forEach(([key, label]) => {
    filter.appendChild(el("button", {
      class: "ooyl-tab", role: "tab", "aria-selected": String(local.shotFilter === key),
      onclick: () => { local.shotFilter = key; renderMatchBody(); },
    }, label));
  });
  left.appendChild(filter);

  const shots = all.filter((s) => local.shotFilter === "todos" ? true
    : local.shotFilter === "goal" ? s.type === "goal" : ["goal", "save"].includes(s.type));
  // Profundidade fixada pela partida inteira, para o campo nao mudar de tamanho ao filtrar.
  const deepest = Math.max(0, ...all.map((s) => s.x || 0));
  const svg = pitchSvg(Math.min(68, Math.max(40, Math.ceil(deepest) + 4)));
  const marks = [];
  shots.forEach((s) => {
    if (s.x === null || s.x === undefined) return;
    const cx = s.y * PITCH.uy, cy = s.x * PITCH.ux;
    const color = s.isHome ? css("--home") : css("--away");
    const r = 7 + Math.sqrt(Math.max(0, s.xg || 0)) * 26;
    const filled = s.type === "goal" || s.type === "save";
    const node = el("circle", {
      cx, cy, r, fill: filled ? color : css("--pitch"),
      stroke: s.type === "goal" ? css("--pitch") : color,
      "stroke-width": s.type === "goal" ? 3 : 2.5,
    });
    svg.appendChild(node);
    if (s.type === "goal") svg.appendChild(el("circle", { cx, cy, r: r + 4, fill: "none", stroke: color, "stroke-width": 2 }));
    if (s.type === "block") svg.appendChild(el("circle", { cx, cy, r: 2.5, fill: color }));
    marks.push({ s, cx, cy, node, color });
  });

  let active = null;
  svg.addEventListener("pointermove", (ev) => {
    const box = svg.getBoundingClientRect();
    const mx = (ev.clientX - box.left) * (PITCH.W / box.width);
    const my = (ev.clientY - box.top) * (svg.viewBox.baseVal.height / box.height);
    let best = null, bd = Infinity;
    marks.forEach((mk) => {
      const d = Math.hypot(mk.cx - mx, mk.cy - my);
      if (d < bd) { bd = d; best = mk; }
    });
    if (!best || bd > 70) { if (active) { active.node.setAttribute("opacity", 1); active = null; } hideTip(); return; }
    if (active && active !== best) active.node.setAttribute("opacity", 1);
    active = best; best.node.setAttribute("opacity", 0.72);
    const s = best.s;
    showTip(ev.clientX, ev.clientY, [
      el("div", { class: "l" }, teamName(s.isHome ? m.home : m.away), " - " + (s.time ?? "?") + "'"),
      el("div", { class: "row" }, el("span", { class: "stroke", style: `background:${best.color}` }), el("span", { class: "v", text: s.player || "" })),
      tipLine("xG", fmt(s.xg ?? 0, 2)),
      el("div", { class: "l", text: `${tx(SHOT_LABEL[s.type] || s.type)}, ${tx(SITUATION[s.situation] || s.situation || "")}, ${tx(BODY[s.body] || s.body || "")}` }),
    ]);
  });
  svg.addEventListener("pointerleave", () => { if (active) { active.node.setAttribute("opacity", 1); active = null; } hideTip(); });
  left.appendChild(svg);
  left.appendChild(el("p", { class: "ooyl-shotmap__note", text: "Gol adversário no topo. O tamanho do círculo cresce com o xG da finalização." }));

  const side = el("div", { class: "ooyl-shotmap__side" });
  side.appendChild(el("div", { class: "ooyl-shotmap__legend" },
    el("span", {}, el("i", { class: "swatch", style: "background:var(--home)" }), teamName(m.home)),
    el("span", {}, el("i", { class: "swatch", style: "background:var(--away)" }), teamName(m.away)),
    el("span", {}, legendMark("goal"), el("span", { text: "Gol" })),
    el("span", {}, legendMark("save"), el("span", { text: "Defendido" })),
    el("span", {}, legendMark("miss"), el("span", { text: "Para fora" })),
    el("span", {}, legendMark("block"), el("span", { text: "Bloqueado" }))));

  const rows = [["Finalizações", all.filter((s) => s.isHome).length, all.filter((s) => !s.isHome).length],
    ["No alvo", all.filter((s) => s.isHome && ["goal", "save"].includes(s.type)).length, all.filter((s) => !s.isHome && ["goal", "save"].includes(s.type)).length],
    ["Gols", all.filter((s) => s.isHome && s.type === "goal").length, all.filter((s) => !s.isHome && s.type === "goal").length],
    ["xG", fmt(all.filter((s) => s.isHome).reduce((a, s) => a + (s.xg || 0), 0), 2), fmt(all.filter((s) => !s.isHome).reduce((a, s) => a + (s.xg || 0), 0), 2)]];
  const table = el("table");
  table.appendChild(el("thead", {}, el("tr", {}, el("th", { class: "left", text: "" }),
    el("th", {}, teamName({ name: m.home.code || "Casa", logo: m.home.logo })),
    el("th", {}, teamName({ name: m.away.code || "Fora", logo: m.away.logo })))));
  table.appendChild(el("tbody", {}, rows.map((r) => el("tr", {},
    el("td", { class: "left", text: r[0] }), el("td", { text: String(r[1]) }), el("td", { text: String(r[2]) })))));
  side.appendChild(table);

  wrap.appendChild(left); wrap.appendChild(side);
  host.appendChild(wrap);
}

$("match-tabs").addEventListener("click", (ev) => {
  const btn = ev.target.closest('[role="tab"]');
  if (btn && local.match) go(`#/partida/${local.match.id}/${btn.dataset.mtab}`);
});
$("back").addEventListener("click", () => go("#/partidas"));

on("theme", () => { if (state.view === "partida" && local.match) { renderMatchHead(); renderMatchBody(); } });
