// Cliente único para /api/v1: agrega user_id (el user.id del login) a todas las peticiones.
// El backend lo exige en GETs, bandejas y acciones; sin él toma el usuario 0 y responde 403.
let sessionUserId: number | null = null;

export function setSessionUser(id: number | null) {
  sessionUserId = id !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function apiUrl(path: string): string {
  if (sessionUserId === null || !path.startsWith("/api/v1/")) return path;
  const [base, hash = ""] = path.split("#");
  const url = new URL(base, "http://local");
  url.searchParams.set("user_id", String(sessionUserId));
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
