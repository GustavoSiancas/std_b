"use client";

import { FormEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { normalizeMessage } from "../lib/messages";
import { ArrowLeft, Building2, CheckCircle2, FileStack, FolderOpen, Hash, Mail, Plus, RotateCw, Save, Search, Send, User, X } from "lucide-react";

export type Scope = "area" | "personal";
export type Kind = "procedures" | "messages";
type Area = { id: number; name: string; code: string };
type Procedure = { id: number; procedure_number?: string; name: string; description?: string; procedure_type: string; status: string; created_at?: string };
type Message = { id?: number; status?: string; subject?: string; body?: string; message_type?: string; visibility?: string; procedure_id?: number | null; created_at?: string };
type SenderPage<T> = { data: T[]; total: number; page: number; page_size: number };
type Option = { id: number; name: string; detail?: string };

// Todos los endpoints son públicos: no se envían tokens, solo IDs numéricos.
async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await apiFetch(path, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = response.status === 403 ? "No tienes el rol requerido para representar a esta área." : "No se pudo completar la operación.";
    throw new Error((data as { error?: string; message?: string }).error || (data as { message?: string }).message || fallback);
  }
  return { status: response.status, data: data as T };
}

function senderPath(kind: Kind, scope: Scope, senderId: number) {
  return `/api/v1/${kind}/${scope === "area" ? "by-sender-department" : "by-sender-user"}/${senderId}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

// procedure_number es el código visible; id solo se usa para la API.
function procedureCode(item: Pick<Procedure, "id" | "procedure_number">) {
  return item.procedure_number || `#${item.id}`;
}

function submitError(cause: unknown, fallback: string) {
  if (cause instanceof TypeError) return "Se perdió la conexión. Revisa el listado antes de volver a guardar.";
  return cause instanceof Error ? cause.message : fallback;
}

const statusFilters = [{ value: "", label: "Todos" }, { value: "OPEN", label: "Abiertos" }, { value: "CLOSED", label: "Cerrados" }];
const statusLabels: Record<string, string> = { OPEN: "Abierto", CLOSED: "Cerrado" };

