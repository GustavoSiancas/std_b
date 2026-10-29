"use client";

import { apiFetch } from "../lib/api";
import { FormEvent, useEffect, useRef, useState } from "react";

type Area = { id: number; name: string; code: string };
const bytes = (value: string) => new TextEncoder().encode(value).length;

export default function CreateEntry({ resource, onClose, onCreated }: {
  resource: "users" | "departments";
  onClose: () => void;
  onCreated: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [areas, setAreas] = useState<Area[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [areaLoading, setAreaLoading] = useState(true);
  const [areaError, setAreaError] = useState("");
  const [retry, setRetry] = useState(0);
  const isUser = resource === "users";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(areaSearch.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [areaSearch]);

  useEffect(() => {
    const controller = new AbortController();
    setAreaLoading(true);
    setAreaError("");
    if (page === 1) setAreas([]);
    const params = new URLSearchParams({ page: String(page), page_size: "100", is_active: "true", q: query });
    apiFetch(`/api/v1/departments?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { data: Area[]; total_pages: number; error?: string };
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar las áreas.");
        if (!Array.isArray(data.data) || !Number.isInteger(data.total_pages)) throw new Error("La respuesta de áreas no es válida.");
        if (controller.signal.aborted) return;
        setAreas(previous => page === 1 ? data.data : [...new Map([...previous, ...data.data].map(item => [item.id, item])).values()]);
        setPages(data.total_pages);
      })
      .catch(cause => { if (!controller.signal.aborted) setAreaError(cause instanceof Error ? cause.message : "No se pudieron cargar las áreas."); })
      .finally(() => { if (!controller.signal.aborted) setAreaLoading(false); });
    return () => controller.abort();
  }, [query, page, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name || bytes(name) > 255) { setError("El nombre es obligatorio y debe ocupar como máximo 255 bytes."); return; }
    let payload: Record<string, string | number | null>;
    if (isUser) {
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const username = String(form.get("username") ?? "").trim().toLowerCase();
      const password = String(form.get("password") ?? "");
      if (!email || bytes(email) > 255) { setError("El correo es obligatorio y debe ocupar como máximo 255 bytes."); return; }
      if (!/^[a-z0-9._-]+$/.test(username) || bytes(username) > 100) { setError("El usuario admite letras, números, punto, guion y guion bajo, con un máximo de 100 bytes."); return; }
      if (bytes(password) < 8 || bytes(password) > 72) { setError("La contraseña debe ocupar entre 8 y 72 bytes."); return; }
      if (!area) { setError("Selecciona un área activa para el usuario."); return; }
      payload = { name, email, username, password, department_id: area.id };
    } else {
      const code = String(form.get("code") ?? "").trim().toUpperCase();
      if (!code || bytes(code) > 50) { setError("El código es obligatorio y debe ocupar como máximo 50 bytes."); return; }
      payload = { name, code, parent_id: area?.id ?? null };
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await apiFetch(`/api/v1/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string; id?: number; user?: { id?: number } };
      if (!response.ok) throw new Error(data.error || (response.status === 409 ? "Ya existe un registro con esos datos." : "No se pudo crear el registro."));
      if (response.status !== 201 || !(isUser ? data.user?.id : data.id)) throw new Error("No se pudo confirmar la creación. Revisa el listado antes de volver a guardar.");
      onCreated();
    } catch (cause) {
      setError(cause instanceof TypeError ? "Se perdió la conexión. Revisa el listado antes de volver a guardar." : cause instanceof Error ? cause.message : "No se pudo crear el registro.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <dialog className="create-dialog" ref={dialog} aria-labelledby="create-title" onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }}>
    <form onSubmit={submit}>
      <div className="create-heading"><div><span className="eyebrow">Administración</span><h2 id="create-title">{isUser ? "Crear usuario" : "Crear área"}</h2></div><button className="outline-button" type="button" disabled={saving} onClick={onClose} aria-label="Cerrar formulario">✕</button></div>
      <fieldset disabled={saving}>
        <label htmlFor="new-name">Nombre<input id="new-name" name="name" autoFocus required maxLength={255} autoComplete={isUser ? "name" : "off"} /></label>
        {isUser ? <>
          <label htmlFor="new-email">Correo electrónico<input id="new-email" name="email" type="email" autoComplete="off" required maxLength={255} /></label>
          <label htmlFor="new-username">Usuario<input id="new-username" name="username" autoCapitalize="none" autoComplete="off" spellCheck={false} required maxLength={100} pattern="[a-zA-Z0-9._\-]+" /></label>
          <label htmlFor="new-password">Contraseña<input id="new-password" name="password" type="password" autoComplete="new-password" required aria-describedby="password-help" /></label>
          <small id="password-help">Entre 8 y 72 bytes. No se permiten más de 72 caracteres ASCII.</small>
        </> : <label htmlFor="new-code">Código<input id="new-code" name="code" required maxLength={50} placeholder="SIS" /><small>Se guardará en mayúsculas.</small></label>}
        <div className="create-area-picker">
          <label htmlFor="new-area-search">Buscar área{!isUser && " superior"}<input id="new-area-search" type="search" value={areaSearch} onChange={event => setAreaSearch(event.target.value)} placeholder="Nombre o código" /></label>
          <label htmlFor="new-area">{isUser ? "Área del usuario" : "Área superior (opcional)"}<select id="new-area" value={area?.id ?? ""} required={isUser} onChange={event => { const id = event.target.value ? Number(event.target.value) : null; setArea(areas.find(item => item.id === id) ?? null); }}><option value="">{isUser ? "Selecciona un área" : "Sin área superior"}</option>{area && !areas.some(item => item.id === area.id) && <option value={area.id}>{area.name}</option>}{areas.map(item => <option value={item.id} key={item.id}>{item.name} ({item.code})</option>)}</select></label>
          <div className="area-feedback" aria-live="polite">{areaLoading ? "Cargando áreas…" : areaError ? <><span>{areaError}</span><button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></> : <><span>{areas.length ? `${areas.length} áreas disponibles` : "No hay áreas para esta búsqueda."}</span>{page < pages && <button type="button" className="text-button" onClick={() => setPage(value => value + 1)}>Cargar más áreas</button>}</>}</div>
        </div>
      </fieldset>
      {error && <p className="creation-error" role="alert">{error}</p>}
      <footer className="create-footer"><button type="button" className="outline-button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || (isUser && !area)}>{saving ? "Guardando…" : isUser ? "Crear usuario" : "Crear área"}</button></footer>
    </form>
  </dialog>;
}
