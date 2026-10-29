// Proxy del mismo origen para evitar CORS en el navegador.
export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); }
  catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  const { username, password } = (input ?? {}) as Record<string, unknown>;
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    return Response.json({ error: "Usuario y contraseña son obligatorios." }, { status: 400 });
  }
  try {
    const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
    const upstream = await fetch(`${base}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data: unknown = await upstream.json();
    return Response.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No se pudo contactar al servicio de autenticación." }, { status: 502 });
  }
}
