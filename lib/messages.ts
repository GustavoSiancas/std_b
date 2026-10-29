// El backend serializa algunos campos de mensajes sin etiqueta JSON (Subject, Body, MessageType,
// SourceMessageID…). Estas funciones aceptan ambos formatos y devuelven siempre snake_case.

export type Message = {
  id: number;
  created_at?: string;
  created_by?: number;
  sender_user_id?: number | null;
  sender_department_id?: number | null;
  procedure_id?: number | null;
  message_type?: string;
  visibility?: string;
  status?: string;
  subject: string;
  body: string;
  sent_at?: string | null;
};

export type RelationType = "REPLY" | "FORWARD" | "REFERENCE";
export type MessageRelation = { source_message_id: number; target_message_id: number; relation_type: RelationType | string; created_at?: string };

type Raw = Record<string, unknown>;

function pick(raw: Raw, snake: string, pascal: string): unknown {
  return raw[snake] !== undefined ? raw[snake] : raw[pascal];
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function id(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function normalizeMessage(value: unknown): Message {
  const raw = (value && typeof value === "object" ? value : {}) as Raw;
  return {
    id: id(pick(raw, "id", "ID")) ?? 0,
    created_at: optionalText(pick(raw, "created_at", "CreatedAt")),
    created_by: id(pick(raw, "created_by", "CreatedBy")) ?? undefined,
    sender_user_id: id(pick(raw, "sender_user_id", "SenderUserID")),
    sender_department_id: id(pick(raw, "sender_department_id", "DepartmentID")),
    procedure_id: id(pick(raw, "procedure_id", "ProcedureID")),
    message_type: optionalText(pick(raw, "message_type", "MessageType")),
    visibility: optionalText(pick(raw, "visibility", "Visibility")),
    status: optionalText(pick(raw, "status", "Status")),
    subject: text(pick(raw, "subject", "Subject")),
    body: text(pick(raw, "body", "Body")),
    sent_at: optionalText(pick(raw, "sent_at", "SentAt")) ?? null,
  };
}

export function normalizeRelation(value: unknown): MessageRelation | null {
  const raw = (value && typeof value === "object" ? value : {}) as Raw;
  const source = id(pick(raw, "source_message_id", "SourceMessageID"));
  const target = id(pick(raw, "target_message_id", "TargetMessageID"));
  const type = text(pick(raw, "relation_type", "RelationType"));
  if (!source || !target || !type) return null;
  return { source_message_id: source, target_message_id: target, relation_type: type, created_at: optionalText(pick(raw, "created_at", "CreatedAt")) };
}

export const relationLabels: Record<string, { name: string; verb: string }> = {
  REPLY: { name: "Respuesta", verb: "Responde a" },
  FORWARD: { name: "Reenvío", verb: "Reenvía" },
  REFERENCE: { name: "Referencia", verb: "Hace referencia a" },
};

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
