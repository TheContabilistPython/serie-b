// The JSON API. Every route is /api/<name>[/<id>]; the public copy's shim answers them from files.
import { state, emit } from "./state.js";

// The payload, or an Error carrying the server's own message ({"erro": ...}) or the HTTP status.
export async function getJSON(url) {
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.erro || ("HTTP " + res.status));
    error.status = res.status;
    throw error;
  }
  return payload;
}

// The season payload every view draws from; "index" tells them it changed.
export async function loadIndex() {
  state.index = await getJSON("/api/index");
  state.playerMap = null;
  emit("index");
  return state.index;
}
