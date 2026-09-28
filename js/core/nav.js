// Every link, row and button that opens a page goes through go(): the router answers the hashchange,
// and asking for the hash already on screen still re-runs its route (a click on the open tab redraws it).

export function go(hash) {
  if (location.hash === hash) dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}
