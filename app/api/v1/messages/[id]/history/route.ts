import { isPositiveIdParameter, proxy } from "../../../_proxy";

// Mensajes conectados por message_relations (REPLY, FORWARD, REFERENCE).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isPositiveIdParameter(id)) return Response.json({ error: "id debe ser un ID numérico positivo." }, { status: 400 });
  return proxy(request, `messages/${id}/history`);
}
