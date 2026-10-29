import { isPositiveIdParameter, proxy } from "../../../_proxy";

// Marca como leído un registro de destinatario. El backend responde 204 sin cuerpo.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isPositiveIdParameter(id)) return Response.json({ error: "id debe ser un ID numérico positivo." }, { status: 400 });
  return proxy(request, `message-recipients/${id}/read`, { method: "POST" });
}
