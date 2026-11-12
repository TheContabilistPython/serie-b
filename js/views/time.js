// A team's page: the hero, then three sections under line tabs, each with its own route
// #/time/{id}/{aba}: the elevens and the squad, the season's shotmap, the distance covered.
// Filters inside a tab redraw only that tab.
import { $, el, clear, fmt, css, counted } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView } from "../core/router.js";
import { showTip, hideTip, tipLine } from "../core/tooltip.js";
import { barList, lineChart } from "../core/charts.js";
import { cardBox, crest, face, playerDisc, rateChip, teamName, tiles, turf } from "../core/ui.js";
import { PLAYER_TITLES, POS_CODE, playerById, playerTable } from "../core/players.js";
import { BODY, PITCH, SHOT_LABEL, SITUATION, formationRows, legendMark, pitchSvg } from "../core/pitch.js";
import { getJSON } from "../core/api.js";
import { ord, tx, txn } from "../core/i18n.js";

const TTABS = ["escalacoes", "shotmap", "distancia"];
const TTAB_NAMES = { escalacoes: "Escalações", shotmap: "Shotmap", distancia: "Distância percorrida" };
const local = { team: null, tab: "escalacoes", mode: "frequent", shots: { match: "", filter: "todos" } };

export async function open(id, tab) {
  local.tab = TTABS.includes(tab) ? tab : "escalacoes";
  if (local.team && local.team.team.id === id) { setView("time"); renderTeam(); return; }
  setView("time");
  local.shots.match = "";  // a match of the previous team means nothing here
  clear($("team-body")).appendChild(el("div", { class: "empty", text: "Carregando time..." }));
  try {
    local.team = await getJSON("/api/team/" + id);
    renderTeam();
  } catch (err) {
    clear($("team-body")).appendChild(el("div", { class: "empty err", text: tx("Falha ao ler o time: {erro}", { erro: err.message }) }));
  }
}

// Rating and starts sit under the name so each row of the pitch stays short.
function teamPlayerNode(p) {
  const starts = tx(p.starts === 1 ? "{n} vez titular" : "{n} vezes titular", { n: p.starts });
  return el("div", { class: "ooyl-player" },
    playerDisc(p),
    el("button", { class: "ooyl-player__name", text: p.name || "", title: "abrir a temporada do jogador", onclick: () => go("#/jogador/" + p.id) }),
    el("span", { class: "ooyl-player__meta" }, rateChip(p.avg)),
    el("span", { class: "ooyl-player__marks", text: p.avg != null ? starts : tx("sem nota · {titular}", { titular: starts }) }));
}

function renderTeam() {
  const t = local.team;
  const host = clear($("team-body"));
  const row = state.index.table.find((r) => r.team.id === t.team.id);
  host.appendChild(el("header", { class: "page-hero" },
    el("span", { class: "page-hero__media" }, crest(t.team, "xl")),
    el("div", {},
      el("h1", { text: t.team.name }),
      el("p", { class: "ooyl-sub", text: row
        ? tx("{lugar} · {pontos} · {jogos} ({v}V {e}E {d}D) · formações: {lista}", { lugar: ord(row.pos),
          pontos: counted(row.pts, "ponto", "pontos"), jogos: counted(row.j, "jogo", "jogos"), v: row.v, e: row.e, d: row.d,
          lista: t.formations.map((f) => `${f.formation} (${f.count})`).join(", ") })
        : counted(t.matches, "jogo", "jogos") }))));
  host.appendChild(el("div", { class: "ooyl-tabs ooyl-tabs--line", role: "tablist", "aria-label": "Seções do time" },
    TTABS.map((key) => el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(local.tab === key),
      onclick: () => go(`#/time/${t.team.id}/${key}`) }, TTAB_NAMES[key]))));
  host.appendChild(el("div", { class: "view", id: "team-tab" }));
  renderTeamTab();
}

function renderTeamTab() {
  const t = local.team, host = clear($("team-tab"));
  if (local.tab === "shotmap") return renderTeamShots(host, t);
  if (local.tab === "distancia") return renderTeamDistance(host, t);
  renderTeamLineups(host, t);
}

