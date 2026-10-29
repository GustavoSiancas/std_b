"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatDateTime, normalizeMessage, normalizeRelation, relationLabels, type Message, type MessageRelation } from "../lib/messages";
import { ArrowLeft, Building2, CheckCheck, ChevronRight, GitBranch, MailOpen, RotateCw, User } from "lucide-react";

type Area = { id: number; name: string; code: string };
// Registro de destinatario pendiente: GET /message-recipients solo devuelve status UNREAD.
type Pending = { id: number; message_id: number; recipient_id: number | null; department_id: number | null; type: string; status: string; subject: string; created_at?: string };
type PendingPage = { data: Pending[] | null; total: number; page: number; page_size: number };
type History = { messages: Message[]; relations: MessageRelation[] };
type Reader = {
  item: Pending;
  loading: boolean;
  error: string;
  message: Message | null;
  senderArea: string;
  history: History | null;
  historyError: string;
};
type ReadState = "pending" | "done" | "failed";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { cache: "no-store", ...init });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = response.status === 403 ? "No tienes acceso a este mensaje." : response.status === 404 ? "El mensaje ya no está disponible." : "No se pudo consultar el servidor.";
    throw new Error((data as { error?: string }).error || fallback);
  }
  return data as T;
}

function errorText(cause: unknown, fallback: string) {
  if (cause instanceof DOMException && cause.name === "AbortError") return "";
  return cause instanceof Error ? cause.message : fallback;
}

