// The competition, as /api/index describes it (liga.json on the server): its names, the table's
// zones and the simulator's columns. Nothing on the page hardcodes a league.
import { el, clear } from "./dom.js";
import { state } from "./state.js";
import { tx } from "./i18n.js";

export const league = () => (state.index && state.index.league) || { name: "", division: "", zones: [], simulator: [] };

// The tone of the zone that holds a table position ("good", "mid", "bad"), or "" outside every zone.
export function zoneOf(pos) {
  const zone = league().zones.find((z) => z.from <= pos && pos <= z.to);
  return zone ? zone.tone : "";
}

// "1", "1 e 2", "3 a 6".
export const rangeText = (z) => z.from === z.to ? String(z.from)
  : tx(z.to === z.from + 1 ? "{de} e {ate}" : "{de} a {ate}", { de: z.from, ate: z.to });

// Every [data-zones] box on the page lists the zones; data-extra adds one more line of legend.
export function fillZoneLegends() {
  document.querySelectorAll("[data-zones]").forEach((box) => {
    clear(box);
    league().zones.forEach((z) => box.appendChild(el("span", {}, el("i", { class: "zone " + z.tone }), `${tx(z.label)} (${rangeText(z)})`)));
    if (box.dataset.extra) box.appendChild(el("span", { text: box.dataset.extra }));
  });
}

// Header line under the product name: division, year and the latest round in the data.
export const seasonLine = () => {
  const rounds = state.index.rounds;
  return [tx(league().division || league().name), state.index.year || state.index.season,
    rounds.length ? tx("R{n}", { n: rounds[rounds.length - 1].round }) : null].filter(Boolean).join(" · ");
};
