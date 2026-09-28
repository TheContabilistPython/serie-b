// The one floating tooltip of the page: every chart, dot and row feeds it a list of lines.
import { el, clear } from "./dom.js";

let tipNode = null;

export function showTip(x, y, kids) {
  if (!tipNode) { tipNode = el("div", { class: "ooyl-tip" }); document.body.appendChild(tipNode); }
  clear(tipNode);
  kids.forEach((k) => tipNode.appendChild(k));
  tipNode.hidden = false;
  const box = tipNode.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + box.width > innerWidth - 8) left = x - box.width - 14;
  if (top + box.height > innerHeight - 8) top = y - box.height - 14;
  tipNode.style.left = Math.max(8, left) + "px";
  tipNode.style.top = Math.max(8, top) + "px";
}

export const hideTip = () => { if (tipNode) tipNode.hidden = true; };

// A touch screen has no pointer leaving: a finger sliding over a chart or a row (to scroll the page) opened the
// tooltip, which takes no taps (pointer-events: none), and nothing closed it. So it also closes when the page or
// a table scrolls, when the browser takes the touch to scroll, on the next touch anywhere, and a few seconds
// after the finger lifts. A mouse keeps the hover behaviour as it was.
let tipTimer = null;
const early = { capture: true, passive: true };
addEventListener("scroll", hideTip, early);
addEventListener("pointercancel", hideTip, early);
addEventListener("pointerdown", (ev) => { if (ev.pointerType !== "mouse") { clearTimeout(tipTimer); hideTip(); } }, early);
addEventListener("pointerup", (ev) => {
  if (ev.pointerType !== "mouse") { clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 4000); }
}, early);

export const tipLine = (label, value, color) => el("div", { class: "row" },
  color ? el("span", { class: "stroke", style: `background:${color}` }) : null,
  el("span", { class: "v", text: value }), el("span", { class: "l", text: label }));