function renderTeamLineups(host, t) {
  const card = el("section", { class: "ooyl-card" },
    el("div", { class: "ooyl-tabs ooyl-tabs--line", role: "tablist", "aria-label": "Escalação" },
      el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(local.mode === "frequent"),
        onclick: () => { local.mode = "frequent"; renderTeamTab(); } }, "Escalação mais usada"),
      el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(local.mode === "recent"),
        onclick: () => { local.mode = "recent"; renderTeamTab(); } }, "Mais recente")));
  const xi = local.mode === "frequent" ? t.frequent : t.recent;
  if (!xi || !xi.starters.length) {
    card.appendChild(el("div", { class: "empty", text: "Sem escalação completa registrada." }));
  } else {
    const sub = local.mode === "frequent"
      ? [tx("Formação {formacao}, usada em {n} de {total} jogos. Em cada posição, quem mais vezes começou nela. O chip é a nota média do jogador na temporada.",
        { formacao: xi.formation, n: xi.count, total: xi.of })]
      : txn(xi.home ? "Rodada {rodada}, {placar} contra {adversario}, formação {formacao}. O chip é a nota média do jogador na temporada."
        : "Rodada {rodada}, fora, {placar} contra {adversario}, formação {formacao}. O chip é a nota média do jogador na temporada.",
        { rodada: xi.round, placar: `${xi.gf}-${xi.ga}`, adversario: teamName(xi.opponent), formacao: xi.formation || "?" });
    card.appendChild(el("p", { class: "ooyl-sub", style: "margin:0 0 var(--space-4)" }, sub));
    const pitch = el("div", { class: "ooyl-pitch team-pitch" }, turf());
    formationRows(xi.formation, xi.starters).forEach((r) => { if (r.length) pitch.appendChild(el("div", { class: "ooyl-pitch__row" }, r.map(teamPlayerNode))); });
    card.appendChild(pitch);
    if (local.mode === "recent") {
      card.appendChild(el("p", { style: "margin:var(--space-4) 0 0" },
        el("button", { class: "ooyl-btn", onclick: () => go("#/partida/" + xi.match) }, "Abrir a partida")));
    }
  }
  host.appendChild(card);
  const squad = state.index.players.filter((p) => p.team === t.team.short);
  const table = el("table");
  host.appendChild(cardBox("Elenco por nota média", "Todos com nota na temporada por este time. Clique para abrir o jogador.",
    el("div", { class: "scroll" }, table)));
  playerTable(table, squad, 40);
}

// ---- shotmap da temporada ------------------------------------------------------
// As finalizações do time na temporada inteira ou num jogo só, com um filtro por desfecho e um de
// xG alto. Um lado só, então nada de cores de casa e fora: as marcas são data-dot e os gols accent.
// O campo é cortado na finalização mais distante do recorte (a temporada ou o jogo) e não muda de
// tamanho ao trocar de filtro. Gols contra ficam fora: o SofaScore lista o gol contra no lado que ele
// favoreceu, mas ninguém daquele time finalizou. Uma nota ao lado da tabela os conta.
const HIGH_XG = 0.3;
const ON_TARGET = new Set(["goal", "save", "blocked-off-line"]);  // o "no alvo" do SofaScore
const SHOT_FILTERS = [
  { key: "todos", label: "Todas", hint: "Todas as finalizações", test: () => true },
  { key: "goal", label: "Gols", hint: "Finalizações que viraram gol", test: (s) => s.type === "goal" },
  { key: "save", label: "Defendidas", hint: "Finalizações defendidas pelo goleiro", test: (s) => s.type === "save" },
  { key: "miss", label: "Para fora", hint: "Finalizações para fora, inclusive as que bateram na trave",
    test: (s) => s.type === "miss" || s.type === "post" },
  { key: "block", label: "Bloqueadas", hint: "Finalizações bloqueadas, inclusive as tiradas em cima da linha",
    test: (s) => s.type === "block" || s.type === "blocked-off-line" },
  { key: "xg", label: "xG alto", hint: "Finalizações com xG de {xg} ou mais: as chances mais claras",
    test: (s) => (s.xg || 0) >= HIGH_XG },
];
const minuteOf = (s) => s.time == null ? "" : s.time + (s.added ? "+" + s.added : "") + "'";
const shotWords = (s) => [SHOT_LABEL[s.type] || s.type, SITUATION[s.situation] || s.situation, BODY[s.body] || s.body]
  .filter(Boolean).map((w) => tx(w)).join(", ");
