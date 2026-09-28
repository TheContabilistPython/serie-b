// Seleção: the scouting page's eleven (scouting/web/selecao.js) with this league's players alone, as on the
// Série A page. Each slot asks for the position its formation line gives it (the ends of a line are the wide
// players, as scouting/temporada.py reads SofaScore's lineups). The numbers are each regular's percentiles among
// the league's regulars of his position (/api/selecao, analysis/selecao.py): his profile is the mean over the
// position's metrics, 50 being the median regular. The eleven gets a style (how attacking or defensive, how it
// builds, how direct) and a chemistry: the links between neighbouring slots, stronger for team-mates, compatriots
// abroad and functions that complete each other. Saved in the browser per season; #/selecao/3 opens slot 3.
import { $, el, clear, fmt } from "../core/dom.js";
import { state, on } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView } from "../core/router.js";
import { cardBox, crest, face, tiles, turf } from "../core/ui.js";
import { playerById } from "../core/players.js";
import { league } from "../core/league.js";
import { getJSON } from "../core/api.js";
import { money } from "../core/format.js";
import { LANG, LOCALE, tx } from "../core/i18n.js";

const FORMATIONS = ["4-3-3", "4-2-3-1", "4-4-2", "4-1-4-1", "3-5-2", "3-4-3", "5-3-2"];
const AGES = [21, 23, 25, 28];
const VALUES = [300000, 1000000, 3000000, 10000000];
// temporada.py's roles, the functions within them and its metrics' short names, as this page shows them.
const ROLES = { GOL: "goleiro", ZAG: "zagueiro", LAT: "lateral (posição)", VOL: "volante", MEI: "meia", PON: "ponta",
  ATA: "centroavante" };  // "lateral" alone is the throw-in's entry in the dictionaries
const FUNCTIONS = { classico: "Goleiro clássico", libero: "Goleiro líbero", defensivo: "Defensivo",
  construtor: "Construtor", ofensivo: "Ofensivo", marcador: "Marcador", box: "Box-to-box", organizador: "Organizador",
  atacante: "Meia atacante", agudo: "Agudo", tatico: "Tático", finalizador: "Finalizador", pivo: "Pivô",
  movel: "Atacante móvel", segundo: "Segundo atacante", equilibrado: "Equilibrado" };
const SHORT = { "gols/90": "gols", "xG/90": "xG", "chutes/90": "chutes", "xA/90": "xA",
  "passes-chave/90": "passes-chave", "grandes chances criadas/90": "grandes chances", "passes certos/90": "passes",
  "passes certos no campo rival/90": "passes no campo rival", "bolas longas certas/90": "bolas longas",
  "cruzamentos certos/90": "cruzamentos", "dribles certos/90": "dribles", "conduções progressivas/90": "conduções prog.",
  "desarmes + interceptações/90": "desarmes+int.", "recuperações/90": "recuperações", "cortes/90": "cortes",
  "aéreos ganhos/90": "aéreos", "perdas de posse/90": "perdas de posse", "defesas/90": "defesas",
  "gols evitados/90": "gols evitados", "saídas do gol/90": "saídas do gol", "km/90": "km", "sprints/90": "sprints",
  "xG/chute": "xG/chute", "% passe": "% passe", "% drible": "% drible", "% aéreo": "% aéreo", "% duelo": "% duelo" };
// The team's style: each dimension is the eleven's mean percentile over its metrics (outfield players).
const STYLE = [
  ["Ataque", ["xG/90", "xA/90", "chutes/90", "passes-chave/90", "grandes chances criadas/90", "dribles certos/90"]],
  ["Defesa", ["desarmes + interceptações/90", "recuperações/90", "cortes/90", "% duelo", "aéreos ganhos/90"]],
  ["Construção", ["passes certos/90", "% passe", "passes certos no campo rival/90"]],
  ["Verticalidade", ["conduções progressivas/90", "bolas longas certas/90", "dribles certos/90"]],
  ["Jogo aéreo", ["aéreos ganhos/90", "% aéreo"]],
  ["Intensidade", ["km/90", "sprints/90"]],
];
const TILT = 8;  // points between Ataque and Defesa that make the eleven offensive or "retranqueiro"
const local = { data: null, sel: null, pick: null };
const selKey = () => "selecao-perfil-" + state.index.season;  // the rating-based Seleção kept another shape under "selecao-"

