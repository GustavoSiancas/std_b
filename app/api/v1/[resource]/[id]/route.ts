import { forwardUserId } from "../../_user";

const resources = new Set(["users", "departments", "documents", "document-types"]);

function isPositiveId(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

export async function GET(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await context.params;
  if (!resources.has(resource)) return Response.json({ error: "Recurso no disponible." }, { status: 404 });
  if (!isPositiveId(id)) return Response.json({ error: "id debe ser un ID numérico positivo." }, { status: 400 });

  const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const target = new URL(`${base}/api/v1/${resource}/${id}`);
  const userError = forwardUserId(new URL(request.url), target);
  if (userError) return userError;
  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
    });
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "No se pudo consultar el backend. Inténtalo de nuevo." }, { status: 502 });
  }
}
