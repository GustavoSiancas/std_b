"use client";

import { apiFetch } from "../lib/api";
import { FormEvent, useEffect, useRef, useState } from "react";
import Correspondence, { type Kind, type Scope } from "./correspondence";
import { BrandMark } from "./brand";
import PendingMessages, { PendingBadge } from "./pending-messages";
import { Building2, ChevronDown, ExternalLink, FilePlus2, FileStack, FileText, FolderOpen, Inbox, LogOut, PenSquare, Plus, Search, UserRound } from "lucide-react";

type Area = { id: number; name: string; code: string; is_active: boolean; membership_active?: boolean };
type Type = { id: number; name: string; code: string; has_correlative: boolean };
type User = { id: number; name: string; departments?: Area[] };
type Document = { id: number; name: string; description: string; file_url: string; created_at: string; document_number: string | null; document_sequence_id: number | null; correlative_number: number | null; year: number | null; document_type: Type; department: Area };
type Page<T> = { data: T[]; page: number; total: number; total_pages: number };
// Cada sección muestra sus opciones a la vista: un clic lleva a cualquier pantalla.
type NavItem = { label: string; kind: Kind; action: "create" | "list"; icon: typeof FileText };
const navModules: { label: string; items: NavItem[] }[] = [
  { label: "Trámites", items: [{ label: "Crear trámite", kind: "procedures", action: "create", icon: FilePlus2 }, { label: "Trámites", kind: "procedures", action: "list", icon: FileStack }] },
  { label: "Mensajes", items: [{ label: "Crear mensaje", kind: "messages", action: "create", icon: PenSquare }, { label: "Mensajes", kind: "messages", action: "list", icon: Inbox }] },
];
const navSections: { id: Scope; label: string; icon: typeof FileText }[] = [{ id: "area", label: "Área", icon: Building2 }, { id: "personal", label: "Personal", icon: UserRound }];
type View = { scope: Scope; kind: Kind; item: string };

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(path, { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error((data as { error?: string }).error || "No se pudo consultar el servidor.");
  return data as T;
}
function safeLink(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function readableText(value: string) {
  if (!/[ÃÂ]/.test(value)) return value;
  try { return new TextDecoder().decode(Uint8Array.from(value, character => character.charCodeAt(0))); } catch { return value; }
}

export default function DocumentWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [types, setTypes] = useState<Type[]>([]);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaError, setAreaError] = useState("");
  const [areaLoading, setAreaLoading] = useState(true);
  const [filters, setFilters] = useState({ page: 1, size: 20, q: "", area: null as number | null, year: "", sort: "created_at", order: "desc" });
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Page<Document> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [documentsOpen, setDocumentsOpen] = useState(true);
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<View | null>(null);
  const [createRequest, setCreateRequest] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const selected = types.find(type => type.id === typeId);
  function openItem(scope: Scope, item: NavItem) {
    setInboxOpen(false);
    setView({ scope, kind: item.kind, item: item.label });
    setCreateRequest(value => item.action === "create" ? value + 1 : 0);
  }

  // Contador de pendientes del sidebar; se actualiza cada minuto mientras la bandeja está cerrada.
  useEffect(() => {
    if (inboxOpen) return;
    const controller = new AbortController();
    const load = () => read<{ total?: number }>("/api/v1/message-recipients?page=1&page_size=1", controller.signal)
      .then(data => { if (!controller.signal.aborted && Number.isInteger(data.total)) setPendingCount(data.total as number); })
      .catch(() => { /* Contador informativo: si falla se conserva el último valor. */ });
    void load();
    const timer = setInterval(load, 60000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [inboxOpen, user.id]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError("");
    (async () => {
      const all: Type[] = [];
      let page = 1, total = 1;
      do {
        const data = await read<Page<Type>>(`/api/v1/document-types?page=${page}&page_size=100&is_active=true&sort_by=name&order=asc`, controller.signal);
        if (!Array.isArray(data.data) || !Number.isInteger(data.total_pages)) throw new Error("El catálogo de tipos no es válido.");
        all.push(...data.data); total = data.total_pages; page++;
      } while (page <= total);
      if (!controller.signal.aborted) { setTypes(all); setTypeId(previous => all.some(type => type.id === previous) ? previous : all[0]?.id ?? null); }
    })().catch(cause => { if (!controller.signal.aborted) setCatalogError(cause.message); }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [catalogRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setAreaLoading(true); setAreaError("");
    (async () => {
      if (Array.isArray(user.departments)) return user.departments.filter(area => area.is_active && area.membership_active !== false);
      // Si el login no incluye pertenencias, usa el listado de usuarios para localizar el ID exacto.
      const mine: Area[] = [];
      let page = 1, total = 1;
      do {
        const data = await read<Page<{ id: number; departments: Area[] }>>(`/api/v1/users?page=${page}&page_size=100`, controller.signal);
        if (!Array.isArray(data.data) || !Number.isInteger(data.total_pages)) throw new Error("No se pudieron verificar tus áreas.");
        const found = data.data.find(item => item.id === user.id);
        if (found) { mine.push(...(found.departments ?? []).filter(area => area.is_active && area.membership_active !== false)); break; }
        total = data.total_pages; page++;
      } while (page <= total);
      return mine;
    })().then(data => { if (!controller.signal.aborted) setAreas(data); }).catch(cause => { if (!controller.signal.aborted) setAreaError(cause.message); }).finally(() => { if (!controller.signal.aborted) setAreaLoading(false); });
    return () => controller.abort();
  }, [user, catalogRetry]);

  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.q === search.trim() ? previous : { ...previous, q: search.trim(), page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!typeId) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(filters.page), page_size: String(filters.size), created_by: String(user.id), document_type_id: String(typeId), sort_by: filters.sort, order: filters.order });
    if (filters.q) params.set("q", filters.q);
    if (filters.area) params.set("department_id", String(filters.area));
    if (filters.year) params.set("year", filters.year);
    read<Page<Document>>(`/api/v1/documents?${params}`, controller.signal)
      .then(data => {
        if (!Array.isArray(data.data) || !Number.isInteger(data.total_pages)) throw new Error("El listado de documentos no es válido.");
        if (!controller.signal.aborted) setResult(data);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [typeId, filters, user.id, refresh]);

  return <main className="documents-shell">
    <aside className="documents-sidebar sb">
      <div className="sb-brand"><span className="brand-mark"><BrandMark size={20} /></span><div><strong className="brand-name">STD <span>2D</span></strong><small>Espacio de trabajo</small></div></div>
      <div className="sb-scroll">
        <section className="sb-section sb-inbox" aria-label="Bandeja">
          <button type="button" className="sb-item" aria-current={inboxOpen ? "page" : undefined} onClick={() => setInboxOpen(true)}>
            <Inbox size={16} /><span>Pendientes</span><PendingBadge count={pendingCount} />
          </button>
        </section>
        {navSections.map(section => {
          const open = !closedSections[section.id];
          const areaHint = section.id === "area" ? (areaLoading ? "…" : areas.length === 1 ? areas[0].name : areas.length ? `${areas.length} áreas` : "Sin áreas") : null;
          return <section key={section.id} className="sb-section">
            <button type="button" className="sb-section-head" aria-expanded={open} onClick={() => setClosedSections(current => ({ ...current, [section.id]: open }))}>
              <section.icon size={14} /><span>{section.label}</span>{areaHint && <em title={areaHint}>{areaHint}</em>}<ChevronDown size={14} className={open ? "" : "collapsed"} />
            </button>
            {open && <nav aria-label={`Opciones ${section.label.toLowerCase()}`}>{navModules.map(module => <div key={module.label} className="sb-module">
              <span className="sb-module-label">{module.label}</span>
              {module.items.map(item => <button type="button" key={item.label} className={`sb-item${item.action === "create" ? " sb-item-create" : ""}`} aria-current={!inboxOpen && view?.scope === section.id && view.item === item.label ? "page" : undefined} onClick={() => openItem(section.id, item)}>
                <item.icon size={16} /><span>{item.label}</span>
              </button>)}
            </div>)}</nav>}
          </section>;
        })}
        <section className="sb-section">
          <button type="button" className="sb-section-head" aria-expanded={documentsOpen} onClick={() => setDocumentsOpen(open => !open)}>
            <FolderOpen size={14} /><span>Documentos</span>{!catalogLoading && !catalogError && <em>{types.length}</em>}<ChevronDown size={14} className={documentsOpen ? "" : "collapsed"} />
          </button>
          {documentsOpen && <nav aria-label="Tipos de documentos">{catalogLoading ? <p className="sidebar-note">Cargando tipos…</p> : catalogError ? <div className="sidebar-note" role="alert"><p>{catalogError}</p><button className="outline-button" onClick={() => setCatalogRetry(value => value + 1)}>Reintentar</button></div> : !types.length ? <p className="sidebar-note">No hay tipos activos disponibles.</p> : types.map(type => <button type="button" className="sb-item" key={type.id} aria-current={!inboxOpen && !view && typeId === type.id ? "page" : undefined} onClick={() => { setInboxOpen(false); setView(null); setLoading(true); setTypeId(type.id); setFilters(previous => ({ ...previous, page: 1 })); setNotice(""); }}><FileText size={16} /><span>{readableText(type.name)}</span></button>)}</nav>}
        </section>
      </div>
      <div className="sb-account">
        <span className="sb-avatar" aria-hidden="true">{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>
        <div><strong title={user.name}>{user.name}</strong><small>Usuario</small></div>
        <button type="button" className="sb-logout" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16} /></button>
      </div>
    </aside>
    {inboxOpen ? <PendingMessages areas={areas} onCountChange={setPendingCount} /> : view ? <Correspondence key={`${view.scope}-${view.kind}`} scope={view.scope} kind={view.kind} userId={user.id} areas={areas} areaLoading={areaLoading} areaError={areaError} createRequest={createRequest} onRetryAreas={() => setCatalogRetry(value => value + 1)} /> :
    <section className="documents-content directory"><div className="document-heading"><div><span className="eyebrow">Mis documentos</span><h1>{selected?.name ?? "Documentos"}</h1><p className="directory-description">Revisa y registra los documentos de este tipo.</p></div><button className="primary-button" disabled={!selected || areaLoading || !areas.length || !!areaError} onClick={() => { setNotice(""); setCreating(true); }}><Plus size={17} /> Crear documento</button></div>
      {notice && <p className="success-notice" role="status">{notice}</p>}
      {areaError && <p className="creation-error" role="alert">{areaError} <button className="text-button" onClick={() => setCatalogRetry(value => value + 1)}>Reintentar</button></p>}
      {!areaLoading && !areaError && !areas.length && <p className="workspace-note">No tienes áreas activas asignadas. Solicita una asignación para crear documentos.</p>}
      {selected && <section className="directory-panel"><div className="directory-filters document-filters">
        <label className="search-label">Buscar<span className="search-field"><Search size={17} /><input type="search" placeholder="Nombre o descripción" value={search} onChange={event => setSearch(event.target.value)} /></span></label>
        <label>Área<select value={filters.area ?? ""} onChange={event => setFilters(previous => ({ ...previous, area: event.target.value ? Number(event.target.value) : null, page: 1 }))}><option value="">Todas mis áreas</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label>Año del correlativo<input type="number" min={1} max={9999} placeholder="Todos" value={filters.year} onChange={event => { const value = event.target.value; if (!value || /^[1-9]\d{0,3}$/.test(value)) setFilters(previous => ({ ...previous, year: value, page: 1 })); }} /></label>
        <label>Ordenar por<select value={filters.sort} onChange={event => setFilters(previous => ({ ...previous, sort: event.target.value, page: 1 }))}><option value="created_at">Fecha de creación</option><option value="name">Nombre</option><option value="correlative_number">Correlativo</option><option value="department">Área</option><option value="year">Año</option></select></label>
        <label>Orden<select value={filters.order} onChange={event => setFilters(previous => ({ ...previous, order: event.target.value, page: 1 }))}><option value="desc">Descendente</option><option value="asc">Ascendente</option></select></label>
      </div><div aria-live="polite" aria-busy={loading}>{loading ? <div className="table-message">Cargando documentos…</div> : error ? <div className="table-message" role="alert"><p>{error}</p><button className="outline-button" onClick={() => setRefresh(value => value + 1)}>Reintentar</button></div> : !result?.data.length ? <div className="table-message"><FolderOpen size={30} /><h2>Sin documentos</h2><p>No hay documentos para esta selección. Puedes crear el primero o cambiar los filtros.</p></div> : <div className="table-scroll"><table><thead><tr>{["Documento", "Tipo / área", "Número", "Fecha", "Archivo"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>{result.data.map(doc => <tr key={doc.id}><td><strong>{doc.name}</strong>{doc.description && <small className="document-description">{doc.description}</small>}</td><td>{doc.document_type?.name}<small>{doc.department?.name}</small></td><td>{doc.document_number ?? "Sin correlativo"}</td><td>{new Date(doc.created_at).toLocaleDateString("es-CO")}</td><td>{safeLink(doc.file_url) ? <a className="document-link" href={safeLink(doc.file_url)!} target="_blank" rel="noopener noreferrer">Abrir archivo <ExternalLink size={14} /></a> : "Enlace no disponible"}</td></tr>)}</tbody></table></div>}</div>
        <footer className="pagination"><label>Por página<select value={filters.size} onChange={event => setFilters(previous => ({ ...previous, size: Number(event.target.value), page: 1 }))}>{[10,20,50,100].map(size => <option key={size}>{size}</option>)}</select></label><span>{!loading && !error && result ? `${result.total} documentos · Página ${result.total_pages ? result.page : 0} de ${result.total_pages}` : "—"}</span><div><button className="outline-button" disabled={loading || !!error || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Anterior</button><button className="outline-button" disabled={loading || !!error || !result || filters.page >= result.total_pages} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Siguiente</button></div></footer>
      </section>}
    </section>}
    {creating && selected && <CreateDocument type={selected} areas={areas} userId={user.id} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setSearch(""); setFilters(previous => ({ ...previous, page: 1, q: "", area: null, year: "", sort: "created_at", order: "desc" })); setRefresh(value => value + 1); setNotice("Documento creado correctamente."); }} />}
  </main>;
}

function CreateDocument({ type, areas, userId, onClose, onCreated }: { type: Type; areas: Area[]; userId: number; onClose: () => void; onCreated: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const file_url = safeLink(String(form.get("file_url") ?? "").trim());
    if (!name || !file_url) { setError("Ingresa un nombre y un enlace HTTP o HTTPS válido."); return; }
    pending.current = true; setSaving(true); setError("");
    try {
      const departmentId = Number(form.get("department_id"));
      if (!Number.isSafeInteger(departmentId) || departmentId <= 0) throw new Error("Selecciona un área válida.");
      const response = await apiFetch("/api/v1/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_type_id: type.id, department_id: departmentId, created_by: userId, name, description: String(form.get("description") ?? "").trim(), file_url }) });
      const result = await response.json() as { id?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo crear el documento.");
      if (response.status !== 201 || !result.id) throw new Error("No se pudo confirmar la creación. Revisa el listado antes de volver a guardar.");
      onCreated();
    } catch (cause) { setError(cause instanceof TypeError ? "Se perdió la conexión. Revisa el listado antes de volver a guardar." : cause instanceof Error ? cause.message : "No se pudo crear el documento."); }
    finally { pending.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="create-dialog" aria-labelledby="document-title" onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}><form onSubmit={submit}><div className="create-heading"><div><span className="eyebrow">{type.name}</span><h2 id="document-title">Crear documento</h2></div><button className="outline-button" type="button" disabled={saving} onClick={onClose} aria-label="Cerrar formulario">✕</button></div><fieldset disabled={saving}><label>Nombre<input name="name" required autoFocus /></label><label>Área<select name="department_id" required defaultValue={areas.length === 1 ? areas[0].id : ""}><option value="" disabled>Selecciona tu área</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label>Descripción (opcional)<textarea name="description" rows={3} /></label><label>Enlace del archivo<input name="file_url" type="url" required placeholder="https://…/documento.pdf" /></label><small>Se guardará el enlace. El archivo debe estar alojado previamente.</small><p className="workspace-note">{type.has_correlative ? "El número correlativo se asignará automáticamente al guardar." : "Este tipo de documento no utiliza correlativo."}</p></fieldset>{error && <p className="creation-error" role="alert">{error}</p>}<footer className="create-footer"><button type="button" className="outline-button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Crear documento"}</button></footer></form></dialog>;
}