const pctStep = (p) => p >= 80 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 20 ? 2 : 1;
const pctChip = (p, title) => p == null ? el("span", { class: "sel-none", text: "–", title })
  : el("span", { class: "ooyl-rating ooyl-rating--" + pctStep(p), title, text: String(p) });
const shortName = (name) => tx(SHORT[name] || name);
const roleName = (role) => (LANG === "pt" ? (ROLES[role] || role).replace(" (posição)", "") : tx(ROLES[role] || role));
const functionName = (p) => (p && p.fn ? tx(FUNCTIONS[p.fn] || p.fn) : "–");
const metricAt = (name) => local.data.metric.get(name);
const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// The index's row of a profile (short name, badge, face), or a stand-in from the profile's own fields.
const viewOf = (p) => playerById(p.id) || { id: p.id, name: p.nome, team: p.time, logo: null, face: null };
const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function countryName(p) {
  try { return new Intl.DisplayNames([LOCALE], { type: "region" }).of(p.pais2); } catch (_) { return p.pais || ""; }
}

export function open(slot) {
  setView("selecao");
  const i = Number(slot);  // #/selecao/3 opens the picker of slot 3 (0 is the goalkeeper)
  if (slot !== undefined && Number.isInteger(i) && i >= 0 && i < 11) local.pick = i;
  renderSelecao();
}

async function loadData() {
  if (local.data) return;
  const payload = await getJSON("/api/selecao");
  payload.metric = new Map(payload.metricas.map((name, i) => [name, i]));
  payload.byId = new Map(payload.jogadores.map((p) => [p.id, p]));
  local.data = payload;
}

// The formation's slots, read as temporada.line_roles reads SofaScore's lineups: the ends of a line are wide.
function lineRoles(index, size, lines) {
  const fill = (role, n) => Array(Math.max(0, n)).fill(role);
  if (index === 0) return size <= 3 ? fill("ZAG", size) : ["LAT", ...fill("ZAG", size - 2), "LAT"];
  if (index === lines.length - 1) return size <= 2 ? fill("ATA", size) : ["PON", ...fill("ATA", size - 2), "PON"];
  if (index === 1) {
    if (lines[0] === 3 && size >= 4) return ["LAT", ...fill("VOL", size - 2), "LAT"];
    if (size <= 2) return fill("VOL", size);
    if (size === 3) return ["MEI", "VOL", "MEI"];
    return ["PON", ...fill("VOL", size - 2), "PON"];
  }
  return size <= 2 ? fill("MEI", size) : ["PON", ...fill("MEI", size - 2), "PON"];
}
function shapeOf(formation) {
  const lines = formation.split("-").map(Number);
  const slots = [{ role: "GOL", line: 0, x: 0.5 }];
  lines.forEach((size, li) => lineRoles(li, size, lines)
    .forEach((role, k) => slots.push({ role, line: li + 1, x: (k + 1) / (size + 1) })));
  return slots;
}

// ---- the selection, saved in this browser
function loadSel() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(selKey()) || "null"); } catch (_) {}
  const sel = Object.assign({ formation: "4-3-3", idade: "todas", valor: "todos", slots: [], shape: [] }, saved || {});
  if (!FORMATIONS.includes(sel.formation)) sel.formation = "4-3-3";
  fit(sel);
  sel.fresh = !saved;  // first visit: open already filled with the suggestion
  return sel;
}
function fit(sel) {  // slots follow the formation; a chosen player keeps a slot of his role when there is one
  const shape = shapeOf(sel.formation);
  const kept = (sel.slots || []).map((id, i) => ({ id, role: ((sel.shape || [])[i] || {}).role }))
    .filter((s) => s.id != null && local.data.byId.has(s.id));
  sel.slots = shape.map(() => null);
  for (const s of kept) {
    const i = shape.findIndex((slot, k) => slot.role === s.role && sel.slots[k] == null);
    if (i >= 0) sel.slots[i] = s.id;
  }
  sel.shape = shape;
}
function save() {
  const { formation, idade, valor, slots, shape } = local.sel;
  try { localStorage.setItem(selKey(), JSON.stringify({ formation, idade, valor, slots, shape })); } catch (_) {}
}

