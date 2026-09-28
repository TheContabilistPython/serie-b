// The design system's small pieces as functions: crests, faces, team names, tiles, cards, marks.
import { el, clear, fmt } from "./dom.js";
import { state } from "./state.js";

// Team badge from dados/logos. Absent badge: name only. size: false (18px), true (30px) or "xl" (56px, page heads).
const CREST_PX = { false: 18, true: 30, xl: 56 };
export const crest = (team, size = false) => (team && team.logo)
  ? el("img", { class: size === "xl" ? "crest xl" : size ? "crest lg" : "crest", src: team.logo, alt: "", loading: "lazy",
                width: CREST_PX[size], height: CREST_PX[size] })
  : null;

// Every team name on screen goes with its badge. `ref` is a team object (name/short + logo)
// or a plain short name, looked up in the standings; absent badge: the name alone.
const teamLogo = (ref) => {
  if (!ref) return null;
  if (typeof ref === "object") return ref.logo || null;
  const row = state.index ? state.index.table.find((r) => r.team.short === ref || r.team.name === ref) : null;
  return row ? row.team.logo : null;
};
export const teamName = (ref, big = false) => el("span", { class: "tname" },
  crest({ logo: teamLogo(ref) }, big),
  el("span", { text: typeof ref === "string" ? ref : (ref && (ref.name || ref.short)) || "" }));

// One stat tile: label, the big value in the edition's headline face, and a note that may carry a
// badge (a node as well as a string). `text` sets a word value a size down.
const tile = (label, value, note, opts = {}) => el("div", { class: "ooyl-tile" },
  el("div", { class: "ooyl-tile__label", text: label }),
  el("div", { class: "ooyl-tile__value" + (opts.text ? " is-text" : ""), text: value, title: value }),
  note === undefined || note === "" ? null : el("div", { class: "ooyl-tile__note" }, note));
export const tiles = (box, list) => { clear(box); list.forEach(([label, value, note, opts]) => box.appendChild(tile(label, value, note, opts))); };

// A card of the design system: headline and subtitle over the content.
export const cardBox = (title, sub, ...body) => el("section", { class: "ooyl-card" },
  el("header", { class: "ooyl-card__head" }, el("div", { class: "ooyl-card__titles" },
    el("h2", { class: "ooyl-headline", text: title }), sub ? el("p", { class: "ooyl-sub", text: sub }) : null)),
  ...body);

// Player face from dados/faces. Absent photo: nothing. size: false (22px), true (40px) or "xl" (64px, page heads).
const FACE_PX = { false: 22, true: 40, xl: 64 };
export const face = (p, size = false) => (p && p.face)
  ? el("img", { class: size === "xl" ? "face xl" : size ? "face lg" : "face", src: p.face, alt: "", loading: "lazy",
                width: FACE_PX[size], height: FACE_PX[size] })
  : null;

// Player disc on the pitch: the face when there is one (shirt number in the corner), else the number.
export const playerDisc = (p) => {
  const shirt = String(p.shirt ?? ""), img = face(p);
  return el("span", { class: "ooyl-player__disc" }, img || shirt, img && shirt ? el("i", { class: "shirt", text: shirt }) : null);
};

// Field markings behind the rows of an .ooyl-pitch: halfway line, centre circle, boxes.
export const turf = () => el("div", { class: "ooyl-pitch__turf", "aria-hidden": "true" },
  el("i", { class: "c" }), el("i", { class: "box top" }), el("i", { class: "six top" }),
  el("i", { class: "box bottom" }), el("i", { class: "six bottom" }));

const CARD_NAME = { yellow: "cartão amarelo", red: "cartão vermelho", yellowRed: "segundo amarelo" };
export const cardMark = (kind) => el("i", {
  class: "ooyl-cardmark ooyl-cardmark--" + (kind === "yellow" ? "yellow" : kind === "yellowRed" ? "second" : "red"),
  role: "img", "aria-label": CARD_NAME[kind] || "cartão", title: CARD_NAME[kind] || "cartão" });

// The reasons SofaScore gives for a card, in Portuguese (the match timeline and the referees' profiles).
export const CARD_REASONS = {
  Foul: "falta", Argument: "reclamação", "Time wasting": "cera",
  "Violent conduct": "conduta violenta", "Persistent fouling": "faltas seguidas",
  "Professional foul last man": "falta tática como último homem", Simulation: "simulação",
  Handball: "mão na bola", "Unallowed field entering": "entrada não autorizada em campo",
  "Off the ball foul": "falta longe da bola",
};

// SofaScore rating on the design system's five-step ramp (the top step is the accent at night).
const rateStep = (r) => r >= 7.5 ? 5 : r >= 7 ? 4 : r >= 6.5 ? 3 : r >= 6 ? 2 : 1;
export function rateChip(rating) {
  if (rating === null || rating === undefined) return null;
  return el("span", { class: "ooyl-rating ooyl-rating--" + rateStep(rating), text: fmt(rating, 1) });
}

// The design system's switch: a checkbox drawn as a track.
export const toggle = (checked, label, onchange) => el("label", { class: "ooyl-toggle" },
  el("input", { type: "checkbox", checked: checked ? "checked" : null, onchange }),
  el("span", { class: "ooyl-toggle__track", "aria-hidden": "true" }), el("span", { text: label }));
