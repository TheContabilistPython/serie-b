// Charts follow the design system: neutral marks, one highlight in accent, the value written at the
// mark, and the full table behind "Ver dados em tabela". SVG charts are drawn at their container's real
// width, so 11px text stays 11px; one drawn while its view was hidden (0 wide) is redrawn when the view
// shows (refreshCharts, called by the router), and all of them after a resize.
import { el, clear, fmt } from "./dom.js";
import { showTip, hideTip } from "./tooltip.js";
import { go } from "./nav.js";
import { pctText } from "./format.js";
import { tx } from "./i18n.js";

const charts = new Map();  // host -> { width, draw }

export function refreshCharts() {
  charts.forEach((c, host) => {
    if (!host.isConnected) { charts.delete(host); return; }
    const w = host.clientWidth;
    if (w && Math.abs(w - c.width) > 1) c.draw();
  });
}
let resizeTimer = null;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshCharts, 150); });

// One series over rounds: the series in data-dot, a dashed reference line, the last point
// highlighted and labelled, a crosshair with the tooltip.
export function lineChart(host, opts) {
  clear(host);
  charts.set(host, { width: host.clientWidth, draw: () => lineChart(host, opts) });
  const pts = opts.points;
  if (!pts.length) { host.appendChild(el("div", { class: "empty", text: opts.empty || "Sem dados." })); return; }
  const W = Math.max(320, Math.round(host.clientWidth || 900)), H = opts.height || 240;
  // the right margin holds the reference label (11px mono, about 6.7px a character)
  const P = { t: 22, r: Math.max(56, opts.reference ? opts.reference.label.length * 6.7 + 16 : 0), b: 30, l: 40 };
  const xs = pts.map((p) => p.x), xmin = Math.min(...xs), xmax = Math.max(...xs);
  const px = (x) => P.l + (xmax === xmin ? 0.5 : (x - xmin) / (xmax - xmin)) * (W - P.l - P.r);
  const py = (v) => H - P.b - ((v - opts.yMin) / (opts.yMax - opts.yMin)) * (H - P.t - P.b);
  const svg = el("svg", { class: "ooyl-chart", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": opts.label });
  for (let v = opts.yMin; v <= opts.yMax + 1e-9; v += opts.yStep) {
    svg.appendChild(el("line", { class: v === opts.yMin ? "axis" : "grid", x1: P.l, x2: W - P.r, y1: py(v), y2: py(v) }));
    svg.appendChild(el("text", { class: "tick", x: P.l - 10, y: py(v) + 4, "text-anchor": "end", text: String(v) }));
  }
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - P.l - P.r) / 30))));
  const lastX = px(pts[pts.length - 1].x);
  pts.forEach((p, i) => {
    const isLast = i === pts.length - 1;
    if (!isLast && (i % every || lastX - px(p.x) < 22)) return;  // the last round always, never crowded
    svg.appendChild(el("text", { class: "tick", x: px(p.x), y: H - 8, "text-anchor": "middle", text: String(p.x) }));
  });
  const last = pts[pts.length - 1];
  const lastBelow = opts.reference && last.y < opts.reference.value;
  if (opts.reference) {  // in the right margin, on the side of the line away from the last point
    const ry = py(opts.reference.value);
    svg.appendChild(el("line", { class: "ref", x1: P.l, x2: W - P.r, y1: ry, y2: ry }));
    svg.appendChild(el("text", { class: "note", x: W - P.r + 8, y: lastBelow ? ry - 7 : ry + 15, text: opts.reference.label }));
  }
  svg.appendChild(el("polyline", { class: "series", points: pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ") }));
  if (opts.dots) pts.forEach((p) => svg.appendChild(el("circle", { class: "point", cx: px(p.x), cy: py(p.y), r: 3.5 })));
  svg.appendChild(el("circle", { class: "halo", cx: px(last.x), cy: py(last.y), r: 11 }));
  svg.appendChild(el("circle", { class: "hl", cx: px(last.x), cy: py(last.y), r: 5 }));
  if (opts.lastLabel) svg.appendChild(el("text", { class: "hl-label", x: px(last.x) + 12, y: py(last.y) + (lastBelow ? 16 : -8), text: opts.lastLabel }));
  const hair = el("line", { class: "hair", y1: P.t, y2: H - P.b, opacity: 0 });
  const dot = el("circle", { class: "hl", r: 5, opacity: 0 });
  svg.appendChild(hair);
  svg.appendChild(dot);
  svg.addEventListener("pointermove", (ev) => {
    const box = svg.getBoundingClientRect();
    const xv = (ev.clientX - box.left) * (W / box.width);
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(px(p.x) - xv); if (d < bd) { bd = d; best = i; } });
    const p = pts[best];
    hair.setAttribute("x1", px(p.x)); hair.setAttribute("x2", px(p.x)); hair.setAttribute("opacity", 1);
    dot.setAttribute("cx", px(p.x)); dot.setAttribute("cy", py(p.y)); dot.setAttribute("opacity", 1);
    showTip(ev.clientX, ev.clientY, p.tip());
  });
  svg.addEventListener("pointerleave", () => { hair.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); hideTip(); });
  host.appendChild(svg);
  charts.get(host).width = host.clientWidth;
}