function eligible(p) {
  const sel = local.sel;
  if (p.perfil == null) return false;
  if (sel.idade !== "todas" && (p.idade == null || p.idade > Number(sel.idade))) return false;
  if (sel.valor !== "todos" && (p.valor == null || p.valor > Number(sel.valor))) return false;
  return true;
}
// Who may take a slot of this role: within the filters and not in the eleven yet, the best profiles first.
function candidates(role) {
  const used = new Set(local.sel.slots.filter((id) => id != null));
  return local.data.jogadores.filter((p) => p.pos === role && eligible(p) && !used.has(p.id))
    .sort((a, b) => b.perfil - a.perfil || b.min - a.min);
}
function suggest() {
  const sel = local.sel;
  sel.slots = sel.shape.map(() => null);
  sel.shape.forEach((slot, i) => {
    const best = candidates(slot.role)[0];
    if (best) sel.slots[i] = best.id;
  });
  local.pick = null;
  save();
}

// ---- chemistry: links between neighbouring slots
function links(shape) {  // along each line, and from each slot to the nearest slot(s) of the next line
  const lines = {}, found = [], seen = new Set();
  shape.forEach((slot, i) => (lines[slot.line] = lines[slot.line] || []).push(i));
  const add = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); found.push([a, b]); }
  };
  for (const [line, members] of Object.entries(lines)) {
    for (let k = 0; k + 1 < members.length; k += 1) add(members[k], members[k + 1]);
    const next = lines[Number(line) + 1];
    if (!next) continue;
    for (const i of members) {
      const near = next.map((j) => [Math.abs(shape[j].x - shape[i].x), j]).sort((a, b) => a[0] - b[0]);
      add(i, near[0][1]);
      if (near[1] && near[1][0] - near[0][0] < 0.05) add(i, near[1][1]);
    }
  }
  return found;
}
function functionPair(a, b) {  // [points, reason] for two neighbours' functions, or null
  const pair = (r1, r2) => (a.pos === r1 && b.pos === r2) || (a.pos === r2 && b.pos === r1);
  const of = (role) => (a.pos === role ? a.fn : b.fn);
  if (a.pos === "ZAG" && b.pos === "ZAG") {
    const fns = new Set([a.fn, b.fn]);
    if (fns.has("construtor") && fns.has("defensivo")) return [2, tx("zagueiros que se completam: um sai jogando, o outro protege")];
    if (a.fn === "defensivo" && b.fn === "defensivo") return [-1, tx("dois zagueiros defensivos: pouca saída de bola")];
    return [0, null];
  }
  if (pair("LAT", "PON")) {
    const lat = of("LAT"), pon = of("PON");
    if (lat === "ofensivo" && pon === "tatico") return [2, tx("lateral que apoia com ponta que recompõe")];
    if (lat === "defensivo" && (pon === "agudo" || pon === "organizador")) return [2, tx("lateral que segura com ponta que ataca")];
    if (lat === "ofensivo" && pon === "agudo") return [-1, tx("lateral e ponta que só atacam: o corredor fica exposto")];
    return [0, null];
  }
  if (pair("LAT", "ZAG") && of("LAT") === "ofensivo" && of("ZAG") === "defensivo") return [1, tx("zagueiro que cobre o lateral que sobe")];
  const middle = ["VOL", "MEI"];
  if (middle.includes(a.pos) && middle.includes(b.pos)) {
    const markers = [a, b].filter((p) => p.fn === "marcador").length;
    if (markers === 1) return [2, tx("um marca, o outro joga")];
    if (markers === 2) return [0, tx("dois marcadores: sólido, mas pouco criativo")];
    if ([a, b].every((p) => p.fn === "box" || p.fn === "atacante")) return [-1, tx("dois que chegam à frente e ninguém protege")];
    return [0, null];
  }
  if (a.pos === "ATA" && b.pos === "ATA") {
    if (a.fn === "finalizador" && b.fn === "finalizador") return [0, tx("dois finalizadores disputam o mesmo espaço")];
    if (a.fn !== b.fn && a.fn !== "equilibrado" && b.fn !== "equilibrado") return [2, tx("dupla de ataque com funções diferentes")];
    return [0, null];
  }
  if (a.pos === "ATA" || b.pos === "ATA") {
    const ata = a.pos === "ATA" ? a : b, other = a.pos === "ATA" ? b : a;
    if ((ata.fn === "finalizador" || ata.fn === "pivo") && other.fn === "organizador") return [2, tx("quem cria abastece quem finaliza")];
    if (ata.fn === "pivo" && other.pos === "PON" && other.fn === "agudo") return [1, tx("o pivô segura a bola para o ponta atacar")];
    if (ata.fn === "segundo" && other.pos === "MEI" && other.fn === "atacante") return [-1, tx("segundo atacante e meia atacante na mesma faixa")];
    return [0, null];
  }
  if (pair("GOL", "ZAG") && of("GOL") === "libero" && of("ZAG") === "construtor") return [1, tx("goleiro e zagueiro que saem jogando")];
  return null;
}
function linkScore(a, b) {  // 0 to 10, with the reasons; one league, so no penalty for mixing leagues
  let score = 5;
  const reasons = [];
  if (a.time && a.time === b.time) { score += 3; reasons.push([3, tx("mesmo clube ({time})", { time: viewOf(a).team })]); }
  if (a.pais2 && a.pais2 === b.pais2 && a.pais2 !== local.data.casa) {  // compatriots abroad, not two locals
    score += 1;
    reasons.push([1, tx("mesmo país ({pais})", { pais: countryName(a) })]);
  }
  const fn = functionPair(a, b);
  if (fn && fn[1]) { score += fn[0]; reasons.push(fn); }
  return { score: Math.max(0, Math.min(10, score)), reasons };
}
function chemistry(players) {  // players[i]: the profile in slot i, or null
  const found = links(local.sel.shape).filter(([i, j]) => players[i] && players[j])
    .map(([i, j]) => ({ i, j, ...linkScore(players[i], players[j]) }));
  const perSlot = players.map((p, i) => {
    const mine = found.filter((l) => l.i === i || l.j === i);
    return mine.length ? mine.reduce((s, l) => s + l.score, 0) / mine.length : null;
  });
  const team = found.length ? Math.round((found.reduce((s, l) => s + l.score, 0) / found.length) * 10) : null;
  return { links: found, perSlot, team };
}
const dotsFor = (v) => (v == null ? 0 : v >= 7 ? 3 : v >= 5.5 ? 2 : v >= 4 ? 1 : 0);
const dots = (v) => el("span", { class: "sel-dots", title: v == null ? tx("sem ligações") : tx("química {n} de 10", { n: fmt(v, 1) }) },
  [0, 1, 2].map((k) => el("i", { class: k < dotsFor(v) ? "is-on" : null })));