const gameLabel = (g) => tx("Rodada {rodada} · {adversario} ({lado}) {placar}",
  { rodada: g.round ?? "?", adversario: g.opponent.name, lado: tx(g.home ? "casa" : "fora"), placar: `${g.gf}–${g.ga}` });

function renderTeamShots(host, t) {
  const opt = local.shots;
  // A match imported without a shotmap has no shot on either side: it stays out of the count and of the picker.
  const drawn = new Set(t.shots.map((s) => s.match));
  const mapped = t.games.filter((g) => drawn.has(g.match) || g.against.shots > 0);
  const games = new Map(mapped.map((g) => [g.match, g]));
  const game = (opt.match && games.get(Number(opt.match))) || null;
  if (!game) opt.match = "";
  const filter = SHOT_FILTERS.find((f) => f.key === opt.filter) || SHOT_FILTERS[0];
  const scoped = game ? t.shots.filter((s) => s.match === game.match) : t.shots;
  const shown = scoped.filter(filter.test);
  const scope = game ? [game] : t.games;
  const total = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);
  const mine = { shots: scoped.length, onTarget: scoped.filter((s) => ON_TARGET.has(s.type)).length,
                 goals: scoped.filter((s) => s.type === "goal").length, xg: total(scoped, (s) => s.xg) };
  const theirs = { shots: total(scope, (g) => g.against.shots), onTarget: total(scope, (g) => g.against.onTarget),
                   goals: total(scope, (g) => g.against.goals), xg: total(scope, (g) => g.against.xg) };
  const colors = { ink: css("--data-dot"), accent: css("--accent"), pitch: css("--pitch") };

  const pick = el("select", { "aria-label": "Jogo", onchange: (ev) => { opt.match = ev.target.value; renderTeamTab(); } },
    el("option", { value: "", text: "Temporada inteira" }),
    mapped.slice().reverse().map((g) => el("option", { value: String(g.match), text: gameLabel(g) })));
  pick.value = opt.match;
  const sub = game
    ? txn("Rodada {rodada}, {lado}: {placar} contra {adversario}. xG {nosso} a {deles}.", { rodada: game.round ?? "?",
      lado: tx(game.home ? "em casa" : "fora"), placar: `${game.gf}–${game.ga}`, adversario: teamName(game.opponent),
      nosso: fmt(mine.xg, 2), deles: fmt(theirs.xg, 2) })
    : tx("{finalizacoes} em {jogos}, {xg} de xG. Escolha um jogo para ver só as dele.", { finalizacoes: counted(mine.shots, "finalização", "finalizações"),
      jogos: counted(mapped.length, "jogo", "jogos"), xg: fmt(mine.xg, 1) })
      + (mapped.length < t.games.length ? tx(" Sem shotmap: {jogos}.", { jogos: counted(t.games.length - mapped.length, "jogo", "jogos") }) : "");
  const card = el("section", { class: "ooyl-card team-shots" },
    el("header", { class: "ooyl-card__head" },
      el("div", { class: "ooyl-card__titles" }, el("h2", { class: "ooyl-headline", text: "Shotmap" }), el("p", { class: "ooyl-sub" }, sub)),
      el("div", { class: "ooyl-card__actions" }, pick)));

  const strip = el("div", { class: "ooyl-tabs ooyl-tabs--segmented shot-filter", role: "tablist", "aria-label": "Filtrar finalizações" },
    SHOT_FILTERS.map((f) => el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(f === filter), title: tx(f.hint, { xg: fmt(HIGH_XG, 2) }),
      onclick: () => { opt.filter = f.key; renderTeamTab(); } }, f.label, el("span", { class: "n", text: fmt(scoped.filter(f.test).length) }))));

  // The pitch is cut at the deepest shot of the season or of the game, filter aside, so a filter never
  // resizes it. A single game gets the match view's mark sizes; a season of shots, smaller ones.
  // Goals go on top, then saves, the bigger chances under the smaller.
  const depth = Math.min(100, Math.max(40, Math.ceil(Math.max(0, ...scoped.map((s) => s.x || 0))) + 4));
  const svg = pitchSvg(depth);
  svg.setAttribute("aria-label", tx("Mapa de finalizações: {time}", { time: t.team.name }));
  const layer = { goal: 3, save: 2 };
  const marks = shown.filter((s) => s.x != null && s.y != null)
    .sort((a, b) => (layer[a.type] || 1) - (layer[b.type] || 1) || (b.xg || 0) - (a.xg || 0))
    .map((s) => teamShotMark(svg, s, !!game, colors));
  let active = null;
  const release = () => {
    if (active) active.g.classList.remove("is-active");
    active = null;
    svg.classList.remove("is-hovering");
    hideTip();
  };
  const hover = (ev) => {
    const box = svg.getBoundingClientRect();
    const mx = (ev.clientX - box.left) * (PITCH.W / box.width), my = (ev.clientY - box.top) * (depth * PITCH.ux / box.height);
    let best = null, bd = Infinity;
    marks.forEach((mk) => { const d = Math.hypot(mk.cx - mx, mk.cy - my); if (d < bd) { bd = d; best = mk; } });
    if (!best || bd > best.r + 14) { release(); return; }
    if (active !== best) {
      if (active) active.g.classList.remove("is-active");
      active = best;
      best.g.classList.add("is-active");
      svg.classList.add("is-hovering");
    }
    const s = best.s, g = games.get(s.match);
    showTip(ev.clientX, ev.clientY, [
      g ? el("div", { class: "l" }, txn("Rodada {rodada} · {lado}, contra {adversario}", { rodada: g.round ?? "?", lado: tx(g.home ? "casa" : "fora"),
        adversario: teamName(g.opponent) })) : null,
      el("div", { class: "row" }, el("span", { class: "stroke", style: `background:${s.type === "goal" ? colors.accent : colors.ink}` }),
        el("span", { class: "v", text: s.player || "" }), el("span", { class: "l", text: minuteOf(s) })),
      tipLine("xG", fmt(s.xg, 2)),  // a few shots come without xG: "-"
      el("div", { class: "l", text: shotWords(s) }),
    ].filter(Boolean));
  };
  svg.addEventListener("pointermove", hover);
  svg.addEventListener("pointerdown", hover);  // a tap on a phone, where there is no hover
  svg.addEventListener("pointerleave", release);
  const left = el("div", {}, strip, svg, el("p", { class: "ooyl-shotmap__note", text: shown.length
    ? "Gol adversário no topo. O tamanho do círculo cresce com o xG da finalização."
    : tx(game ? "Nenhuma finalização com esse filtro neste jogo." : "Nenhuma finalização com esse filtro.") }));

  const side = el("div", { class: "ooyl-shotmap__side" },
    el("div", { class: "ooyl-shotmap__legend" },
      el("span", {}, legendMark("goal", colors.accent), el("span", { text: "Gol" })),
      el("span", {}, legendMark("save", colors.ink), el("span", { text: "Defendido" })),
      el("span", {}, legendMark("miss", colors.ink), el("span", { text: "Para fora ou na trave" })),
      el("span", {}, legendMark("block", colors.ink), el("span", { text: "Bloqueado" }))));
  // The whole scope, whatever the filter: the team against its opponents, as in the match view.
  const digits = game ? 2 : 1, perShot = (x) => x.shots ? fmt(x.xg / x.shots, 2) : "-";
  side.appendChild(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { class: "left" }),
      el("th", {}, teamName({ name: t.team.code || t.team.short, logo: t.team.logo })),
      el("th", { title: game ? game.opponent.name : "Adversários, somados" },
        game ? teamName({ name: game.opponent.code || game.opponent.short, logo: game.opponent.logo }) : "Adv."))),
    el("tbody", {}, [["Finalizações", fmt(mine.shots), fmt(theirs.shots)], ["No alvo", fmt(mine.onTarget), fmt(theirs.onTarget)],
      ["Gols", fmt(mine.goals), fmt(theirs.goals)], ["xG", fmt(mine.xg, digits), fmt(theirs.xg, digits)],
      ["xG por finalização", perShot(mine), perShot(theirs)]].map((r) => el("tr", {},
        el("td", { class: "left", text: r[0] }), el("td", { text: r[1] }), el("td", { text: r[2] }))))));
  const ownFor = total(scope, (g) => g.ownFor), ownAgainst = total(scope, (g) => g.ownAgainst);
  if (ownFor || ownAgainst) {
    side.appendChild(el("p", { class: "ooyl-sub", text: tx("Gols contra não entram no mapa nem na tabela: {lista}.", { lista: [
      ownFor ? tx("{n} a favor do time", { n: fmt(ownFor) }) : null,
      ownAgainst ? tx(game ? "{n} a favor do adversário" : "{n} a favor dos adversários", { n: fmt(ownAgainst) }) : null,
    ].filter(Boolean).join(` ${tx("e")} `) }) }));
  }
  if (game) side.appendChild(el("button", { class: "ooyl-btn ooyl-btn--sm", onclick: () => go(`#/partida/${game.match}/shotmap`) },
    "Abrir a partida"));
  card.appendChild(el("div", { class: "ooyl-shotmap" }, left, side));
  host.appendChild(card);

  // The biggest chances among the shots on the map: the first ten open, the rest behind a disclosure.
  const ranked = shown.slice().sort((a, b) => (b.xg || 0) - (a.xg || 0));
  const top = el("table"), rest = el("table");
  chanceTable(top, ranked.slice(0, 10), 0, games, !game);
  if (ranked.length > 10) chanceTable(rest, ranked.slice(10), 10, games, !game);
  host.appendChild(cardBox("Maiores chances",
    ranked.length ? tx(ranked.length === 1 ? "A finalização do mapa. Clique numa linha para abrir a partida."
      : "As {n} finalizações do mapa, da maior para a menor em xG. Clique numa linha para abrir a partida.", { n: fmt(ranked.length) }) : "",
    ranked.length ? el("div", { class: "scroll" }, top) : el("div", { class: "empty", text: "Nenhuma finalização com esse filtro." }),
    ranked.length > 10 ? el("details", {}, el("summary", { text: tx("Ver as outras {n}", { n: fmt(ranked.length - 10) }) }),
      el("div", { class: "scroll" }, rest)) : null));
}

