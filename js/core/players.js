// Player helpers several views share: positions, the season row of a player, the standard player table.
import { el, clear, fmt } from "./dom.js";
import { state } from "./state.js";
import { tx } from "./i18n.js";
import { go } from "./nav.js";
import { crest, face } from "./ui.js";

export const POS_LABEL = { G: "Goleiros", D: "Defensores", M: "Meio-campistas", F: "Atacantes" };
export const POS_CODE = { G: "GOL", D: "DEF", M: "MEI", F: "ATA" };
export const POS_ONE = { G: "Goleiro", D: "Defensor", M: "Meio-campista", F: "Atacante" };
export const PLAYER_TITLES = {
  Nota: "Nota média das partidas em que atuou", J: "Partidas com nota",
  Min: "Minutos em campo", G: "Gols", A: "Assistências",
  Melhor: "Maior nota em uma única partida", Pos: "Posição mais frequente na escalação",
};
export const RANKING_LIMIT = 50;  // the server's LEADERS: the lists a ranking can show

// The season row of a rated player (analysis.season's players), or undefined: only they have a season page.
export const playerById = (id) => {
  if (!state.playerMap) state.playerMap = new Map(state.index.players.map((p) => [p.id, p]));
  return state.playerMap.get(id);
};

// Sem um mínimo de jogos o ranking vira ruído: uma nota alta numa única partida
// passa na frente de quem sustentou a média a temporada inteira.
export function minGamesOptions() {
  const played = state.index.rounds.length;
  const half = Math.max(2, Math.round(played / 2));
  const third = Math.max(2, Math.round(played / 3));
  const pairs = [[half, tx("{n} jogos (metade da temporada)", { n: half })], [third, tx("{n} jogos (um terço)", { n: third })],
                 [5, tx("{n} jogos", { n: 5 })], [1, "Sem mínimo"]];
  return [...new Map(pairs.map((o) => [o[0], o])).values()].sort((a, b) => b[0] - a[0]);
}

export function playerTable(node, list, limit) {
  const table = clear(node);
  const head = ["#", "Jogador", "Time", "Pos", "Nota", "J", "Min", "G", "A", "Melhor"];
  table.appendChild(el("thead", {}, el("tr", {}, head.map((h, i) =>
    el("th", { class: i <= 3 ? "left" : "", text: h, title: PLAYER_TITLES[h] || "" })))));
  table.appendChild(el("tbody", {}, list.slice(0, limit).map((p, i) => el("tr", { class: "row-link", title: "abrir a temporada do jogador", onclick: () => go("#/jogador/" + p.id) },
    el("td", { class: "left pos", text: String(i + 1) }),
    el("td", { class: "left" }, face(p), el("span", { text: p.name || "" })),
    el("td", { class: "left" }, crest(p), el("span", { text: p.team || "" })),
    el("td", { class: "left", text: POS_CODE[p.position] || "-" }),
    el("td", { class: "strong", text: fmt(p.avg, 2) }),
    el("td", { text: fmt(p.j) }), el("td", { text: fmt(p.min) }),
    el("td", { text: fmt(p.goals) }), el("td", { text: fmt(p.assists) }),
    el("td", { text: fmt(p.best, 1) })))));
}

// Card counts as the season rows carry them. A dismissal is a second yellow or a straight red; a
// team's total also counts the cards shown to its staff.
export const redsOf = (r) => r.yellow2 + r.red;
export const playerCards = (p) => p.yellow + p.yellow2 + p.red;
export const teamCards = (r) => playerCards(r) + r.staff;