export default function PendingMessages({ areas, onCountChange }: { areas: Area[]; onCountChange: (count: number) => void }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<PendingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reader, setReader] = useState<Reader | null>(null);
  const [reads, setReads] = useState<Record<number, ReadState>>({});
  const controller = useRef<AbortController | null>(null);
  const [areaNames, setAreaNames] = useState<Record<number, string>>({});
  const items = result?.data ?? [];
  const readCount = Object.values(reads).filter(state => state === "done").length;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / (result.page_size || size))) : 1;

  useEffect(() => {
    const list = new AbortController();
    call<PendingPage>(`/api/v1/message-recipients?page=${page}&page_size=${size}`, { signal: list.signal })
      .then(data => {
        if (list.signal.aborted) return;
        if ((data.data !== null && !Array.isArray(data.data)) || !Number.isInteger(data.total)) throw new Error("El listado recibido no es válido.");
        setResult({ ...data, data: data.data ?? [] }); setError("");
      })
      .catch(cause => { if (!list.signal.aborted) setError(errorText(cause, "No se pudieron cargar los mensajes pendientes.")); })
      .finally(() => { if (!list.signal.aborted) setLoading(false); });
    return () => list.abort();
  }, [page, size, refresh]);

  // El contador del sidebar descuenta los mensajes leídos en esta sesión.
  useEffect(() => { if (result) onCountChange(Math.max(0, result.total - readCount)); }, [result, readCount, onCountChange]);

  useEffect(() => () => controller.current?.abort(), []);

  function reload(next: () => void) { setLoading(true); setError(""); next(); }

  function areaName(id: number | null | undefined) {
    if (!id) return "";
    return areas.find(area => area.id === id)?.name ?? areaNames[id] ?? `Área #${id}`;
  }

  async function markRead(item: Pending) {
    setReads(current => ({ ...current, [item.id]: "pending" }));
    try {
      await call(`/api/v1/message-recipients/${item.id}/read`, { method: "POST" });
      setReads(current => ({ ...current, [item.id]: "done" }));
    } catch {
      setReads(current => ({ ...current, [item.id]: "failed" }));
    }
  }

  // Abre el mensaje: carga contenido e historial, y registra la lectura cuando el contenido llegó.
  async function open(item: Pending) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const { signal } = current;
    setReader({ item, loading: true, error: "", message: null, senderArea: "", history: null, historyError: "" });
    const history = call<{ messages?: unknown[]; relations?: unknown[] }>(`/api/v1/messages/${item.message_id}/history`, { signal })
      .then(data => ({
        messages: (Array.isArray(data.messages) ? data.messages : []).map(normalizeMessage).filter(message => message.id),
        relations: (Array.isArray(data.relations) ? data.relations : []).map(normalizeRelation).filter((relation): relation is MessageRelation => relation !== null),
      }));
    try {
      const message = normalizeMessage(await call<unknown>(`/api/v1/messages/${item.message_id}`, { signal }));
      if (!message.id) throw new Error("El mensaje recibido no es válido.");
      let senderArea = "";
      const departmentId = message.sender_department_id;
      if (departmentId) {
        senderArea = areaName(departmentId);
        if (!areas.some(area => area.id === departmentId) && !areaNames[departmentId]) {
          const department = await call<{ name?: string }>(`/api/v1/departments/${departmentId}`, { signal }).catch(() => null);
          if (department?.name) { const name = department.name; setAreaNames(current => ({ ...current, [departmentId]: name })); senderArea = name; }
        }
      }
      if (signal.aborted) return;
      setReader(previous => previous && previous.item.id === item.id ? { ...previous, loading: false, message, senderArea } : previous);
      if (reads[item.id] !== "done") void markRead(item);
    } catch (cause) {
      const text = errorText(cause, "No se pudo abrir el mensaje.");
      if (!signal.aborted && text) setReader(previous => previous && previous.item.id === item.id ? { ...previous, loading: false, error: text } : previous);
      return;
    }
    try {
      const data = await history;
      if (!signal.aborted) setReader(previous => previous && previous.item.id === item.id ? { ...previous, history: data } : previous);
    } catch (cause) {
      const text = errorText(cause, "No se pudo cargar el historial.");
      if (!signal.aborted && text) setReader(previous => previous && previous.item.id === item.id ? { ...previous, historyError: text } : previous);
    }
  }

  const remaining = result ? Math.max(0, result.total - readCount) : 0;

  return <section className="documents-content directory cx pm">
    <header className="cx-header">
      <div>
        <span className="eyebrow">Bandeja</span>
        <h1>Pendientes</h1>
        <p className="directory-description">Mensajes sin leer dirigidos a ti o a tus áreas. Al abrir uno se marca como leído.</p>
      </div>
      <button className="outline-button pm-refresh" disabled={loading} onClick={() => reload(() => setRefresh(value => value + 1))}><RotateCw size={14} /> Actualizar</button>
    </header>

    <div className="pm-layout" data-reading={reader ? "true" : undefined}>
      <section className="directory-panel pm-list" aria-label="Mensajes pendientes">
        <div className="pm-list-head"><strong>{loading ? "Cargando…" : error ? "—" : remaining === 1 ? "1 sin leer" : `${remaining} sin leer`}</strong></div>
        <div aria-live="polite" aria-busy={loading}>
          {loading ? <div className="cx-skeleton" aria-label="Cargando">{Array.from({ length: 5 }, (_, index) => <div key={index}><span /><span /><span /></div>)}</div>
            : error ? <div className="table-message" role="alert"><p>{error}</p><button className="outline-button" onClick={() => reload(() => setRefresh(value => value + 1))}><RotateCw size={14} /> Reintentar</button></div>
            : !items.length ? <div className="table-message"><CheckCheck size={32} /><h2>Todo al día</h2><p>No tienes mensajes pendientes de lectura.</p></div>
            : <ul className="pm-items">{items.map(item => {
                const read = reads[item.id] === "done";
                return <li key={item.id}><button type="button" className={`pm-item${read ? " is-read" : ""}`} aria-current={reader?.item.id === item.id ? "true" : undefined} onClick={() => void open(item)}>
                  <span className="pm-dot" aria-hidden="true" />
                  <span className="pm-item-main">
                    <strong>{item.subject || "(Sin asunto)"}</strong>
                    <span className="pm-item-meta">
                      {item.recipient_id ? <><User size={12} /> Para ti</> : <><Building2 size={12} /> {areaName(item.department_id)}</>}
                      <span className="pm-type">{item.type === "CC" ? "CC" : "Para"}</span>
                      {read && <span className="pm-read-tag">Leído</span>}
                    </span>
                  </span>
                  <span className="pm-item-date">{formatDateTime(item.created_at)}</span>
                  <ChevronRight size={15} className="pm-chevron" />
                </button></li>;
              })}</ul>}
        </div>
        <footer className="pagination">
          <label>Por página<select value={size} onChange={event => reload(() => { setSize(Number(event.target.value)); setPage(1); })}>{[10, 20, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label>
          <div>
            <button className="outline-button" disabled={loading || !!error || page <= 1} onClick={() => reload(() => setPage(value => value - 1))}>Anterior</button>
            <span className="cx-page">{result?.total ? `${result.page} / ${totalPages}` : ""}</span>
            <button className="outline-button" disabled={loading || !!error || !result || page >= totalPages} onClick={() => reload(() => setPage(value => value + 1))}>Siguiente</button>
          </div>
        </footer>
      </section>

      <section className="directory-panel pm-reader" aria-label="Lectura del mensaje" aria-busy={reader?.loading}>
        {!reader ? <div className="table-message pm-empty"><MailOpen size={34} /><h2>Selecciona un mensaje</h2><p>Su contenido y su historial aparecerán aquí.</p></div>
          : <MessageReader reader={reader} readState={reads[reader.item.id]} areaName={areaName}
              onBack={() => { controller.current?.abort(); setReader(null); }}
              onRetry={() => void open(reader.item)} onRetryRead={() => void markRead(reader.item)} />}
      </section>
    </div>
  </section>;
}

function MessageReader({ reader, readState, areaName, onBack, onRetry, onRetryRead }: { reader: Reader; readState?: ReadState; areaName: (id: number | null | undefined) => string; onBack: () => void; onRetry: () => void; onRetryRead: () => void }) {
  const { item, message } = reader;
  return <article className="pm-article">
    <button type="button" className="cx-back pm-back" onClick={onBack}><ArrowLeft size={15} /> Volver a pendientes</button>
    {reader.loading ? <div className="pm-reader-skeleton" aria-label="Cargando mensaje"><span /><span /><span /><span /></div>
      : reader.error ? <div className="table-message" role="alert"><p>{reader.error}</p><button className="outline-button" onClick={onRetry}><RotateCw size={14} /> Reintentar</button></div>
      : message && <>
        <header className="pm-article-head">
          <div className="pm-tags">
            <span className="cx-tag">{message.message_type === "DEPARTMENT" ? "Mensaje de área" : "Mensaje personal"}</span>
            <span className="pm-type">{item.type === "CC" ? "Recibido en CC" : "Recibido como Para"}</span>
          </div>
          <h2>{message.subject || "(Sin asunto)"}</h2>
          <dl className="pm-facts">
            <div><dt>De</dt><dd>{message.sender_department_id ? <><Building2 size={13} /> {reader.senderArea || areaName(message.sender_department_id)}</> : <><User size={13} /> Remitente personal</>}</dd></div>
            <div><dt>Para</dt><dd>{item.recipient_id ? "Ti" : areaName(item.department_id)}</dd></div>
            <div><dt>Fecha</dt><dd>{formatDateTime(message.sent_at || message.created_at)}</dd></div>
          </dl>
          <p className="pm-read-state" role="status">
            {readState === "done" ? <><CheckCheck size={14} /> Marcado como leído</>
              : readState === "failed" ? <>No se pudo marcar como leído. <button type="button" className="text-button" onClick={onRetryRead}>Reintentar</button></>
              : <>Marcando como leído…</>}
          </p>
        </header>
        <div className="pm-body">{message.body || <span className="muted">Sin contenido.</span>}</div>
        <ThreadHistory reader={reader} />
      </>}
  </article>;
}

// Línea del hilo según message_relations: respuestas, reenvíos y referencias.
function ThreadHistory({ reader }: { reader: Reader }) {
  const { history, historyError, item } = reader;
  const subjects = new Map(history?.messages.map(message => [message.id, message.subject || "(Sin asunto)"]) ?? []);
  const alone = history && history.messages.length <= 1 && !history.relations.length;
  return <section className="pm-history" aria-label="Historial del mensaje">
    <h3><GitBranch size={14} /> Historial</h3>
    {historyError ? <p className="muted" role="alert">{historyError}</p>
      : !history ? <p className="muted">Cargando historial…</p>
      : alone ? <p className="muted">Este mensaje no tiene respuestas, reenvíos ni referencias.</p>
      : <ol className="pm-timeline">{history.messages.map(message => {
          const current = message.id === item.message_id;
          const links = history.relations.filter(relation => relation.source_message_id === message.id);
          return <li key={message.id} className={current ? "is-current" : undefined}>
            <span className="pm-node" aria-hidden="true" />
            <div className="pm-node-body">
              <div className="pm-node-head">
                <strong>{message.subject || "(Sin asunto)"}</strong>
                {current && <span className="pm-current-tag">Este mensaje</span>}
                <time>{formatDateTime(message.sent_at || message.created_at)}</time>
              </div>
              {links.map(link => <p key={`${link.relation_type}-${link.target_message_id}`} className="pm-link">
                <span className={`pm-relation pm-relation-${link.relation_type.toLowerCase()}`}>{relationLabels[link.relation_type]?.name ?? link.relation_type}</span>
                {relationLabels[link.relation_type]?.verb ?? "Enlaza con"} «{subjects.get(link.target_message_id) ?? `#${link.target_message_id}`}»
              </p>)}
              {!current && message.body && <details><summary>Ver contenido</summary><p className="pm-body pm-body-small">{message.body}</p></details>}
            </div>
          </li>;
        })}</ol>}
  </section>;
}

export function PendingBadge({ count }: { count: number | null }) {
  if (!count) return null;
  return <span className="sb-badge" aria-label={`${count} sin leer`}>{count > 99 ? "99+" : count}</span>;
}