// One shot of the team map: goal filled in accent with a ring, saved filled, off target hollow, blocked
// hollow with a dot, as in the match view. Filled marks sit at the scatter's 0.82, so overlaps read as density.
function teamShotMark(svg, s, big, colors) {
  const cx = s.y * PITCH.uy, cy = s.x * PITCH.ux;
  const size = Math.sqrt(Math.max(0, s.xg || 0));
  const r = big ? 7 + size * 26 : 3.5 + size * 17;
  const g = el("g", { class: "shot" });
  if (s.type === "goal") {
    g.appendChild(el("circle", { cx, cy, r, fill: colors.accent, stroke: colors.pitch, "stroke-width": big ? 3 : 1.5 }));
    g.appendChild(el("circle", { cx, cy, r: r + (big ? 4 : 2.5), fill: "none", stroke: colors.accent, "stroke-width": big ? 2 : 1.5 }));
  } else if (s.type === "save") {
    g.appendChild(el("circle", { cx, cy, r, fill: colors.ink, "fill-opacity": 0.82, stroke: colors.pitch, "stroke-width": big ? 2 : 1 }));
  } else {
    g.appendChild(el("circle", { cx, cy, r, fill: "none", stroke: colors.ink, "stroke-opacity": 0.82, "stroke-width": big ? 2.5 : 1.5 }));
    if (s.type === "block" || s.type === "blocked-off-line") g.appendChild(el("circle", { cx, cy, r: big ? 2.5 : 1.6, fill: colors.ink }));
  }
  svg.appendChild(g);
  return { s, g, cx, cy, r };
}

