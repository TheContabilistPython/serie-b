// Out of Your League: the switch between the sites of the domain (the leagues, the scouting, the draft), opened by
// hovering the brand at the top of the page, or by the small button next to it (touch screens, keyboard).
// Each site's publisher puts this file inline in the published page, as it does the visit counter: the root
// publicar.py (Série A), ooyl/publish/export.py (Série B and the engine's other leagues) and
// scouting/publicar.py (scouting and draft). Outside the domain's layout (a local dashboard served at /) it does nothing. A site
// is listed only once its data answer, like the cards of the home page, so a league not yet published stays
// out until it is; the answers are kept for the browser session.
(() => {
  const SITES = [
    { root: "/", name: { pt: "Início", en: "Home", es: "Inicio" }, meta: { pt: "Todos os campeonatos", en: "All leagues", es: "Todos los campeonatos" } },
    { root: "/serie-a/", probe: "api/index.json", name: "Série A", meta: "Brasileirão" },
    { root: "/serie-b/", probe: "api/index.json", name: "Série B", meta: "Brasileirão" },
    { root: "/premier-league/", probe: "api/index.json", name: "Premier League", meta: { pt: "Inglaterra", en: "England", es: "Inglaterra" } },
    { root: "/la-liga/", probe: "api/index.json", name: "La Liga", meta: { pt: "Espanha", en: "Spain", es: "España" } },
    { root: "/scouting/", probe: "api/ligas.json", name: "Scouting",
      meta: { pt: "Ranking, comparação e seleção", en: "Rankings, comparison and line-ups", es: "Ranking, comparación y selección" } },
    { root: "/draft/", probe: "api/ligas.json", name: "Draft",
      meta: { pt: "Monte um time com cartas e jogue a Copa", en: "Build a team of cards and play the cup", es: "Arma un equipo de cartas y juega la copa" } },
  ];
  const here = SITES.find((site) => site.probe && location.pathname.startsWith(site.root));
  const brand = document.querySelector(".ooyl-topbar__brand");
  if (!here || !brand || document.getElementById("ooyl-sites")) return;
  let lang = "pt";
  try { lang = { en: "en", es: "es" }[localStorage.getItem("idioma")] || "pt"; } catch (_) {}
  const say = (text) => (typeof text === "string" ? text : text[lang] || text.pt);
  const LABELS = { pt: ["Trocar de site"], en: ["Switch site"], es: ["Cambiar de sitio"] }[lang];

  const style = document.createElement("style");
  style.textContent = `
.ooyl-sites__toggle { align-self: center; margin-left: -6px; padding: 6px 7px; border: 0; border-radius: 6px; background: none; cursor: pointer;
  color: var(--ink-muted, #7f8995); font: 600 12px/1 var(--font-sans, system-ui, sans-serif); }
.ooyl-sites__toggle:hover, .ooyl-sites__toggle[aria-expanded="true"] { color: var(--ink-strong, #fff); background: var(--surface-hover, #161a20); }
.ooyl-sites__toggle:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 2px #c6f24e); }
.ooyl-sites { position: fixed; z-index: 1000; min-width: 264px; max-width: calc(100vw - 24px); padding: 10px;
  border: 1px solid var(--line-strong, #606a78); border-radius: 10px; background: var(--surface-raised, #1a1f26);
  box-shadow: var(--shadow-pop, 0 12px 32px -8px #000c); }
.ooyl-sites[hidden] { display: none; }
.ooyl-sites__kicker { margin: 2px 10px 8px; font: 600 11px/14px var(--font-sans, system-ui, sans-serif); letter-spacing: .12em;
  text-transform: uppercase; color: var(--accent, #c6f24e); }
.ooyl-sites__item { display: grid; gap: 2px; padding: 8px 10px; border-radius: var(--radius-sm, 6px); text-decoration: none; }
.ooyl-sites__item:hover, .ooyl-sites__item:focus-visible { background: var(--surface-hover, #161a20); outline: none; }
.ooyl-sites__item.is-here, .ooyl-sites__item.is-here:hover { background: var(--action, #c6f24e); }
.ooyl-sites__item.is-here .ooyl-sites__name, .ooyl-sites__item.is-here .ooyl-sites__meta { color: var(--on-action, #0a0c0f); }
.ooyl-sites__name { font: 600 14px/18px var(--font-sans, system-ui, sans-serif); color: var(--ink-strong, #fff); }
.ooyl-sites__meta { font: 400 12px/16px var(--font-sans, system-ui, sans-serif); color: var(--ink-muted, #7f8995); }`;
  document.head.append(style);

  const menu = document.createElement("div");
  menu.className = "ooyl-sites";
  menu.id = "ooyl-sites";
  menu.hidden = true;
  const kicker = document.createElement("p");
  kicker.className = "ooyl-sites__kicker";
  kicker.textContent = "Out of Your League";
  menu.append(kicker);
  const items = SITES.map((site) => {
    const link = document.createElement("a");
    link.className = "ooyl-sites__item" + (site === here ? " is-here" : "");
    link.href = site.root;
    link.hidden = site !== here && !!site.probe;  // a league shows once its data answer
    if (site === here) link.setAttribute("aria-current", "page");
    const name = document.createElement("span"), meta = document.createElement("span");
    name.className = "ooyl-sites__name";
    name.textContent = say(site.name);
    meta.className = "ooyl-sites__meta";
    meta.textContent = say(site.meta);  // the current site is filled with the action colour, as the lit page tab
    link.append(name, meta);
    menu.append(link);
    return link;
  });
  document.body.append(menu);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ooyl-sites__toggle";
  toggle.textContent = "▾";
  toggle.title = LABELS[0];
  toggle.setAttribute("aria-label", LABELS[0]);
  toggle.setAttribute("aria-controls", "ooyl-sites");
  toggle.setAttribute("aria-expanded", "false");
  brand.after(toggle);

  // Which sites answer, asked once per browser session.
  let known = {};
  try { known = JSON.parse(sessionStorage.getItem("ooyl-sites") || "{}"); } catch (_) {}
  SITES.forEach((site, i) => {
    if (!site.probe || site === here) return;
    const show = (ok) => { items[i].hidden = !ok; };
    if (site.root in known) return show(known[site.root]);
    fetch(site.root + site.probe, { method: "HEAD" }).then((res) => res.ok).catch(() => false).then((ok) => {
      known[site.root] = ok;
      try { sessionStorage.setItem("ooyl-sites", JSON.stringify(known)); } catch (_) {}
      show(ok);
    });
  });

  let timer = null;
  const place = () => {
    const box = brand.getBoundingClientRect();
    menu.style.top = `${Math.round(box.bottom + 6)}px`;
    menu.style.left = `${Math.max(12, Math.round(box.left))}px`;
  };
  const open = () => {
    clearTimeout(timer);
    if (!menu.hidden) return;
    place();
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    clearTimeout(timer);
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(close, 220); };
  const hover = matchMedia("(hover: hover)");
  for (const node of [brand, toggle, menu]) {
    node.addEventListener("mouseenter", () => { if (hover.matches) open(); });
    node.addEventListener("mouseleave", () => { if (hover.matches) later(); });
  }
  toggle.addEventListener("click", () => {
    if (menu.hidden) {
      open();
      const first = items.find((link) => !link.hidden);
      if (first) first.focus();
    } else close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !menu.hidden) { close(); toggle.focus(); }
  });
  document.addEventListener("click", (ev) => {
    if (!menu.hidden && !menu.contains(ev.target) && ev.target !== toggle && !brand.contains(ev.target)) close();
  });
  menu.addEventListener("focusout", (ev) => { if (!menu.contains(ev.relatedTarget) && ev.relatedTarget !== toggle) later(); });
  addEventListener("resize", () => { if (!menu.hidden) place(); });
  addEventListener("scroll", () => { if (!menu.hidden) place(); }, { passive: true });
})();
