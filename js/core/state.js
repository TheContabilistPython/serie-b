// What the views share, and how they hear about changes.
//
// Only cross-cutting state lives here: the season payload (/api/index), the view on screen and
// whether the server has the admin panel. Each view keeps its own filters and caches in its module.
// Views subscribe to three events instead of calling each other:
//   "index"  the season payload arrived or was reloaded: redraw what depends on it;
//   "theme"  the edition changed: redraw the charts, whose colours are read at draw time;
//   "view"   a view was put on screen (its name as the argument).

export const state = { index: null, view: "temporada", adminOn: false, playerMap: null };

const handlers = new Map();

export function on(event, handler) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(handler);
}

export function emit(event, ...args) {
  (handlers.get(event) || []).forEach((handler) => handler(...args));
}