function chanceTable(node, list, offset, games, withGame) {
  const cols = [
    { head: "#", cls: "left pos", cell: (s, i) => String(offset + i + 1) },
    { head: "Jogador", cls: "left", cell: (s) => [face(playerById(s.playerId)), el("span", { text: s.player || "" })] },
    ...(withGame ? [
      { head: "Rod.", cls: "left", cell: (s) => String((games.get(s.match) || {}).round ?? "-") },
      { head: "Adversário", cls: "left", cell: (s) => { const g = games.get(s.match); return g ? [crest(g.opponent), el("span", { text: g.opponent.name })] : "-"; } },
    ] : []),
    { head: "Min", cls: "", cell: (s) => minuteOf(s) },
    { head: "Desfecho", cls: "left", cell: (s) => el("span", { class: "ooyl-tag" + (s.type === "goal" ? " ooyl-tag--accent" : ""), text: SHOT_LABEL[s.type] || s.type }) },
    { head: "Jogada", cls: "left muted", cell: (s) => [SITUATION[s.situation] || s.situation, BODY[s.body] || s.body].filter(Boolean).map((w) => tx(w)).join(", ") },
    { head: "xG", cls: "strong", cell: (s) => fmt(s.xg, 2) },
  ];
  node.appendChild(el("thead", {}, el("tr", {}, cols.map((c) => el("th", { class: c.cls.includes("left") ? "left" : "", text: c.head })))));
  node.appendChild(el("tbody", {}, list.map((s, i) => el("tr", { class: "row-link", title: "abrir a partida", onclick: () => go(`#/partida/${s.match}/shotmap`) },
    cols.map((c) => el("td", { class: c.cls }, c.cell(s, i)))))));
}