// ---- the team's style
function styleOf(outfield) {
  return STYLE.map(([name, metrics]) => {
    const values = outfield.map((p) => {
      const found = metrics.map((m) => p.p[metricAt(m)]).filter((x) => x != null);
      return found.length ? found.reduce((s, x) => s + x, 0) / found.length : null;
    }).filter((x) => x != null);
    return { name, metrics, value: values.length ? Math.round(values.reduce((s, x) => s + x, 0) / values.length) : null };
  });
}
function styleWords(style) {
  const get = (name) => style.find((s) => s.name === name).value;
  const attack = get("Ataque"), defence = get("Defesa");
  if (attack == null || defence == null) return { label: "–", text: "" };
  const tilt = attack - defence;
  const label = tx(tilt >= TILT ? "Ofensivo" : tilt <= -TILT ? "Retranqueiro" : "Equilibrado");
  const traits = [];
  const build = get("Construção"), direct = get("Verticalidade"), air = get("Jogo aéreo"), pace = get("Intensidade");
  if (build != null && build >= 60) traits.push(tx("gosta de ter a bola"));
  if (direct != null && direct >= 60) traits.push(tx("é vertical"));
  if (build != null && direct != null && build < 45 && direct >= 50) traits.push(tx("joga mais direto"));
  if (air != null && air >= 60) traits.push(tx("é forte no jogo aéreo"));
  if (pace != null && pace >= 60) traits.push(tx("é intenso"));
  if (pace != null && pace <= 40) traits.push(tx("corre pouco"));
  const numbers = { a: attack, d: defence };
  const lead = tilt >= TILT ? tx("ataque {a} contra defesa {d}", numbers)
    : tilt <= -TILT ? tx("defesa {d} contra ataque {a}", numbers) : tx("ataque {a} e defesa {d}", numbers);
  return { label, text: tx("{estilo}: {resumo}.", { estilo: label, resumo: lead + (traits.length ? "; " + traits.join(", ") : "") }) };
}

