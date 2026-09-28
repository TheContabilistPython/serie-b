// DOM and number helpers every module uses: element lookup and builder, formatting.
import { LOCALE, tx } from "./i18n.js";

export const $ = (id) => document.getElementById(id);
export const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? "-"
  : Number(n).toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const counted = (n, one, many) => `${fmt(n)} ${tx(n === 1 ? one : many)}`;

const SVG_TAGS = new Set(["g", "rect", "circle", "line", "path", "text", "tspan", "clipPath", "polyline", "defs", "image"]);

// el("td", { class: "left", text: "x", onclick: fn }, ...children): attributes, `text`, listeners (on*),
// and children (nodes, strings, numbers, nested arrays; null/false are skipped). SVG tags get the SVG namespace.
// Every plain text it is handed (text, title, aria-label, placeholder, string children) goes through the
// dictionary of core/i18n.js, so a fixed Portuguese label needs only its entry there.
const TRANSLATED = new Set(["title", "aria-label", "placeholder"]);
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(tag === "svg" || SVG_TAGS.has(tag) ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.setAttribute("class", v);
    else if (k === "text") node.textContent = tx(v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, TRANSLATED.has(k) ? tx(v) : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.appendChild(typeof kid === "string" ? document.createTextNode(tx(kid))
      : typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
