import { forwardUserId } from "../../_user";

export async function GET(request: Request) {
  const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const target = new URL(`${base}/api/v1/departments/organization-chart`);
  const userError = forwardUserId(new URL(request.url), target);
  if (userError) return userError;
  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "No se pudo consultar el organigrama. Inténtalo de nuevo." }, { status: 502 });
  }
}
