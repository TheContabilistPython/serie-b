// The page in Portuguese, English or Spanish, as on the Série A page. The code's text is Portuguese and is its
// own key: tx() looks it up in idiomas/{en,es}.json (fetched before the first render, and only for those two)
// and falls back to it; its {slots} take the values, and txn() lets them be nodes (a bold number inside a
// sentence). el() puts every plain text it is handed through the dictionary, so a fixed label needs only its
// entry there, and translateStatic() does the page's fixed markup. Team and player names are never entries.
// The language comes from ?lang=, else this browser's last choice (the "idioma" key every page of the site
// shares), else Portuguese; numbers, dates and ordinals follow it. Nothing here imports the rest of the page.

export const LOCALES = { pt: "pt-BR", en: "en-GB", es: "es-ES" };
export const LANG = (() => {
  let chosen = new URLSearchParams(location.search).get("lang");
  try {
    if (LOCALES[chosen]) localStorage.setItem("idioma", chosen);
    else chosen = localStorage.getItem("idioma");
  } catch (_) { /* storage off: the address alone decides */ }
  return LOCALES[chosen] ? chosen : "pt";
})();
export const LOCALE = LOCALES[LANG];

let DICT = {};  // Portuguese -> this language, from idiomas/{LANG}.json

export const tx = (text, vars) => {
  const out = (LANG !== "pt" && typeof text === "string" && DICT[text]) || text;
  return vars ? out.replace(/\{(\w+)\}/g, (slot, key) => (key in vars ? vars[key] : slot)) : out;
};
export const txn = (text, vars) => tx(text).split(/(\{\w+\})/).filter(Boolean).map((piece) => {
  const slot = /^\{(\w+)\}$/.exec(piece);
  return slot && slot[1] in vars ? vars[slot[1]] : piece;
});
// 17º, 17th, 17.º
export const ord = (n) => (LANG === "en" ? n + ((n % 100 > 10 && n % 100 < 14) ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th")
  : LANG === "es" ? n + ".º" : n + "º");

export function loadDictionary() {
  if (LANG === "pt") return Promise.resolve();
  return fetch(`idiomas/${LANG}.json`).then((res) => (res.ok ? res.json() : {})).then((dict) => { DICT = dict || {}; })
    .catch(() => { /* no dictionary: the page stays in Portuguese */ });
}

// The page's fixed markup (the header, each section's title and note): its texts and labels, whitespace folded.
export function translateStatic(root = document.body) {
  document.documentElement.lang = LOCALE;
  if (LANG === "pt") return;
  document.title = tx(document.title);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.replace(/\s+/g, " ").trim();
    if (text && DICT[text]) node.nodeValue = node.nodeValue.match(/^\s*/)[0] + DICT[text] + node.nodeValue.match(/\s*$/)[0];
  }
  root.querySelectorAll("[title], [aria-label], [placeholder]").forEach((node) => ["title", "aria-label", "placeholder"]
    .forEach((name) => { const v = node.getAttribute(name); if (v && DICT[v]) node.setAttribute(name, DICT[v]); }));
}

export function chooseLanguage(lang) {
  try { localStorage.setItem("idioma", lang); } catch (_) { /* off: the address carries it */ }
  const url = new URL(location.href);
  if (lang === "pt") url.searchParams.delete("lang"); else url.searchParams.set("lang", lang);
  location.replace(url.href);
}