// ---- distância percorrida --------------------------------------------------------
// O total do time em cada partida é o "Distance covered" das estatísticas do SofaScore, e quem correu
// vem do kilometersCovered de cada jogador na escalação. Jogos sem esse número ficam fora das somas e
// das médias, e a página diz em quantos ele existe. A liga (média e posição) vem de index.distance.
function renderTeamDistance(host, t) {
  const measured = t.games.filter((g) => g.km != null);
  if (!measured.length) {
    host.appendChild(el("section", { class: "ooyl-card" }, el("div", { class: "empty",
      text: "As estatísticas das partidas deste time não trazem a distância percorrida." })));
    return;
  }
  const league = state.index.distance || null;
  const ranked = league ? league.teams.filter((r) => r.perGame != null) : [];
  const rank = ranked.findIndex((r) => r.team.id === t.team.id) + 1;
  const km = measured.reduce((a, g) => a + g.km, 0), per = km / measured.length;
  // The opponents' mean only where they were measured: SofaScore sends an untracked side as 0,0 km, which
  // the server turns into null (analysis/teams.team_distance). The gap is the two means, as in Estatísticas.
  const paired = measured.filter((g) => g.kmAgainst != null);
  const theirs = paired.length ? paired.reduce((a, g) => a + g.kmAgainst, 0) / paired.length : null;
  const gap = theirs == null ? null : per - theirs;
  const sprinted = t.games.filter((g) => g.sprints != null);
  const sprints = sprinted.length ? sprinted.reduce((a, g) => a + g.sprints, 0) / sprinted.length : null;
  const kpis = el("div", { class: "ooyl-tiles" });
  const unmeasured = t.games.length - measured.length;
  tiles(kpis, [
    ["Distância total", fmt(km, 0), unmeasured
      ? tx(unmeasured === 1 ? "km em {medidos} de {jogos}; um ficou sem a medição" : "km em {medidos} de {jogos}; {n} ficaram sem a medição",
        { medidos: fmt(measured.length), jogos: counted(t.games.length, "jogo", "jogos"), n: fmt(unmeasured) })
      : tx("km em {jogos}", { jogos: counted(measured.length, "jogo", "jogos") })],
    ["Por jogo", fmt(per, 1), league && league.avg != null ? tx("km; a média da liga é {media}", { media: fmt(league.avg, 1) }) : "km"],
    ["Na liga", rank ? ord(rank) : "–", rank ? tx("entre {n} times, pela média por jogo", { n: ranked.length }) : "sem a tabela da liga"],
    ["Adversários", fmt(theirs, 1), theirs == null ? "nenhum adversário medido"
      : tx(paired.length < measured.length ? "km por jogo, em {jogos}; o time correu {km} km {sentido}" : "km por jogo; o time correu {km} km {sentido}",
        { jogos: counted(paired.length, "jogo", "jogos"), km: fmt(Math.abs(gap), 1), sentido: tx(gap >= 0 ? "a mais" : "a menos") })],
    ["Sprints por jogo", sprints == null ? "–" : fmt(sprints, 0),
      league && league.sprintsAvg != null ? tx("a média da liga é {media}", { media: fmt(league.sprintsAvg, 0) }) : ""],
  ]);
  host.appendChild(kpis);

  const chart = el("div"), table = el("table");
  host.appendChild(cardBox("Distância por jogo", league && league.avg != null
    ? "Quilômetros percorridos pelo time em cada partida, somando todos os jogadores. A linha tracejada é a média da liga por time e por jogo."
    : "Quilômetros percorridos pelo time em cada partida, somando todos os jogadores.",
    chart, el("details", {}, el("summary", { text: "Ver dados em tabela" }), el("div", { class: "scroll" }, table))));
  distanceChart(chart, measured, league);
  distanceTable(table, t.games);

  const board = el("div"), full = el("table");
  host.appendChild(cardBox("Quem mais correu", "Distância somada de cada jogador nas partidas por este time. "
    + "Os quilômetros por 90 minutos aparecem só para quem jogou ao menos 90.",
    board, el("details", {}, el("summary", { text: "Ver dados em tabela" }), el("div", { class: "scroll" }, full))));
  const rated = (p) => !!playerById(p.id);  // only rated players have a season page
  barList(board, t.runners.slice(0, 10), {
    label: "Distância percorrida por jogador", value: (p) => p.km, text: (p) => fmt(p.km, 1) + " km",
    name: (p) => p.name || "", note: (p) => tx("{n}j", { n: p.games }), face: (p) => p.face, logo: () => t.team.logo,
    open: (p) => rated(p) ? "#/jogador/" + p.id : null,
    tip: (p) => [el("div", { class: "l", text: p.name || "" }), tipLine("km", fmt(p.km, 1), "var(--data-dot)"),
      el("div", { class: "l", text: tx("{jogos}, {minutos} minutos", { jogos: counted(p.games, "jogo", "jogos"), minutos: fmt(p.minutes) }) }),
      p.minutes >= 90 ? el("div", { class: "l", text: tx("{km} km por 90 minutos", { km: fmt((p.km / p.minutes) * 90, 2) }) }) : null,
      el("div", { class: "l", text: tx("{n} sprints · máxima de {v} km/h", { n: fmt(p.sprints), v: fmt(p.topSpeed, 1) }) })].filter(Boolean),
  });
  runnersTable(full, t.runners, rated);
}

