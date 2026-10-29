"use client";

import { apiFetch } from "../lib/api";
import { useEffect, useState } from "react";
import CreateEntry from "./create-entry";
import OrganizationChart from "./organization-chart";
import Brand from "./brand";
import { Building2, ChevronLeft, ChevronRight, LogOut, Search, Users } from "lucide-react";

type Department = { id: number; name: string; code: string; role?: string; is_active: boolean; membership_active?: boolean; parent_id?: number | null; parent?: { id: number; name: string; code: string; is_active: boolean } | null };
type User = { id: number; name: string; username: string; email: string; admin: boolean; is_active: boolean; departments: Department[] };
type Page<T> = { data: T[]; page: number; page_size: number; total: number; total_pages: number };
type Filters = { q: string; department_id: number | null; admin: string; is_active: string; page: number; page_size: number };

async function getPage<T>(resource: string, params: Record<string, string>, signal: AbortSignal): Promise<Page<T>> {
  const response = await apiFetch(`/api/v1/${resource}?${new URLSearchParams(params)}`, { signal, cache: "no-store" });
  const result = await response.json() as Page<T> & { error?: string };
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "No se pudo cargar el listado.");
  if (!Array.isArray(result.data) || !Number.isInteger(result.total_pages) || !Number.isInteger(result.total)) throw new Error("El listado recibido no tiene el formato esperado.");
  return result;
}

