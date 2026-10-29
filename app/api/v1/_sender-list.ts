import { forwardUserId } from "./_user";

function isPositiveId(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

const allowed: Record<string, string[]> = {
  procedures: ["page", "page_size", "status", "q"],
  messages: ["page", "page_size", "message_type", "visibility", "procedure_id", "q"],
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isPositiveId(id)) return Response.json({ error: "id debe ser un ID numérico positivo." }, { status: 400 });

  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/^\/api\/v1\/(procedures|messages)\/(by-sender-department|by-sender-user)\//);
  if (!match) return Response.json({ error: "Recurso no disponible." }, { status: 404 });
  const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const source = new URL(request.url);
  const target = new URL(`${base}/api/v1/${match[1]}/${match[2]}/${id}`);
  const userError = forwardUserId(source, target);
  if (userError) return userError;
  for (const key of allowed[match[1]]) {
    const value = source.searchParams.get(key);
    if (value === null || value === "") continue;
    if (key === "page" && !isPositiveId(value)) return Response.json({ error: "page debe ser un entero positivo." }, { status: 400 });
    if (key === "page_size" && (!isPositiveId(value) || Number(value) > 100)) return Response.json({ error: "page_size debe estar entre 1 y 100." }, { status: 400 });
    if (key === "procedure_id" && !isPositiveId(value)) return Response.json({ error: "procedure_id debe ser un ID numérico positivo." }, { status: 400 });
    target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No se pudo consultar el backend. Inténtalo de nuevo." }, { status: 502 });
  }
}