// A ranking as bars: the leader in accent, the rest in data-context, the value at each tip.
// One image per row, the face or else the badge; the team is written next to the name.
// opts.open gives a row's link; a row it answers null for is not a link.
export function barList(host, rows, opts) {
  clear(host);
  const max = Math.max(1, ...rows.map(opts.value));
  const list = el("ol", { class: "ooyl-bars", "aria-label": opts.label });
  rows.forEach((r, i) => {
    const share = Math.max(0.004, opts.value(r) / max);
    const photo = opts.face ? opts.face(r) : null, badge = opts.logo ? opts.logo(r) : null;
    const href = opts.open ? opts.open(r) : null;
    const open = href ? () => { hideTip(); go(href); } : null;
    const row = el("li", {
      class: "ooyl-bars__row" + (i === 0 ? " is-lead" : "") + (open ? " is-link" : ""), tabindex: open ? "0" : null,
      onclick: open, onkeydown: open ? (ev) => { if (ev.key === "Enter") open(); } : null },
      el("span", { class: "ooyl-bars__rank", text: String(i + 1) }),
      el("span", { class: "ooyl-bars__who" },
        photo ? el("img", { class: "face", src: photo, alt: "", loading: "lazy", width: 22, height: 22 })
          : badge ? el("img", { class: "crest", src: badge, alt: "", loading: "lazy", width: 18, height: 18 }) : null,
        el("b", { text: opts.name(r) }), opts.note ? el("small", { text: opts.note(r) }) : null),
      el("span", { class: "ooyl-bars__track" },
        el("i", { style: `width:calc((100% - 60px) * ${share.toFixed(4)})` }),
        el("span", { class: "ooyl-bars__val", text: opts.text(r) })));
    if (opts.tip) {
      row.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, opts.tip(r)));
      row.addEventListener("pointerleave", hideTip);
    }
    list.appendChild(row);
  });
  host.appendChild(list);
}