// Km per round against the league mean. The axis fits the data in steps of 5 (10 for a wide spread).
function distanceChart(host, measured, league) {
  const pts = measured.filter((g) => g.round != null).sort((a, b) => a.round - b.round || a.timestamp - b.timestamp);
  const avg = league && league.avg != null ? league.avg : null;
  const vals = pts.map((g) => g.km).concat(avg == null ? [] : [avg]);
  const spread = Math.max(...vals) - Math.min(...vals), step = spread > 30 ? 10 : 5;
  const lo = Math.floor((Math.min(...vals) - 1) / step) * step, hi = Math.ceil((Math.max(...vals) + 1) / step) * step;
  const last = pts[pts.length - 1];
  lineChart(host, {
    label: "Distância percorrida por rodada", empty: "Sem distância registrada.", yMin: lo, yMax: hi, yStep: step,
    height: 260, dots: true, lastLabel: last ? fmt(last.km, 1) + " km" : null,
    reference: avg == null ? null : { value: avg, label: tx("média da liga {v}", { v: fmt(avg, 1) }) },
    points: pts.map((g) => ({ x: g.round, y: g.km, tip: () => [
      el("div", { class: "l" }, txn("Rodada {rodada} · {lado}, {placar} contra {adversario}", { rodada: g.round, lado: tx(g.home ? "casa" : "fora"),
        placar: `${g.gf}-${g.ga}`, adversario: teamName(g.opponent) })),
      tipLine("km do time", fmt(g.km, 1), "var(--data-dot)"),
      el("div", { class: "l", text: g.kmAgainst == null ? "adversário sem medição" : tx("adversário: {km} km", { km: fmt(g.kmAgainst, 1) }) }),
      g.sprints != null ? el("div", { class: "l", text: tx(g.sprintsAgainst == null ? "{n} sprints" : "{n} sprints, contra {m} do adversário",
        { n: fmt(g.sprints), m: fmt(g.sprintsAgainst) }) }) : null,
    ].filter(Boolean) })),
  });
}