// ---- each player's strengths and weakness: his percentiles in his position's metrics
function ranks(p) {  // [percentile, metric], best first
  return (local.data.papeis[p.pos] || []).map((name) => [p.p[metricAt(name)], name])
    .filter(([x]) => x != null).sort((a, b) => b[0] - a[0]);
}
const highlights = (p, count) => ranks(p).slice(0, count).map(([x, name]) => `${shortName(name)} ${x}`).join(" · ");
function weakest(p) {
  const found = ranks(p);
  return found.length ? `${shortName(found[found.length - 1][1])} ${found[found.length - 1][0]}` : "–";
}

// ---- the view
function slotNode(i, p, chem) {
  const slot = local.sel.shape[i], active = local.pick === i;
  const choose = () => { local.pick = i; draw(); const q = $("sel-q"); if (q) q.focus(); };
  const empty = () => { local.sel.slots[i] = null; if (local.pick === i) local.pick = null; save(); draw(); };
  if (!p) {
    return el("div", { class: "ooyl-player slot" + (active ? " active" : "") },
      el("span", { class: "ooyl-player__disc is-empty", text: slot.role }),
      el("span", { class: "empty-slot", text: tx("{posicao} (vazio)", { posicao: roleName(slot.role) }) }),
      el("div", { class: "slot-actions" }, el("button", { class: "ooyl-btn ooyl-btn--sm", text: "Escolher", onclick: choose })));
  }
  const v = viewOf(p);
  return el("div", { class: "ooyl-player slot" + (active ? " active" : "") },
    el("span", { class: "ooyl-player__disc" }, face(v) || crest(v) || initials(v.name)),
    el("button", { class: "link", text: v.name, title: "abrir a temporada do jogador", onclick: () => go("#/jogador/" + p.id) }),
    el("span", { class: "ooyl-player__meta" }, pctChip(p.perfil, "Perfil"),
      el("span", { class: "ooyl-player__marks", text: functionName(p).toLowerCase() })),
    dots(chem),
    el("div", { class: "slot-actions" },
      el("button", { class: "ooyl-btn ooyl-btn--sm", text: "Trocar", onclick: choose }),
      el("button", { class: "ooyl-btn ooyl-btn--sm", text: "×", title: "esvaziar a vaga", "aria-label": "esvaziar a vaga", onclick: empty })));
}