// Carga los trámites de un remitente (para selectores y para mostrar procedure_number en mensajes).
function useProcedures(scope: Scope, senderId: number | null, openOnly: boolean) {
  const [state, setState] = useState<{ key: string; items: Procedure[]; failed: boolean }>({ key: "", items: [], failed: false });
  const key = `${scope}-${senderId}-${openOnly}`;
  useEffect(() => {
    if (!senderId) return;
    const controller = new AbortController();
    request<SenderPage<Procedure>>(`${senderPath("procedures", scope, senderId)}?page=1&page_size=100${openOnly ? "&status=OPEN" : ""}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setState({ key, items: Array.isArray(data.data) ? data.data : [], failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, items: [], failed: true }); });
    return () => controller.abort();
  }, [scope, senderId, openOnly, key]);
  return state.key === key ? state : { items: [] as Procedure[], failed: false };
}

export default function Correspondence({ scope, kind, userId, areas, areaLoading, areaError, createRequest, onRetryAreas }: {
  scope: Scope; kind: Kind; userId: number; areas: Area[]; areaLoading: boolean; areaError: string; createRequest: number; onRetryAreas: () => void;
}) {
  const [chosenArea, setAreaId] = useState<number | null>(null);
  const areaId = areas.some(area => area.id === chosenArea) ? chosenArea : areas[0]?.id ?? null;
  const [filters, setFilters] = useState({ page: 1, size: 20, q: "", status: "", procedureId: "" });
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<SenderPage<Procedure | Message> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  // createRequest sube cada vez que se elige "Crear" en el sidebar.
  const [manualCreating, setManualCreating] = useState(false);
  const [handledRequest, setHandledRequest] = useState(0);
  const creating = manualCreating || createRequest > handledRequest;
  const setCreating = (open: boolean) => { setManualCreating(open); if (!open) setHandledRequest(createRequest); };
  const [notice, setNotice] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);
  const senderId = scope === "area" ? areaId : userId;
  const needsArea = scope === "area" && !areaLoading && (!!areaError || !areas.length);
  const selectedArea = areas.find(area => area.id === areaId);
  const procedures = useProcedures(scope, kind === "messages" ? senderId : null, false);

  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.q === search.trim() ? previous : { ...previous, q: search.trim(), page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!senderId) { setLoading(scope === "area" && areaLoading); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(filters.page), page_size: String(filters.size) });
    if (filters.q) params.set("q", filters.q);
    if (kind === "procedures" && filters.status) params.set("status", filters.status);
    if (kind === "messages") {
      params.set("message_type", scope === "area" ? "DEPARTMENT" : "PERSONAL");
      if (scope === "area") params.set("visibility", "DEPARTMENT");
      if (filters.procedureId) params.set("procedure_id", filters.procedureId);
    }
    request<SenderPage<Procedure | Message>>(`${senderPath(kind, scope, senderId)}?${params}`, { signal: controller.signal })
      .then(({ data }) => {
        // El backend devuelve data: null cuando no hay resultados.
        const items = data.data ?? [];
        if (!Array.isArray(items) || !Number.isInteger(data.total)) throw new Error("El listado recibido no es válido.");
        // Los mensajes llegan con campos en PascalCase (Subject, Body…); se normalizan a snake_case.
        if (!controller.signal.aborted) setResult({ ...data, data: kind === "messages" ? items.map(normalizeMessage) : items });
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo consultar el servidor."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, scope, senderId, filters, refresh, areaLoading]);

  const pageSize = result?.page_size || filters.size;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / pageSize)) : 1;
  const from = result && result.total ? (result.page - 1) * pageSize + 1 : 0;
  const to = result ? Math.min(result.total, from + result.data.length - 1) : 0;
  const noun = kind === "procedures" ? "trámites" : "mensajes";
  const procedureForm = kind === "procedures" && creating;
  const hasFilters = !!(filters.q || filters.status || filters.procedureId);
  const resetList = () => { setSearch(""); setFilters(previous => ({ ...previous, page: 1, q: "", status: "", procedureId: "" })); setRefresh(value => value + 1); };
  const startCreating = () => { setNotice(""); setHighlight(null); setCreating(true); };

  return <section className="documents-content directory cx">
    {procedureForm && !needsArea && senderId
      ? <CreateProcedure scope={scope} userId={userId} area={selectedArea} areas={areas} onAreaChange={setAreaId}
          onClose={() => setCreating(false)}
          onCreated={created => { setCreating(false); resetList(); setHighlight(created.id); setNotice(`Trámite ${procedureCode(created)} creado correctamente.`); }} />
      : <>
        <header className="cx-header">
          <div>
            <span className="eyebrow">{scope === "area" ? "Área" : "Personal"}</span>
            <h1>{kind === "procedures" ? "Trámites" : "Mensajes"}</h1>
            <p className="directory-description">{kind === "procedures"
              ? scope === "area" ? "Trámites registrados a nombre de tu área." : "Trámites que registraste a título personal."
              : scope === "area" ? "Mensajes de tu área." : "Tus mensajes personales."}</p>
          </div>
          <button className="primary-button" disabled={!senderId || needsArea} onClick={startCreating}>
            <Plus size={17} /> {kind === "procedures" ? "Crear trámite" : "Crear mensaje"}
          </button>
        </header>

        <SenderBar scope={scope} areas={areas} area={selectedArea} loading={areaLoading} onChange={id => { setAreaId(id); setFilters(previous => ({ ...previous, page: 1, procedureId: "" })); }} />

        {notice && <div className="cx-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={15} /></button></div>}
        {scope === "area" && areaError && <p className="creation-error" role="alert">{areaError} <button className="text-button" onClick={onRetryAreas}>Reintentar</button></p>}
        {scope === "area" && !areaLoading && !areaError && !areas.length && <div className="cx-empty-card"><Building2 size={28} /><h2>Sin áreas asignadas</h2><p>Solicita una asignación para trabajar con {noun} en nombre de un área.</p></div>}

        {!needsArea && <section className="directory-panel">
          <div className="cx-toolbar">
            <label className="cx-search"><span className="sr-only">Buscar</span><Search size={16} />
              <input type="search" placeholder={kind === "procedures" ? "Buscar por número, nombre o descripción" : "Buscar por asunto o contenido"} value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            {kind === "procedures"
              ? <div className="cx-segmented" role="group" aria-label="Filtrar por estado">{statusFilters.map(option => <button type="button" key={option.value} aria-pressed={filters.status === option.value} onClick={() => setFilters(previous => ({ ...previous, status: option.value, page: 1 }))}>{option.label}</button>)}</div>
              : <label className="cx-inline-select">Trámite<select value={filters.procedureId} onChange={event => setFilters(previous => ({ ...previous, procedureId: event.target.value, page: 1 }))}>
                  <option value="">Todos</option>
                  {procedures.items.map(item => <option key={item.id} value={item.id}>{procedureCode(item)} · {item.name}</option>)}
                </select></label>}
          </div>
          <div aria-live="polite" aria-busy={loading}>
            {loading ? <TableSkeleton />
              : error ? <div className="table-message" role="alert"><p>{error}</p><button className="outline-button" onClick={() => setRefresh(value => value + 1)}><RotateCw size={14} /> Reintentar</button></div>
              : !result?.data.length ? <div className="table-message">
                  {kind === "procedures" ? <FileStack size={32} /> : <Mail size={32} />}
                  <h2>{hasFilters ? "Sin resultados" : `Aún no hay ${noun}`}</h2>
                  <p>{hasFilters ? "Prueba con otra búsqueda o quita los filtros." : kind === "procedures" ? "Registra el primer trámite para empezar a darle seguimiento." : "Los mensajes que envíes aparecerán aquí."}</p>
                  {hasFilters ? <button className="outline-button" onClick={resetList}>Quitar filtros</button> : <button className="primary-button" onClick={startCreating}><Plus size={15} /> {kind === "procedures" ? "Crear trámite" : "Crear mensaje"}</button>}
                </div>
              : kind === "procedures" ? <ProcedureTable items={result.data as Procedure[]} highlight={highlight} />
              : <MessageTable items={result.data as Message[]} procedures={procedures.items} />}
          </div>
          <footer className="pagination">
            <label>Por página<select value={filters.size} onChange={event => setFilters(previous => ({ ...previous, size: Number(event.target.value), page: 1 }))}>{[10, 20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
            <span>{!loading && !error && result ? result.total ? `Mostrando ${from}–${to} de ${result.total} ${noun}` : `0 ${noun}` : "—"}</span>
            <div>
              <button className="outline-button" disabled={loading || !!error || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Anterior</button>
              <span className="cx-page">{result?.total ? `${result.page} / ${totalPages}` : ""}</span>
              <button className="outline-button" disabled={loading || !!error || !result || filters.page >= totalPages} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Siguiente</button>
            </div>
          </footer>
        </section>}
      </>}
    {creating && senderId && kind === "messages" && <CreateMessage scope={scope} userId={userId} areas={areas} areaId={areaId}
      onClose={() => setCreating(false)}
      onCreated={action => { setCreating(false); resetList(); setNotice(action === "draft" ? "Borrador guardado correctamente." : "Mensaje enviado correctamente."); }} />}
  </section>;
}

// Muestra a nombre de quién se trabaja; en área permite cambiar de área.
function SenderBar({ scope, areas, area, loading, onChange }: { scope: Scope; areas: Area[]; area?: Area; loading: boolean; onChange: (id: number) => void }) {
  if (scope === "personal") return <div className="cx-sender"><span className="cx-sender-icon"><User size={16} /></span><div><small>Remitente</small><strong>Tú, a título personal</strong></div></div>;
  if (loading) return <div className="cx-sender"><span className="cx-sender-icon"><Building2 size={16} /></span><div><small>Remitente</small><strong>Cargando áreas…</strong></div></div>;
  if (!areas.length) return null;
  return <div className="cx-sender"><span className="cx-sender-icon"><Building2 size={16} /></span>
    <div><small>Área remitente</small>{areas.length > 1
      ? <select aria-label="Área remitente" value={area?.id ?? ""} onChange={event => onChange(Number(event.target.value))}>{areas.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      : <strong>{area?.name}</strong>}</div>
    {area?.code && <span className="cx-code">{area.code}</span>}
  </div>;
}

function TableSkeleton() {
  return <div className="cx-skeleton" aria-label="Cargando">{Array.from({ length: 5 }, (_, index) => <div key={index}><span /><span /><span /></div>)}</div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`cx-status ${status === "OPEN" ? "open" : "closed"}`}>{statusLabels[status] ?? status}</span>;
}

function ProcedureTable({ items, highlight }: { items: Procedure[]; highlight: number | null }) {
  const withDate = items.some(item => item.created_at);
  return <div className="table-scroll"><table className="cx-table">
    <thead><tr><th scope="col">Número</th><th scope="col">Trámite</th><th scope="col">Estado</th>{withDate && <th scope="col">Fecha</th>}</tr></thead>
    <tbody>{items.map(item => <tr key={item.id} className={item.id === highlight ? "is-new" : undefined}>
      <td><span className="cx-number"><Hash size={12} />{procedureCode(item)}</span></td>
      <td className="cx-main"><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}</td>
      <td><StatusBadge status={item.status} /></td>
      {withDate && <td className="cx-date">{formatDate(item.created_at)}</td>}
    </tr>)}</tbody>
  </table></div>;
}

function MessageTable({ items, procedures }: { items: Message[]; procedures: Procedure[] }) {
  const withDate = items.some(item => item.created_at);
  const byId = new Map(procedures.map(item => [item.id, item]));
  return <div className="table-scroll"><table className="cx-table">
    <thead><tr><th scope="col">Mensaje</th><th scope="col">Trámite</th><th scope="col">Visibilidad</th>{withDate && <th scope="col">Fecha</th>}</tr></thead>
    <tbody>{items.map((item, index) => {
      const procedure = item.procedure_id ? byId.get(item.procedure_id) : undefined;
      return <tr key={item.id ?? index}>
        <td className="cx-main"><strong>{item.status === "BORRADOR" && <span className="cx-draft-tag">Borrador</span>}{item.subject || "(Sin asunto)"}</strong>{item.body && <p>{item.body}</p>}</td>
        <td>{item.procedure_id ? <span className="cx-number" title={procedure?.name}><Hash size={12} />{procedure ? procedureCode(procedure) : `#${item.procedure_id}`}</span> : <span className="muted">—</span>}</td>
        <td><span className="cx-tag">{item.visibility === "PRIVATE" ? "Privado" : item.visibility === "DEPARTMENT" ? "Área" : item.visibility ?? "—"}</span></td>
        {withDate && <td className="cx-date">{formatDate(item.created_at)}</td>}
      </tr>;
    })}</tbody>
  </table></div>;
}

