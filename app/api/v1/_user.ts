// Reenvía user_id del cliente al backend. Devuelve un error 400 si no es un ID válido.
export function forwardUserId(source: URL, target: URL): Response | null {
  const value = source.searchParams.get("user_id");
  if (value === null || value === "") return null;
  if (!/^[1-9]\d*$/.test(value)) return Response.json({ error: "user_id debe ser un ID numérico positivo." }, { status: 400 });
  target.searchParams.set("user_id", value);
  return null;
}
