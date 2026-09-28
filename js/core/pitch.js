// The pitch the match and team pages share: shot vocabulary, the half-pitch SVG, legend marks and
// the rows of a formation.
import { el, css } from "./dom.js";

export const PITCH = { W: 1000, ux: 15.44, uy: 10 };
export const SHOT_LABEL = { goal: "Gol", save: "Defendido", miss: "Para fora", block: "Bloqueado", post: "Na trave", "blocked-off-line": "Salvo em cima da linha" };
export const SITUATION = { regular: "jogada normal", assisted: "jogada assistida", corner: "escanteio", "set-piece": "bola parada", "fast-break": "contra-ataque", penalty: "pênalti",
                           "free-kick": "cobrança de falta", "throw-in-set-piece": "lateral" };
export const BODY = { "right-foot": "pé direito", "left-foot": "pé esquerdo", head: "cabeça", other: "outro" };

// depth: quantas unidades de comprimento mostrar a partir da linha de fundo. O campo
// e cortado na profundidade real das finalizacoes, entao a borda de baixo fica aberta:
// ela e o limite da vista, nao uma linha do campo.
export function pitchSvg(depth) {
  const { W, ux, uy } = PITCH;
  const H = depth * ux;
  const svg = el("svg", { class: "ooyl-shotmap__pitch", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Mapa de finalizações" });
  svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, rx: 10, style: "fill:var(--pitch)" }));
  const line = (a) => el("rect", Object.assign({ class: "ooyl-shot-line" }, a));
  svg.appendChild(el("path", { class: "ooyl-shot-line", d: `M 2 ${H} L 2 10 Q 2 2 10 2 L ${W - 10} 2 Q ${W - 2} 2 ${W - 2} 10 L ${W - 2} ${H}` }));
  svg.appendChild(line({ x: 20.35 * uy, y: 2, width: 59.3 * uy, height: 15.71 * ux }));
  svg.appendChild(line({ x: 36.54 * uy, y: 2, width: 26.92 * uy, height: 5.24 * ux }));
  svg.appendChild(el("line", { x1: 44.62 * uy, x2: 55.38 * uy, y1: 3, y2: 3, "stroke-width": 6, style: "stroke:var(--ink-muted)" }));
  svg.appendChild(el("circle", { cx: 50 * uy, cy: 10.48 * ux, r: 4, style: "fill:var(--pitch-line)" }));
  if (depth > 50) svg.appendChild(el("line", { class: "ooyl-shot-line", x1: 2, x2: W - 2, y1: 50 * ux, y2: 50 * ux }));
  // Arco da grande area: parte do circulo de 9,15 m ao redor da marca do penalti que
  // fica fora da area. Meia-corda = raiz(134,6^2 - 80,8^2) = 107,6 px.
  svg.appendChild(el("path", { d: `M ${50 * uy - 107.6} ${15.71 * ux} A 134.6 134.6 0 0 0 ${50 * uy + 107.6} ${15.71 * ux}`, class: "ooyl-shot-line" }));
  // Meio circulo central: so a metade que cai neste lado do campo.
  if (depth > 50) svg.appendChild(el("path", { d: `M ${50 * uy - 134.6} ${50 * ux} A 134.6 134.6 0 0 1 ${50 * uy + 134.6} ${50 * ux}`, class: "ooyl-shot-line" }));
  return svg;
}

export function legendMark(type, tone) {
  const svg = el("svg", { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": "true" });
  const ink = tone || css("--ink-muted");
  if (type === "goal") {
    svg.appendChild(el("circle", { cx: 8, cy: 8, r: 4.5, fill: ink }));
    svg.appendChild(el("circle", { cx: 8, cy: 8, r: 7, fill: "none", stroke: ink, "stroke-width": 1.5 }));
  } else if (type === "save") {
    svg.appendChild(el("circle", { cx: 8, cy: 8, r: 5.5, fill: ink }));
  } else if (type === "miss") {
    svg.appendChild(el("circle", { cx: 8, cy: 8, r: 5, fill: "none", stroke: ink, "stroke-width": 2 }));
  } else {
    svg.appendChild(el("circle", { cx: 8, cy: 8, r: 5, fill: "none", stroke: ink, "stroke-width": 2 }));
    svg.appendChild(el("circle", { cx: 8, cy: 8, r: 1.6, fill: ink }));
  }
  return svg;
}

// Starters come ordered by formation rows (goalkeeper first); drawn bottom-up so the goalkeeper sits
// at the bottom. A formation that does not add up to the outfield players gives them one row.
export function formationRows(formation, starters) {
  const gk = starters.filter((p) => p.position === "G");
  const rest = starters.filter((p) => p.position !== "G");
  const digits = (formation || "").split("-").map(Number).filter((n) => n > 0);
  const rows = [];
  let cursor = 0;
  if (digits.reduce((a, b) => a + b, 0) === rest.length) {
    digits.forEach((n) => { rows.push(rest.slice(cursor, cursor + n)); cursor += n; });
  } else {
    rows.push(rest);
  }
  rows.reverse();
  rows.push(gk);
  return rows;
}