// Formulario en la misma página. procedure_number lo genera el backend; aquí solo se explica el formato.
function CreateProcedure({ scope, userId, area, areas, onAreaChange, onClose, onCreated }: { scope: Scope; userId: number; area?: Area; areas: Area[]; onAreaChange: (id: number) => void; onClose: () => void; onCreated: (created: Procedure) => void }) {
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const format = scope === "area" ? `TRAMITE/${area?.code || "SIGLAS"}/n` : "PERSONAL/nn/código";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    if (!name.trim() || !description.trim()) { setError("Ingresa el nombre y la descripción del trámite."); return; }
    const payload: Record<string, unknown> = { name: name.trim(), description: description.trim(), procedure_type: scope === "area" ? "DEPARTMENT" : "PERSONAL", created_by: userId };
    if (scope === "area") {
      if (!area) { setError("Selecciona un área válida."); return; }
      payload.sender_department_id = area.id;
    }
    pending.current = true; setSaving(true); setError("");
    try {
      const { status, data } = await request<Procedure>("/api/v1/procedures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (status !== 201 || !data.id) throw new Error("No se pudo confirmar la creación. Revisa el listado antes de volver a guardar.");
      onCreated(data);
    } catch (cause) { setError(submitError(cause, "No se pudo crear el trámite.")); }
    finally { pending.current = false; setSaving(false); }
  }

  return <>
    <button type="button" className="cx-back" onClick={onClose} disabled={saving}><ArrowLeft size={15} /> Volver a trámites</button>
    <header className="cx-header">
      <div>
        <span className="eyebrow">{scope === "area" ? "Área" : "Personal"}</span>
        <h1>Crear trámite</h1>
        <p className="directory-description">Describe el trámite para que los destinatarios entiendan su contexto y objetivo.</p>
      </div>
    </header>
    <form className="cx-create" onSubmit={submit}>
      <section className="directory-panel cx-form">
        <fieldset disabled={saving}>
          {scope === "area" && areas.length > 1 && <label>Área remitente
            <select value={area?.id ?? ""} onChange={event => onAreaChange(Number(event.target.value))}>{areas.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </label>}
          <label>Nombre <span className="cx-required">*</span>
            <input name="name" required autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Ej.: Compra de equipos" />
            <small>Título corto que identifique el trámite.</small>
          </label>
          <label>Descripción <span className="cx-required">*</span>
            <textarea name="description" rows={6} required value={description} onChange={event => setDescription(event.target.value)} placeholder="Ej.: Solicitud de compra de 10 laptops para el área de Sistemas." />
            <small className="cx-field-meta"><span>Explica de qué trata y cuál es su objetivo.</span><span>{description.trim().length} caracteres</span></small>
          </label>
        </fieldset>
        {error && <p className="creation-error" role="alert">{error}</p>}
        <footer className="create-footer">
          <button type="button" className="outline-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={saving || !name.trim() || !description.trim()}>{saving ? "Guardando…" : "Crear trámite"}</button>
        </footer>
      </section>
      <aside className="cx-summary" aria-label="Resumen del trámite">
        <span className="cx-summary-label">Número de trámite</span>
        <div className="cx-summary-number"><Hash size={16} /><code>{format}</code></div>
        <p>Se genera automáticamente al guardar y no se puede editar. {scope === "area" ? "El correlativo es propio de cada área." : "El correlativo es propio de cada persona."}</p>
        <dl>
          <div><dt>Remitente</dt><dd>{scope === "area" ? area?.name ?? "—" : "Tú, a título personal"}</dd></div>
          <div><dt>Tipo</dt><dd>{scope === "area" ? "Área" : "Personal"}</dd></div>
          <div><dt>Estado inicial</dt><dd><StatusBadge status="OPEN" /></dd></div>
        </dl>
        {(name.trim() || description.trim()) && <div className="cx-preview"><span className="cx-summary-label">Vista previa</span><strong>{name.trim() || "Sin nombre"}</strong><p>{description.trim() || "Sin descripción"}</p></div>}
      </aside>
    </form>
  </>;
}

function useModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return dialog;
}

