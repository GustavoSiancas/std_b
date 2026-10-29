import { isPositiveIdParameter, proxy } from "../_proxy";

// Mensajes pendientes de lectura del usuario (solo status UNREAD).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = params.get("page");
  const size = params.get("page_size");
  if (page && !isPositiveIdParameter(page)) return Response.json({ error: "page debe ser un entero positivo." }, { status: 400 });
  if (size && (!isPositiveIdParameter(size) || Number(size) > 100)) return Response.json({ error: "page_size debe estar entre 1 y 100." }, { status: 400 });
  return proxy(request, "message-recipients", { params: ["page", "page_size"] });
}
