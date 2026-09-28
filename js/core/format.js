// Dates, times and percentages as the page writes them (the page's language, the browser's time zone).
import { fmt } from "./dom.js";
import { LANG, LOCALE, tx } from "./i18n.js";

// Money as a fan reads it: € 16,5 mi and € 970 mil; €16.5m and €970k; 16,5 M€ and 970 mil €.
export const money = (v, digits = 1) => {
  const big = v >= 1e6, n = fmt(big ? v / 1e6 : v / 1e3, big ? digits : 0);
  return LANG === "en" ? `€${n}${big ? "m" : "k"}` : LANG === "es" ? `${n} ${big ? "M€" : "mil €"}` : `€ ${n} ${big ? "mi" : "mil"}`;
};
// Probabilities: "100%", "–" for nothing at all, "<0,1%" for possible but tiny.
export const pctText = (v) => v >= 0.9995 ? "100%" : v <= 0.00005 ? "–" : v < 0.001 ? "<" + fmt(0.1, 1) + "%" : fmt(100 * v, 1) + "%";
export const pct = (v) => v === null || v === undefined ? "-" : fmt(100 * v, 0) + "%";
// SofaScore writes its decimals with a point: English keeps it, Portuguese and Spanish take the comma.
export const decimalComma = (v) => LOCALE === "en-GB" ? String(v ?? "-") : String(v ?? "-").replace(/(\d)\.(\d)/g, "$1,$2");

export const dateOf = (ts) => ts ? new Date(ts * 1000).toLocaleDateString(LOCALE, { day: "2-digit", month: "2-digit" }) : "";
export const timeOf = (ts) => new Date(ts * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
export const weekdayOf = (ts) => new Date(ts * 1000).toLocaleDateString(LOCALE, { weekday: "short" }).replace(".", "");
export const longDay = (ts) => new Date(ts * 1000).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });

// A calendar match without a real date: postponed or canceled (whatever date is on file is the old one).
const UNDATED = new Set(["postponed", "canceled"]);
export const dated = (m) => !!m.timestamp && !UNDATED.has(m.status);

// Calendar days from today, in the browser's time zone: "hoje", "amanhã", "em 9 dias".
export function daysAway(ts) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((day(new Date(ts * 1000)) - day(new Date())) / 864e5);
  return n === 0 ? tx("hoje") : n === 1 ? tx("amanhã") : tx("em {n} dias", { n });
}

// The days a round spans: "2 de outubro", "7 a 8 de outubro", "30 de setembro a 2 de outubro".
export function daySpan(first, last) {
  const a = new Date(first * 1000), b = new Date(last * 1000);
  const long = (d) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "long" });
  if (a.toDateString() === b.toDateString()) return long(a);
  return tx("{de} a {ate}", { de: a.getMonth() === b.getMonth() ? String(a.getDate()) : long(a), ate: long(b) });
}
