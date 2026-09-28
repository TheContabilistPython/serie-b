// Times: the clubs in the order of the standings, each opening its page.
import { $, el, clear, fmt, counted } from "../core/dom.js";
import { state } from "../core/state.js";
import { go } from "../core/nav.js";
import { setView } from "../core/router.js";
import { crest } from "../core/ui.js";
import { zoneOf } from "../core/league.js";
import { ord, tx } from "../core/i18n.js";

export function open() {
  setView("times");
  const host = clear($("teams-list"));
  state.index.table.forEach((r) => host.appendChild(el("button", {
    class: "team-row", title: "abrir o time", onclick: () => go("#/time/" + r.team.id) },
    el("span", { class: "pos" }, el("i", { class: "zone " + zoneOf(r.pos) }), ord(r.pos)),
    el("span", { class: "name" }, crest(r.team, true), el("span", { text: r.team.name })),
    el("span", { class: "pts" }, fmt(r.pts), el("small", { text: "pts" })),
    el("span", { class: "rec", text: tx("{jogos} · {v}V {e}E {d}D", { jogos: counted(r.j, "jogo", "jogos"), v: r.v, e: r.e, d: r.d }) }),
    el("span", { class: "sg", text: tx("SG {n}", { n: (r.sg > 0 ? "+" : "") + fmt(r.sg) }) }))));
}
