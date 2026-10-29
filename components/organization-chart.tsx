"use client";

import { apiFetch } from "../lib/api";
import { useEffect, useState } from "react";
import { Building2, RefreshCw } from "lucide-react";

type Node = { id: number; name: string; code: string; is_active: boolean; parent_id: number | null; children: Node[] };
type Chart = { roots: Node[]; total: number; root_count: number };

export default function OrganizationChart() {
  const [chart, setChart] = useState<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiFetch("/api/v1/departments/organization-chart", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json() as Chart & { error?: string };
        if (!response.ok) throw new Error(response.status === 409
          ? `No se puede mostrar la jerarquía: ${data.error || "se detectó un ciclo o un área superior ausente."}`
          : data.error || "No se pudo cargar el organigrama.");
        if (!Array.isArray(data.roots) || !Number.isInteger(data.total) || !Number.isInteger(data.root_count)) throw new Error("El organigrama recibido no tiene el formato esperado.");
        if (!controller.signal.aborted) setChart(data);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo cargar el organigrama."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  return <section className="directory-panel org-panel" aria-label="Organigrama de áreas" aria-busy={loading}>
    <header className="org-header"><div><h2>Organigrama general</h2><p>Todas las áreas, activas e inactivas, en su posición jerárquica.</p></div><button className="outline-button" disabled={loading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} /> Actualizar</button></header>
    <div aria-live="polite">
      {loading ? <div className="table-message">Cargando organigrama…</div>
        : error ? <div className="table-message" role="alert"><p>{error}</p><button className="outline-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>
        : !chart?.roots.length ? <div className="table-message"><Building2 size={28} /><h2>Sin áreas</h2><p>Crea un área para comenzar el organigrama.</p></div>
        : <><div className="org-summary"><span>{chart.total} áreas · {chart.root_count === 1 ? "Una única área superior" : `${chart.root_count} jerarquías independientes`}</span><span className="status-badge inactive">Inactiva: borde discontinuo</span></div><div className="org-scroll"><ul className="org-roots" aria-label="Áreas superiores">{chart.roots.map(node => <Branch key={node.id} node={node} />)}</ul></div></>}
    </div>
  </section>;
}

function Branch({ node }: { node: Node }) {
  const children = node.children ?? [];
  return <li className="org-branch">
    <div className={`org-node ${node.is_active ? "" : "org-inactive"}`}><Building2 size={17} /><div><strong>{node.name}</strong><small>{node.code}</small></div><span className={`status-badge ${node.is_active ? "active" : "inactive"}`}>{node.is_active ? "Activa" : "Inactiva"}</span></div>
    {children.length > 0 && <details open><summary>{children.length} {children.length === 1 ? "área dependiente" : "áreas dependientes"}</summary><ul aria-label={`Áreas de ${node.name}`}>{children.map(child => <Branch key={child.id} node={child} />)}</ul></details>}
  </li>;
}