// The picker lists the slot's position within the filters, the eleven (its own occupant too) left out; typing only
// redraws the list, so the box keeps focus.
function picker() {
  const i = local.pick, role = local.sel.shape[i].role;
  const assign = (p) => { local.sel.slots[i] = p.id; local.pick = null; save(); draw(); };
  const close = () => { local.pick = null; draw(); };
  const results = el("div", { class: "sel-results" });
  const search = el("input", { id: "sel-q", type: "search", placeholder: "Buscar jogador ou time", "aria-label": "Buscar jogador ou time",
                               autocomplete: "off" });
  const matching = () => {
    const text = fold(search.value.trim());
    return candidates(role).filter((p) => text.length < 2
      || [viewOf(p).name, p.nome, viewOf(p).team, p.time].some((s) => fold(s).includes(text)));
  };
  const list = () => {
    const found = matching();
    clear(results);
    if (!found.length) {
      results.appendChild(el("p", { class: "sel-note", text: "Ninguém com esses filtros. Tente outro nome ou afrouxe a idade e o valor." }));
      return;
    }
    found.slice(0, 10).forEach((p) => {
      const v = viewOf(p);
      results.appendChild(el("button", { class: "sel-row", onclick: () => assign(p) },
        face(v, true) || crest(v, true) || el("span"),
        el("span", { class: "sel-who" }, el("span", {}, el("strong", { text: v.name }),
          el("small", { text: [v.team, functionName(p).toLowerCase(), p.idade != null ? tx("{n} anos", { n: p.idade }) : null]
            .filter(Boolean).join(" · ") }))),
        el("span", { class: "sel-meta", text: p.valor ? money(p.valor) : "–" }),
        pctChip(p.perfil, "Perfil")));
    });
  };
  search.oninput = list;
  search.onkeydown = (ev) => {
    if (ev.key === "Escape") close();
    if (ev.key === "Enter") { const first = matching()[0]; if (first) assign(first); }
  };
  list();
  return el("div", { class: "picker" },
    el("header", { class: "ooyl-card__head" }, el("div", { class: "ooyl-card__titles" },
      el("h3", { class: "ooyl-headline ooyl-headline--sm", text: tx("Escolher {posicao}", { posicao: roleName(role) }) }),
      el("p", { class: "ooyl-sub", text: "Sem busca, os maiores perfis da posição dentro dos filtros. Busque pelo nome ou pelo time; Enter escala o primeiro, Esc fecha." })),
      el("div", { class: "ooyl-card__actions" }, el("button", { class: "ooyl-btn ooyl-btn--sm", text: "Fechar", onclick: close }))),
    search, results);
}

function controls() {
  const sel = local.sel;
  const select = (label, options, value, change) => el("span", { class: "ooyl-field" },
    el("label", { class: "ctl", text: label }),
    el("select", { "aria-label": label, onchange: (ev) => change(ev.target.value) },
      options.map(([v, t]) => el("option", { value: v, text: t, selected: v === value ? "selected" : null }))));
  const ages = [["todas", "Qualquer idade"], ...AGES.map((n) => [String(n), tx("Até {n} anos", { n })])];
  const values = [["todos", "Qualquer valor"], ...VALUES.map((v) => [String(v), tx("Até {valor}", { valor: money(v, 0) })])];
  return el("div", { class: "filter-row sel-filters" },
    el("div", { class: "controls" },
      select("Formação", FORMATIONS.map((f) => [f, f]), sel.formation,
        (v) => { sel.formation = v; fit(sel); local.pick = null; save(); draw(); }),
      select("Idade", ages, sel.idade, (v) => { sel.idade = v; save(); draw(); }),
      select("Valor", values, sel.valor, (v) => { sel.valor = v; save(); draw(); })),
    el("div", { class: "top-spacer" }),
    el("div", { class: "controls" },
      el("button", { class: "ooyl-btn ooyl-btn--primary", text: "Sugerir pelos perfis", onclick: () => { suggest(); draw(); } }),
      el("button", { class: "ooyl-btn", text: "Limpar",
                     onclick: () => { sel.slots = sel.shape.map(() => null); local.pick = null; save(); draw(); } })));
}

