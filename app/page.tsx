"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import AdminDirectory from "../components/admin-directory";
import { setSessionUser } from "../lib/api";
import DocumentWorkspace from "../components/document-workspace";
import Brand from "../components/brand";

type User = {
  id: number;
  username: string;
  admin: boolean;
  name: string;
  email: string;
  is_active: boolean;
  departments?: { id: number; name: string; code: string; is_active: boolean; membership_active?: boolean }[];
};

function isUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return Number.isSafeInteger(user.id) && (user.id as number) > 0
    && ["username", "name", "email"].every(key => typeof user[key] === "string")
    && typeof user.admin === "boolean" && typeof user.is_active === "boolean";
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Usuario o contraseña incorrectos.");
        if (response.status === 403) throw new Error("Tu cuenta no tiene acceso. Contacta al administrador.");
        throw new Error("No fue posible iniciar sesión. Inténtalo de nuevo.");
      }
      const result = await response.json() as { user?: unknown };
      if (!isUser(result.user)) throw new Error("El servidor devolvió una respuesta de usuario inválida.");
      if (!result.user.is_active) throw new Error("Tu cuenta está inactiva. Contacta al administrador.");
      setPassword("");
      setSessionUser(result.user.id);
      setUser(result.user);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "TimeoutError"
        ? "El servidor tardó demasiado en responder. Inténtalo de nuevo."
        : cause instanceof TypeError
          ? "No se pudo conectar con el servidor."
          : cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  if (user?.admin) return <AdminDirectory name={user.name} onLogout={() => { setSessionUser(null); setUser(null); setPassword(""); setError(""); setShow(false); }} />;

  if (user) return <DocumentWorkspace user={user} onLogout={() => { setSessionUser(null); setUser(null); setPassword(""); setError(""); setShow(false); }} />;

  return (
    <main className="portal-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <section className="login-card">
        <Brand />
        <div className="intro"><span className="eyebrow">Portal de acceso</span><h1>Bienvenido de nuevo</h1><p>Ingresa tus credenciales para continuar a tu espacio de trabajo en STD 2D.</p></div>
        <form onSubmit={signIn} aria-busy={loading}>
          <label htmlFor="username">Usuario</label>
          <input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Tu nombre de usuario" value={username} onChange={event => setUsername(event.target.value)} disabled={loading} required />
          <label htmlFor="password">Contraseña</label>
          <div className="password-wrap">
            <input id="password" autoComplete="current-password" type={show ? "text" : "password"} placeholder="Tu contraseña" value={password} onChange={event => setPassword(event.target.value)} disabled={loading} required />
            <button type="button" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="submit" type="submit" disabled={loading || !username.trim() || !password}>{loading ? "Validando acceso…" : <>Ingresar <ArrowRight size={18} /></>}</button>
        </form>
      </section>
    </main>
  );
}