type MessageAction = "draft" | "send";
type RecipientKind = "user" | "department";
type RecipientType = "TO" | "CC";
type Recipient = Option & { kind: RecipientKind; type: RecipientType };

// Área: message_type DEPARTMENT con sender_department_id. Personal: message_type PERSONAL.
// «Guardar borrador» envía status BORRADOR sin destinatarios ni adjuntos; «Enviar» envía status HECHO con todo.
function CreateMessage({ scope, userId, areas, areaId, onClose, onCreated }: { scope: Scope; userId: number; areas: Area[]; areaId: number | null; onClose: () => void; onCreated: (action: MessageAction) => void }) {
  const dialog = useModal();
  const pending = useRef(false);
  const onCancel = (event: SyntheticEvent) => { event.preventDefault(); if (!pending.current) onClose(); };
  const [saving, setSaving] = useState<MessageAction | null>(null);
  const [error, setError] = useState("");
  const [senderArea, setSenderArea] = useState<number | null>(areaId);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [documentIds, setDocumentIds] = useState<number[]>([]);
  const busy = saving !== null;
  const hasContent = !!subject.trim() && !!body.trim();
  const hasTo = recipients.some(item => item.type === "TO");
  const losesExtras = !!recipients.length || !!documentIds.length;

  async function save(action: MessageAction) {
    if (pending.current) return;
    if (!hasContent) { setError("Ingresa el asunto y el contenido."); return; }
    if (action === "send" && !hasTo) { setError("Agrega al menos un destinatario en «Para»."); return; }
    const payload: Record<string, unknown> = {
      created_by: userId,
      message_type: scope === "area" ? "DEPARTMENT" : "PERSONAL",
      visibility: scope === "area" ? "DEPARTMENT" : "PRIVATE",
      status: action === "draft" ? "BORRADOR" : "HECHO",
      subject: subject.trim(), body: body.trim(),
    };
    if (scope === "area") {
      if (!senderArea) { setError("Selecciona un área válida."); return; }
      payload.sender_department_id = senderArea;
    }
    if (action === "send") {
      payload.recipients = recipients.map(item => ({ [item.kind === "user" ? "recipient_id" : "department_id"]: item.id, type: item.type }));
      payload.document_ids = documentIds;
    }
    pending.current = true; setSaving(action); setError("");
    try {
      const { status } = await request("/api/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (status !== 201) throw new Error("No se pudo confirmar la operación. Revisa el listado antes de volver a intentarlo.");
      onCreated(action);
    } catch (cause) { setError(submitError(cause, action === "draft" ? "No se pudo guardar el borrador." : "No se pudo enviar el mensaje.")); }
    finally { pending.current = false; setSaving(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void save(submitter?.value === "draft" ? "draft" : "send");
  }

  return <dialog ref={dialog} className="create-dialog cx-dialog" aria-labelledby="message-title" onCancel={onCancel}><form onSubmit={submit} noValidate>
    <div className="create-heading"><div><span className="eyebrow">{scope === "area" ? "Mensaje de área" : "Mensaje personal"}</span><h2 id="message-title">Crear mensaje</h2></div><button className="outline-button" type="button" disabled={busy} onClick={onClose} aria-label="Cerrar formulario"><X size={15} /></button></div>
    <fieldset disabled={busy}>
      <div className="cx-section"><h3>Remitente</h3>
        {scope === "area"
          ? <label>Área remitente<select required value={senderArea ?? ""} onChange={event => { setSenderArea(Number(event.target.value)); setDocumentIds([]); }}>
              <option value="" disabled>Selecciona tu área</option>
              {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select></label>
          : <p className="cx-sender-inline"><User size={15} /> Tú, a título personal</p>}
      </div>
      <div className="cx-section"><h3>Destinatarios</h3>
        <RecipientPicker scope={scope} selected={recipients} onChange={setRecipients} />
      </div>
      <div className="cx-section"><h3>Contenido</h3>
        <label>Asunto<input name="subject" required value={subject} onChange={event => setSubject(event.target.value)} /></label>
        <label>Mensaje<textarea name="body" rows={5} required value={body} onChange={event => setBody(event.target.value)} /></label>
      </div>
      <div className="cx-section"><h3>Adjuntos <span className="muted">(opcional)</span></h3>
        <DocumentPicker userId={userId} departmentId={scope === "area" ? senderArea : null} selected={documentIds} onChange={setDocumentIds} />
      </div>
    </fieldset>
    {error && <p className="creation-error" role="alert">{error}</p>}
    <footer className="create-footer cx-message-footer">
      <span className="cx-footer-note">{losesExtras ? "El borrador guarda solo asunto y contenido." : scope === "area" ? "Visibilidad: área" : "Visibilidad: privado"}</span>
      <button type="button" className="outline-button" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="submit" value="draft" className="outline-button cx-draft-button" disabled={busy || !hasContent}><Save size={15} /> {saving === "draft" ? "Guardando…" : "Guardar borrador"}</button>
      <button type="submit" value="send" className="primary-button cx-send-button" disabled={busy || !hasContent || !hasTo}><Send size={15} /> {saving === "send" ? "Enviando…" : "Enviar"}</button>
    </footer>
  </form></dialog>;
}

// Los destinatarios pueden ser usuarios (recipient_id) o áreas (department_id), cada uno en «Para» (TO) o «CC».
function RecipientPicker({ scope, selected, onChange }: { scope: Scope; selected: Recipient[]; onChange: (value: Recipient[]) => void }) {
  const [kind, setKind] = useState<RecipientKind>(scope === "area" ? "department" : "user");
  const [type, setType] = useState<RecipientType>("TO");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resource = kind === "department" ? "departments" : "users";
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const params = new URLSearchParams({ page: "1", page_size: "10", is_active: "true" });
      if (query.trim()) params.set("q", query.trim());
      request<{ data: { id: number; name: string; code?: string; username?: string }[] }>(`/api/v1/${resource}?${params}`, { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted) setResults((data.data ?? []).map(item => ({ id: item.id, name: item.name, detail: item.code ?? item.username }))); })
        .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo buscar."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, resource]);
  const same = (a: Recipient, b: { kind: RecipientKind; id: number }) => a.kind === b.kind && a.id === b.id;
  const available = results.filter(item => !selected.some(chosen => same(chosen, { kind, id: item.id })));
  const remove = (item: Recipient) => onChange(selected.filter(chosen => !same(chosen, item)));
  const toggleType = (item: Recipient) => onChange(selected.map(chosen => same(chosen, item) ? { ...chosen, type: chosen.type === "TO" ? "CC" : "TO" } : chosen));
  const groups: { type: RecipientType; label: string }[] = [{ type: "TO", label: "Para" }, { type: "CC", label: "CC" }];
  return <div className="picker cx-recipients">
    <div className="cx-recipient-options">
      <div className="cx-segmented" role="group" aria-label="Buscar en">
        <button type="button" aria-pressed={kind === "user"} onClick={() => setKind("user")}><User size={13} /> Usuarios</button>
        <button type="button" aria-pressed={kind === "department"} onClick={() => setKind("department")}><Building2 size={13} /> Áreas</button>
      </div>
      <div className="cx-segmented" role="group" aria-label="Añadir como">
        {groups.map(group => <button type="button" key={group.type} aria-pressed={type === group.type} onClick={() => setType(group.type)}>{group.label}</button>)}
      </div>
    </div>
    <label><span className="sr-only">{kind === "department" ? "Buscar área" : "Buscar usuario"}</span><span className="search-field"><Search size={16} /><input type="search" placeholder={kind === "department" ? "Buscar área" : "Buscar usuario"} value={query} onChange={event => setQuery(event.target.value)} /></span></label>
    {groups.map(group => {
      const items = selected.filter(item => item.type === group.type);
      return <div className="cx-recipient-row" key={group.type}>
        <span className="cx-recipient-label">{group.label}</span>
        {items.length ? <div className="chip-list">{items.map(item => <span className="chip" key={`${item.kind}-${item.id}`}>
          {item.kind === "user" ? <User size={12} /> : <Building2 size={12} />}{item.name}
          <button type="button" className="chip-move" title={`Mover a ${item.type === "TO" ? "CC" : "Para"}`} aria-label={`Mover ${item.name} a ${item.type === "TO" ? "CC" : "Para"}`} onClick={() => toggleType(item)}>{item.type === "TO" ? "CC" : "Para"}</button>
          <button type="button" aria-label={`Quitar ${item.name}`} onClick={() => remove(item)}><X size={12} /></button>
        </span>)}</div> : <small className="muted">{group.type === "TO" ? "Obligatorio para enviar." : "Opcional."}</small>}
      </div>;
    })}
    <div className="picker-results" aria-busy={loading}>
      {error ? <small role="alert">{error}</small> : loading ? <small>Buscando…</small> : !available.length ? <small>Sin resultados.</small>
        : available.map(item => <button type="button" key={item.id} onClick={() => onChange([...selected, { ...item, kind, type }])}><Plus size={13} /> {item.name}{item.detail && <small>{item.detail}</small>}<span className="cx-add-as">{type === "TO" ? "Para" : "CC"}</span></button>)}
    </div>
  </div>;
}

function DocumentPicker({ userId, departmentId, selected, onChange }: { userId: number; departmentId: number | null; selected: number[]; onChange: (value: number[]) => void }) {
  const [documents, setDocuments] = useState<{ id: number; name: string; document_number: string | null }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: "1", page_size: "100", created_by: String(userId), sort_by: "created_at", order: "desc" });
    if (departmentId) params.set("department_id", String(departmentId));
    request<{ data: { id: number; name: string; document_number: string | null }[] }>(`/api/v1/documents?${params}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setError(""); setDocuments(data.data ?? []); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudieron cargar tus documentos."); });
    return () => controller.abort();
  }, [userId, departmentId]);
  return <div className="picker">
    <span className="picker-label">Documentos adjuntos {!!selected.length && <span className="muted">· {selected.length} seleccionados</span>}</span>
    <div className="check-list">
      {error ? <small role="alert">{error}</small> : !documents.length ? <small><FolderOpen size={13} /> No tienes documentos disponibles.</small>
        : documents.map(doc => <label key={doc.id}><input type="checkbox" checked={selected.includes(doc.id)} onChange={event => onChange(event.target.checked ? [...selected, doc.id] : selected.filter(id => id !== doc.id))} />{doc.name}{doc.document_number && <small>{doc.document_number}</small>}</label>)}
    </div>
  </div>;
}