const DISTANCE_TITLES = {
  Km: "Distância percorrida pelo time, somando todos os jogadores", "Km adv.": "Distância percorrida pelo adversário",
  "Dif.": "Km do time menos km do adversário", Sprints: "Número de sprints do time", "Sprints adv.": "Número de sprints do adversário",
  J: "Partidas com distância medida", Min: "Minutos nessas partidas", "Km/90": "Quilômetros a cada 90 minutos em campo",
  "Vel. máx.": "Maior velocidade registrada numa partida, em km/h",
};
function distanceTable(node, games) {
  const head = ["Rod.", "Adversário", "Local", "Placar", "Km", "Km adv.", "Dif.", "Sprints", "Sprints adv."];
  node.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { class: i <= 3 ? "left" : "", text: h, title: DISTANCE_TITLES[h] || "" })))));
  const gap = (g) => g.km == null || g.kmAgainst == null ? "-" : (g.km >= g.kmAgainst ? "+" : "−") + fmt(Math.abs(g.km - g.kmAgainst), 1);
  node.appendChild(el("tbody", {}, games.slice().sort((a, b) => (a.round ?? 99) - (b.round ?? 99) || a.timestamp - b.timestamp)
    .map((g) => el("tr", { class: "row-link", title: "abrir a partida", onclick: () => go("#/partida/" + g.match) },
      el("td", { class: "left", text: String(g.round ?? "-") }),
      el("td", { class: "left" }, crest(g.opponent), el("span", { text: g.opponent.name })),
      el("td", { class: "left", text: g.home ? "casa" : "fora" }),
      el("td", { class: "left " + (g.gf > g.ga ? "win" : g.gf < g.ga ? "lose" : ""), text: `${g.gf}-${g.ga}` }),
      el("td", { class: "strong", text: fmt(g.km, 1) }), el("td", { text: fmt(g.kmAgainst, 1) }),
      el("td", { class: "muted", text: gap(g) }),
      el("td", { text: fmt(g.sprints) }), el("td", { text: fmt(g.sprintsAgainst) })))));
}

function runnersTable(node, runners, rated) {
  const head = ["#", "Jogador", "Pos", "J", "Min", "Km", "Km/90", "Sprints", "Vel. máx."];
  node.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { class: i <= 2 ? "left" : "", text: h, title: DISTANCE_TITLES[h] || PLAYER_TITLES[h] || "" })))));
  node.appendChild(el("tbody", {}, runners.map((p, i) => el("tr", rated(p)
    ? { class: "row-link", title: "abrir a temporada do jogador", onclick: () => go("#/jogador/" + p.id) } : {},
    el("td", { class: "left pos", text: String(i + 1) }),
    el("td", { class: "left" }, face(p), el("span", { text: p.name || "" })),
    el("td", { class: "left", text: POS_CODE[p.position] || "-" }),
    el("td", { text: fmt(p.games) }), el("td", { text: fmt(p.minutes) }),
    el("td", { class: "strong", text: fmt(p.km, 1) }),
    el("td", { text: p.minutes >= 90 ? fmt((p.km / p.minutes) * 90, 2) : "-" }),
    el("td", { text: fmt(p.sprints) }), el("td", { text: fmt(p.topSpeed, 1) })))));
}

$("team-back").addEventListener("click", () => go("#/times"));

on("index", () => { local.team = null; });  // new matches change every team page: read it again
on("theme", () => { if (state.view === "time" && local.team) renderTeam(); });
