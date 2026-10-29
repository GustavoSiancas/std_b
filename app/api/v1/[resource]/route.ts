import { forwardUserId } from "../_user";

const allowed: Record<string, string[]> = {
  users: ["page", "page_size", "q", "department_id", "admin", "is_active"],
  departments: ["page", "page_size", "q", "is_active"],
  documents: ["page", "page_size", "q", "document_type_id", "department_id", "created_by", "year", "sort_by", "order"],
  "document-types": ["page", "page_size", "q", "is_active", "has_correlative", "sort_by", "order"],
  procedures: ["page", "page_size", "q", "status"],
  messages: ["page", "page_size", "q", "message_type", "visibility", "procedure_id"],
};

const identifierFields: Record<string, string[]> = {
  users: ["department_id"],
  departments: [],
  documents: ["document_type_id", "department_id", "created_by"],
  procedures: ["created_by"],
  messages: ["created_by"],
  "document-types": [],
};

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPositiveIdParameter(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

function isIdList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isPositiveId);
}

// PERSONAL: el remitente es created_by. DEPARTMENT: requiere sender_department_id.
function validateSenderPayload(resource: "procedures" | "messages", payload: Record<string, unknown>): string | null {
  const typeField = resource === "procedures" ? "procedure_type" : "message_type";
  const type = payload[typeField];
  if (type !== "PERSONAL" && type !== "DEPARTMENT") return `${typeField} debe ser PERSONAL o DEPARTMENT.`;
  if (type === "DEPARTMENT" && !isPositiveId(payload.sender_department_id)) return "sender_department_id debe ser un ID numérico positivo.";
  if (type === "PERSONAL") delete payload.sender_department_id;
  if (resource === "procedures") {
    if (typeof payload.name !== "string" || !payload.name.trim()) return "name es obligatorio.";
    if (typeof payload.description !== "string" || !payload.description.trim()) return "description es obligatoria.";
    return null;
  }
  if (payload.procedure_id !== undefined && payload.procedure_id !== null && !isPositiveId(payload.procedure_id)) return "procedure_id debe ser un ID numérico positivo.";
  if (payload.procedure_id === null) delete payload.procedure_id;
  for (const field of ["subject", "body", "visibility"]) {
    if (typeof payload[field] !== "string" || !(payload[field] as string).trim()) return `${field} es obligatorio.`;
  }
  // BORRADOR guarda sin destinatarios ni adjuntos; HECHO envía el mensaje.
  if (payload.status !== "BORRADOR" && payload.status !== "HECHO") return "status debe ser BORRADOR o HECHO.";
  const draft = payload.status === "BORRADOR";
  const recipients = payload.recipients;
  if (recipients === undefined && draft) delete payload.recipients;
  else {
    if (!Array.isArray(recipients) || (!draft && !recipients.length)) return "recipients debe incluir al menos un destinatario.";
    // Cada destinatario es un usuario (recipient_id) o un área (department_id), en TO o CC.
    const normalized: Record<string, unknown>[] = [];
    for (const item of recipients) {
      const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const keys = ["recipient_id", "department_id"].filter(key => entry[key] !== undefined && entry[key] !== null);
      if (keys.length !== 1 || !isPositiveId(entry[keys[0]]) || (entry.type !== "TO" && entry.type !== "CC")) {
        return "Cada destinatario debe tener recipient_id o department_id numérico positivo y type TO o CC.";
      }
      normalized.push({ [keys[0]]: entry[keys[0]], type: entry.type });
    }
    if (!draft && !normalized.some(item => item.type === "TO")) return "Incluye al menos un destinatario en TO.";
    payload.recipients = normalized;
  }
  if (payload.document_ids === undefined) { if (!draft) payload.document_ids = []; }
  else if (!isIdList(payload.document_ids)) return "document_ids debe ser una lista de IDs numéricos positivos.";
  return null;
}

export async function POST(request: Request) {
  const resource = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!["users", "departments", "documents", "procedures", "messages"].includes(resource)) return Response.json({ error: "Recurso no disponible." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Se esperaba un objeto JSON." }, { status: 400 });
  const fields = resource === "users" ? ["name", "email", "username", "password", "department_id"] : resource === "documents" ? ["document_type_id", "department_id", "created_by", "name", "description", "file_url"] : resource === "procedures" ? ["name", "description", "procedure_type", "sender_department_id", "created_by"] : resource === "messages" ? ["created_by", "message_type", "sender_department_id", "procedure_id", "visibility", "status", "subject", "body", "recipients", "document_ids"] : ["name", "code", "parent_id"];
  const payload = Object.fromEntries(fields.filter(key => Object.hasOwn(body, key)).map(key => [key, (body as Record<string, unknown>)[key]]));
  for (const field of identifierFields[resource]) {
    if (!isPositiveId(payload[field])) return Response.json({ error: `${field} debe ser un ID numérico positivo.` }, { status: 400 });
  }
  if (resource === "procedures" || resource === "messages") {
    const error = validateSenderPayload(resource, payload);
    if (error) return Response.json({ error }, { status: 400 });
  }
  if (resource === "departments" && payload.parent_id !== undefined && payload.parent_id !== null && !isPositiveId(payload.parent_id)) {
    return Response.json({ error: "parent_id debe ser un ID numérico positivo o null." }, { status: 400 });
  }
  try {
    const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
    const target = new URL(`${base}/api/v1/${resource}`);
    const userError = forwardUserId(new URL(request.url), target);
    if (userError) return userError;
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No se pudo confirmar la creación. Revisa el listado antes de volver a guardar." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const resource = url.pathname.split("/").pop() ?? "";
  if (!Object.hasOwn(allowed, resource)) return Response.json({ error: "Recurso no disponible." }, { status: 404 });
  const base = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  const target = new URL(`${base}/api/v1/${resource}`);
  const userError = forwardUserId(url, target);
  if (userError) return userError;
  for (const key of allowed[resource]) {
    const value = url.searchParams.get(key);
    if (value !== null && identifierFields[resource].includes(key) && !isPositiveIdParameter(value)) {
      return Response.json({ error: `${key} debe ser un ID numérico positivo.` }, { status: 400 });
    }
    if (value !== null && value !== "") target.searchParams.set(key, value);
  }
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
