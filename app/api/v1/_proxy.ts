import { forwardUserId } from "./_user";

export function isPositiveIdParameter(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

// Reenvía la petición al backend con user_id y los parámetros permitidos.
// Acepta respuestas sin cuerpo (204), como la de marcar un mensaje como leído.
export async function proxy(request: Request, path: string, options: { method?: "GET" | "POST"; params?: string[] } = {}) {
  const method = options.method ?? "GET";
  const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const source = new URL(request.url);
  const target = new URL(`${base}/api/v1/${path}`);
  const userError = forwardUserId(source, target);
  if (userError) return userError;
  for (const key of options.params ?? []) {
    const value = source.searchParams.get(key);
    if (value !== null && value !== "") target.searchParams.set(key, value);
  }
  const headers = { "Cache-Control": "no-store" };
  try {
    const response = await fetch(target, {
      method,
      cache: "no-store",
      // Una escritura no se cancela si el usuario cambia de pantalla.
      signal: method === "GET" ? AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(15000),
    });
    if (response.status === 204) return new Response(null, { status: 204, headers });
    const text = await response.text();
    let data: unknown = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch {
      // Un 404 en texto plano indica que el backend en ejecución aún no tiene esta ruta.
      const error = response.status === 404 ? "Esta función aún no está disponible en el servidor." : "El servidor devolvió una respuesta no válida.";
      return Response.json({ error }, { status: response.ok ? 502 : response.status, headers });
    }
    return Response.json(data, { status: response.status, headers });
  } catch {
    const error = method === "GET" ? "No se pudo consultar el backend. Inténtalo de nuevo." : "No se pudo confirmar la operación. Inténtalo de nuevo.";
    return Response.json({ error }, { status: 502 });
  }
}