// A ranking as dots on a fitted scale (values cluster far from zero), with the reference as a
// dashed line. Gridlines and the reference are drawn in every row, so they stay aligned.
export function dotPlot(host, rows, opts) {
  clear(host);
  const vals = rows.map(opts.value), ref = opts.reference;
  const low = Math.min(...vals, ref ? ref.value : Infinity), high = Math.max(...vals, ref ? ref.value : -Infinity);
  // Scale in tenths, so ticks carry no floating-point error. Ratings span a point or two; the
  // referees' numbers (fouls per match, the first card's minute) need a coarser step.
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => (high - low) * 10 / s <= 10) || 200;
  const floor10 = Math.floor((low * 10 - 0.6) / step) * step;
  const lo10 = low >= 0 ? Math.max(0, floor10) : floor10;  // a count never gets a negative tick
  const hi10 = Math.max(lo10 + step, Math.ceil((high * 10 + 0.6) / step) * step);
  const x = (v) => ((v * 10 - lo10) / (hi10 - lo10)) * 100;
  const ticks = [];
  for (let t = lo10; t <= hi10 + 1e-9; t += step) ticks.push(t / 10);
  const overlay = () => [ticks.map((t) => el("span", { class: "ooyl-dotplot__grid", style: `left:${x(t)}%` })),
    ref ? el("span", { class: "ooyl-dotplot__ref", style: `left:${x(ref.value)}%` }) : null];
  const box = el("div", { class: "ooyl-dotplot", role: "img", "aria-label": opts.label });
  const refLabel = ref ? el("span", { class: "ooyl-dotplot__reflabel", style: `left:${x(ref.value)}%`, text: ref.label }) : null;
  if (ref) box.appendChild(el("div", { class: "ooyl-dotplot__row is-head" }, el("span"), el("span"),
    el("span", { class: "ooyl-dotplot__plot" }, overlay(), refLabel), el("span")));
  rows.forEach((r, i) => {
    const photo = opts.face ? opts.face(r) : null, badge = opts.logo ? opts.logo(r) : null;
    const href = opts.open ? opts.open(r) : null;  // as in barList, null: not a link
    const open = href ? () => { hideTip(); go(href); } : null;
    const row = el("div", {
      class: "ooyl-dotplot__row" + (i === 0 ? " is-lead" : "") + (open ? " is-link" : ""), tabindex: open ? "0" : null,
      onclick: open, onkeydown: open ? (ev) => { if (ev.key === "Enter") open(); } : null },
      el("span", { class: "ooyl-bars__rank", text: String(i + 1) }),
      el("span", { class: "ooyl-bars__who" },
        photo ? el("img", { class: "face", src: photo, alt: "", loading: "lazy", width: 22, height: 22 })
          : badge ? el("img", { class: "crest", src: badge, alt: "", loading: "lazy", width: 18, height: 18 }) : null,
        el("b", { text: opts.name(r) }), opts.note ? el("small", { text: opts.note(r) }) : null),
      el("span", { class: "ooyl-dotplot__plot is-track" }, overlay(),
        el("i", { class: "ooyl-dotplot__dot", style: `left:${x(opts.value(r))}%` })),
      el("span", { class: "ooyl-dotplot__val", text: fmt(opts.value(r), opts.digits || 0) }));
    if (opts.tip) {
      row.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, opts.tip(r)));
      row.addEventListener("pointerleave", hideTip);
    }
    box.appendChild(row);
  });
  const labels = ticks.map((t) => el("span", { class: "ooyl-dotplot__tick", style: `left:${x(t)}%`, text: fmt(t, step % 10 ? 1 : 0) }));
  const axis = el("span", { class: "ooyl-dotplot__plot" }, overlay(), labels);
  box.appendChild(el("div", { class: "ooyl-dotplot__row is-axis" }, el("span"), el("span"), axis, el("span")));
  host.appendChild(box);
  // Positions are in %, but what fits is in px: the plot is ~45px wide on a phone, ~540 on a desktop.
  // Tick labels keep 36px apart, the first and the last always, and the reference label goes left
  // of its line when it would run past the box on the right. An observer sets both once laid out and
  // on every size change; refreshCharts() can't: the stats cards draw this before it is on the page.
  const fit = new ResizeObserver(() => {
    if (!box.isConnected) { fit.disconnect(); return; }  // redrawn, or the host shows something else
    const plot = axis.getBoundingClientRect(), edge = box.getBoundingClientRect();
    if (refLabel) {  // + 6: the label's margin from the line
      const line = plot.left + plot.width * x(ref.value) / 100, room = edge.right - line;
      refLabel.classList.toggle("is-left", refLabel.offsetWidth + 6 > room && line - edge.left > room);
    }
    const last = ticks.length - 1, every = Math.ceil(36 * last / plot.width);  // Infinity while hidden
    labels.forEach((node, i) => { node.hidden = i > 0 && i < last && (i % every > 0 || last - i < every); });
  });
  fit.observe(box);
  if (refLabel) fit.observe(refLabel);  // its width changes when the mono webfont arrives
}

// Match odds as one split bar: home, draw, away, with the favourite's number in bold.
export function oddsBar(h, d, a, numbers = true) {
  const v = [h, d, a], fav = v.indexOf(Math.max(...v));
  return el("span", { class: "ooyl-odds", title: numbers ? null : tx("modelo: {casa} · {empate} · {fora}", { casa: pctText(h), empate: pctText(d), fora: pctText(a) }) },
    el("span", { class: "ooyl-odds__bar" },
      el("i", { class: "h", style: `width:${100 * h}%` }), el("i", { class: "d", style: `width:${100 * d}%` }),
      el("i", { class: "a", style: `width:${100 * a}%` })),
    numbers ? el("span", { class: "ooyl-odds__nums" }, v.map((n, i) => el("span", { class: i === fav ? "is-fav" : null, text: pctText(n) }))) : null);
}