function draw() {
  const sel = local.sel, data = local.data;
  const players = sel.slots.map((id) => (id == null ? null : data.byId.get(id) || null));
  const chem = chemistry(players);
  const picked = players.filter(Boolean);
  const style = styleOf(picked.filter((p) => p.pos !== "GOL")), words = styleWords(style);

  const lines = [...new Set(sel.shape.map((s) => s.line))].sort((a, b) => b - a);  // attack on top
  const pitch = el("div", { class: "ooyl-pitch sel-pitch" }, turf(),
    lines.map((line) => el("div", { class: "ooyl-pitch__row" },
      sel.shape.map((slot, i) => [slot, i]).filter(([slot]) => slot.line === line)
        .map(([, i]) => slotNode(i, players[i], chem.perSlot[i])))));

  const values = picked.map((p) => p.valor).filter(Boolean);
  const ages = picked.map((p) => p.idade).filter((x) => x != null);
  const clubs = new Set(picked.map((p) => p.time));
  const summary = picked.length
    ? tx(clubs.size === 1 ? "{n} de 11 escalados · perfil médio {perfil} · idade média {idade} · valor somado {valor} · {clubes} clube"
      : "{n} de 11 escalados · perfil médio {perfil} · idade média {idade} · valor somado {valor} · {clubes} clubes", {
        n: picked.length, perfil: Math.round(picked.reduce((s, p) => s + p.perfil, 0) / picked.length),
        idade: ages.length ? fmt(ages.reduce((s, x) => s + x, 0) / ages.length, 1) : "–",
        valor: values.length ? money(values.reduce((s, x) => s + x, 0)) : "–", clubes: clubs.size })
    : tx("Nenhum jogador escalado: use Sugerir pelos perfis ou escolha vaga por vaga.");

  const styleBars = el("div", { class: "sel-bars" }, style.map((s) => el("div", { class: "sel-dim" },
    el("span", { class: "sel-dim__label", text: s.name }),
    el("span", { class: "sel-dim__track" },
      el("span", { class: "sel-dim__fill sel-step-" + pctStep(s.value ?? 0), style: `width: ${s.value ?? 0}%` })),
    el("span", { class: "sel-dim__pct", text: s.value == null ? "–" : String(s.value) }),
    el("p", { class: "sel-dim__metrics", text: s.metrics.map(shortName).join(" · ") }))));

  const describe = (l) => el("div", { class: "sel-link" },
    el("span", { class: "ooyl-rating ooyl-rating--" + pctStep(l.score * 10), title: "força da ligação, de 0 a 10", text: fmt(l.score) }),
    el("div", {}, el("strong", { text: tx("{a} e {b}", { a: viewOf(players[l.i]).name, b: viewOf(players[l.j]).name }) }),
      el("small", { text: l.reasons.length ? l.reasons.map(([pts, why]) => `${pts > 0 ? "+" : pts < 0 ? "−" : "·"} ${why}`).join("; ")
        : tx("sem ligação especial") })));
  const sorted = [...chem.links].sort((a, b) => b.score - a.score);
  const linkList = chem.links.length
    ? el("div", { class: "sel-links" },
        el("div", {}, el("h3", { class: "sel-subhead", text: "Ligações mais fortes" }), sorted.slice(0, 5).map(describe)),
        el("div", {}, el("h3", { class: "sel-subhead", text: "Ligações mais fracas" }), sorted.slice(-4).reverse().map(describe)))
    : el("p", { class: "sel-note", text: "Escale jogadores vizinhos para ver a química." });

  const openPlayer = (p) => go("#/jogador/" + p.id);
  const traits = el("div", { class: "scroll" }, el("table", { class: "sel-table" },
    el("thead", {}, el("tr", {}, ["Vaga", "Jogador", "Função", "Pontos fortes", "Ponto fraco", "Perfil", "Química"]
      .map((h, k) => el("th", { class: k >= 1 && k <= 4 ? "left" : null, text: h })))),
    el("tbody", {}, sel.shape.map((slot, i) => [slot, players[i], i]).filter(([, p]) => p).map(([slot, p, i]) => {
      const v = viewOf(p);
      return el("tr", { class: "row-link", tabindex: "0", title: "abrir a temporada do jogador", onclick: () => openPlayer(p),
                        onkeydown: (ev) => { if (ev.key === "Enter") openPlayer(p); } },
        el("td", { class: "muted", text: slot.role }),
        el("td", { class: "left" }, el("div", { class: "sel-who" }, face(v, true) || crest(v, true),
          el("div", {}, el("strong", { text: v.name }),
            el("small", { text: [v.team, p.idade != null ? tx("{n} anos", { n: p.idade }) : null, p.valor ? money(p.valor) : null]
              .filter(Boolean).join(" · ") })))),
        el("td", { class: "left", text: functionName(p) }),
        el("td", { class: "left sel-marks", text: highlights(p, 2) || "–" }),
        el("td", { class: "left sel-marks", text: weakest(p) }),
        el("td", {}, pctChip(p.perfil, "Perfil")),
        el("td", {}, dots(chem.perSlot[i])));
    }))));

  const tileBox = el("div", { class: "ooyl-tiles sel-tiles" });
  tiles(tileBox, [["Estilo", words.label, words.text || tx("escale jogadores de linha"), { text: true }],
    ["Química", chem.team == null ? "–" : String(chem.team), tx("de 100 · {n} ligações entre vizinhos", { n: chem.links.length })]]);
  clear($("sel-root")).append(
    cardBox(league().lineup_title || "Seleção",
      tx("Monte um time com os jogadores desta liga. Cada vaga pede a posição que a formação dá a ela. Os números são percentis entre os regulares da liga na mesma posição, com {min} minutos ou mais: o perfil é a média nas métricas da posição, e 50 é o regular mediano.", { min: fmt(data.minimo) }),
      controls()),
    el("div", { class: "sel-grid" },
      el("section", { class: "ooyl-card" }, el("p", { class: "ooyl-sub", text: summary }), pitch, local.pick != null ? picker() : null),
      el("div", { class: "sel-side" }, tileBox,
        cardBox("Estilo do time", tx("Média dos percentis dos jogadores de linha em cada dimensão (50 = o regular mediano). Ofensivo ou retranqueiro quando ataque e defesa se afastam {n} pontos ou mais.", { n: TILT }),
          styleBars))),
    cardBox("Química", "Cada ligação entre vizinhos no campo vale de 0 a 10: começa em 5, sobe 3 para quem joga no mesmo clube e 1 para estrangeiros do mesmo país, e ganha ou perde pontos pelas funções (um zagueiro que constrói ao lado de um que protege soma; lateral e ponta que só atacam pelo mesmo lado tiram). A química do time é a média, de 0 a 100.",
      linkList),
    cardBox("Características", "Função, os dois pontos mais fortes e o mais fraco de cada escalado, em percentis da posição.", traits));
}

async function renderSelecao() {
  if (!local.data) {
    clear($("sel-root")).appendChild(el("div", { class: "empty", text: "Carregando os perfis dos jogadores..." }));
    try {
      await loadData();
    } catch (err) {
      clear($("sel-root")).appendChild(el("div", { class: "empty", text: tx("Não foi possível ler os perfis: {erro}", { erro: err.message }) }));
      return;
    }
    if (state.view !== "selecao") return;
  }
  if (!local.sel) local.sel = loadSel();
  if (local.sel.fresh) { local.sel.fresh = false; suggest(); }
  if (local.pick != null && !local.sel.shape[local.pick]) local.pick = null;
  draw();
}

// New data (a collection, the panel's reload) change every profile: read them again, and the saved eleven with them.
on("index", () => { local.data = null; local.sel = null; if (state.view === "selecao") renderSelecao(); });
on("theme", () => { if (state.view === "selecao" && local.data) draw(); });