export default function AdminDirectory({ name, onLogout }: { name: string; onLogout: () => void }) {
  const [tab, setTab] = useState<"users" | "departments">("users");
  const [filters, setFilters] = useState<Filters>({ q: "", department_id: null, admin: "", is_active: "", page: 1, page_size: 20 });
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Page<User | Department> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [areas, setAreas] = useState<Department[]>([]);
  const [areaSearch, setAreaSearch] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areaPage, setAreaPage] = useState(1);
  const [areaPages, setAreaPages] = useState(0);
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [selectedArea, setSelectedArea] = useState<Department | null>(null);
  const [areaRetry, setAreaRetry] = useState(0);
  const [creating, setCreating] = useState<"users" | "departments" | null>(null);
  const [notice, setNotice] = useState("");
  const [areaView, setAreaView] = useState<"list" | "chart">("list");

  const update = (values: Partial<Filters>) => {
    setLoading(true);
    setFilters(previous => ({ ...previous, ...values, page: values.page ?? 1 }));
  };

  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.q === search.trim() ? previous : { ...previous, q: search.trim(), page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => { setAreaQuery(areaSearch.trim()); setAreaPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [areaSearch]);

  useEffect(() => {
    if (tab === "departments" && areaView === "chart") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params: Record<string, string> = { page: String(filters.page), page_size: String(filters.page_size) };
    if (filters.q) params.q = filters.q;
    if (filters.is_active) params.is_active = filters.is_active;
    if (tab === "users") {
      if (filters.department_id) params.department_id = String(filters.department_id);
      if (filters.admin) params.admin = filters.admin;
    }
    getPage<User | Department>(tab, params, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (filters.page > Math.max(1, data.total_pages)) {
          setFilters(previous => ({ ...previous, page: Math.max(1, data.total_pages) }));
          return;
        }
        setResult(data);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo cargar el listado."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, areaView, filters, retry]);

  useEffect(() => {
    if (tab !== "users") return;
    const controller = new AbortController();
    setAreaLoading(true);
    setAreaError("");
    if (areaPage === 1) setAreas([]);
    getPage<Department>("departments", { page: String(areaPage), page_size: "50", is_active: "true", q: areaQuery }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setAreas(previous => areaPage === 1 ? data.data : [...new Map([...previous, ...data.data].map(area => [area.id, area])).values()]);
        setAreaPages(data.total_pages);
      })
      .catch(cause => { if (!controller.signal.aborted) setAreaError(cause instanceof Error ? cause.message : "No se pudieron cargar las áreas."); })
      .finally(() => { if (!controller.signal.aborted) setAreaLoading(false); });
    return () => controller.abort();
  }, [tab, areaPage, areaQuery, areaRetry]);

  function changeTab(next: "users" | "departments") {
    if (next === tab) return;
    setLoading(true);
    setResult(null);
    setTab(next);
    setSearch("");
    setFilters(previous => ({ ...previous, q: "", is_active: "", page: 1 }));
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Brand />
        <div className="admin-account"><span>{name}<small>Súper administrador</small></span><button className="outline-button" onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button></div>
      </header>
      <section className="directory">
        <div className="create-actions"><button className="outline-button" onClick={() => { setNotice(""); setCreating("departments"); }}>Crear área</button><button className="primary-button" onClick={() => { setNotice(""); setCreating("users"); }}>Crear usuario</button></div>
        {notice && <p className="success-notice" role="status">{notice}</p>}
        {creating && <CreateEntry resource={creating} onClose={() => setCreating(null)} onCreated={() => {
          const resource = creating;
          setCreating(null);
          setNotice(resource === "users" ? "Usuario creado y asignado a su área." : "Área creada correctamente.");
          setTab(resource);
          setAreaView("list");
          setSearch("");
          setFilters(previous => ({ ...previous, q: "", department_id: null, admin: "", is_active: "", page: 1 }));
          setSelectedArea(null);
          setAreaPage(1);
          setAreaSearch("");
          setAreaRetry(value => value + 1);
          setRetry(value => value + 1);
        }} />}
        <span className="eyebrow">Administración</span>
        <h1>Personas y áreas</h1>
        <p className="directory-description">Consulta tu equipo y las áreas a las que pertenece.</p>
        <nav className="directory-tabs" aria-label="Directorio administrativo">
          <button aria-current={tab === "users" ? "page" : undefined} onClick={() => changeTab("users")}><Users size={18} /> Usuarios</button>
          <button aria-current={tab === "departments" ? "page" : undefined} onClick={() => changeTab("departments")}><Building2 size={18} /> Áreas</button>
        </nav>
        {tab === "departments" && <div className="area-view-switch" role="group" aria-label="Vista de áreas"><button className="outline-button" aria-pressed={areaView === "list"} onClick={() => setAreaView("list")}>Listado</button><button className="outline-button" aria-pressed={areaView === "chart"} onClick={() => setAreaView("chart")}>Organigrama</button></div>}
        {tab === "departments" && areaView === "chart" ? <OrganizationChart /> : <section className="directory-panel" aria-label={tab === "users" ? "Usuarios" : "Áreas"}>
          <div className="directory-filters">
            <label className="search-label">Buscar {tab === "users" ? "usuarios" : "áreas"}<span className="search-field"><Search size={17} /><input type="search" placeholder={tab === "users" ? "Nombre, usuario o correo" : "Nombre o código"} value={search} onChange={event => setSearch(event.target.value)} /></span></label>
            <label>Estado<select value={filters.is_active} onChange={event => update({ is_active: event.target.value })}><option value="">Todos los estados</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label>
            {tab === "users" && <label>Tipo de usuario<select value={filters.admin} onChange={event => update({ admin: event.target.value })}><option value="">Todos los usuarios</option><option value="true">Administradores</option><option value="false">Usuarios</option></select></label>}
          </div>
          {tab === "users" && <div className="area-filters">
            <label>Buscar área<input type="search" placeholder="Nombre o código del área" value={areaSearch} onChange={event => setAreaSearch(event.target.value)} /></label>
            <label>Filtrar por área<select value={filters.department_id ?? ""} onChange={event => { const id = event.target.value ? Number(event.target.value) : null; setSelectedArea(areas.find(area => area.id === id) ?? null); update({ department_id: id }); }}><option value="">Todas las áreas</option>{selectedArea && !areas.some(area => area.id === selectedArea.id) && <option value={selectedArea.id}>{selectedArea.name}</option>}{areas.map(area => <option key={area.id} value={area.id}>{area.name} ({area.code})</option>)}</select></label>
            <div className="area-feedback" aria-live="polite">{areaLoading ? "Cargando áreas…" : areaError ? <><span>{areaError}</span><button className="text-button" onClick={() => setAreaRetry(value => value + 1)}>Reintentar</button></> : <><span>{areas.length} áreas disponibles</span>{areaPage < areaPages && <button className="text-button" onClick={() => setAreaPage(value => value + 1)}>Cargar más áreas</button>}</>}</div>
          </div>}
          <div aria-live="polite" aria-busy={loading}>
            {loading ? <div className="table-message">Cargando {tab === "users" ? "usuarios" : "áreas"}…</div>
              : error ? <div className="table-message" role="alert"><p>{error}</p><button className="outline-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>
              : !result?.data.length ? <div className="table-message"><Users size={28} /><h2>Sin resultados</h2><p>Prueba con otra búsqueda o cambia los filtros.</p></div>
              : <div className="table-scroll"><table><thead><tr>{(tab === "users" ? ["Usuario", "Correo electrónico", "Áreas y roles", "Tipo", "Estado"] : ["Área", "Código", "Área superior", "Estado"]).map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{result.data.map(item => tab === "users" ? <UserRow key={item.id} user={item as User} /> : <tr key={item.id}><td><strong>{item.name}</strong></td><td>{(item as Department).code}</td><td><ParentArea department={item as Department} /></td><td><Status active={item.is_active} /></td></tr>)}</tbody></table></div>}
          </div>
          <footer className="pagination">
            <label>Por página<select value={filters.page_size} onChange={event => update({ page_size: Number(event.target.value) })}>{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            <span>{!loading && !error && result ? `${result.total} resultados · Página ${result.total_pages ? result.page : 0} de ${result.total_pages}` : "—"}</span>
            <div><button className="outline-button" disabled={loading || !!error || filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}><ChevronLeft size={16} /> Anterior</button><button className="outline-button" disabled={loading || !!error || !result || filters.page >= result.total_pages} onClick={() => update({ page: filters.page + 1 })}>Siguiente <ChevronRight size={16} /></button></div>
          </footer>
        </section>}
      </section>
    </main>
  );
}

function Status({ active }: { active: boolean }) {
  return <span className={`status-badge ${active ? "active" : "inactive"}`}>{active ? "Activo" : "Inactivo"}</span>;
}

function ParentArea({ department }: { department: Department }) {
  if (department.parent) return <><strong>{department.parent.name}</strong><small>{department.parent.code}{!department.parent.is_active && " · Inactiva"}</small></>;
  return <span className="muted">{department.parent_id ? "Área superior no disponible" : "Área superior (raíz)"}</span>;
}

function UserRow({ user }: { user: User }) {
  return <tr><td><strong>{user.name}</strong><small>@{user.username}</small></td><td>{user.email}</td><td><div className="department-badges">{user.departments?.length ? user.departments.map(area => <span className="department-badge" key={area.id}>{area.name}{area.role && <small>{area.role}</small>}{(!area.is_active || area.membership_active === false) && <small>Pertenencia o área inactiva</small>}</span>) : <span className="muted">Sin área</span>}</div></td><td>{user.admin ? "Administrador" : "Usuario"}</td><td><Status active={user.is_active} /></td></tr>;
}
