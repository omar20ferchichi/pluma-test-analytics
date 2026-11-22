import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api";

export function LoginPage() {
  const [email, setEmail] = useState("admin@qa.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const res = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900/90 p-8 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-500/15 font-mono text-mint-400 ring-1 ring-mint-500/30">
            TP
          </div>
          <div>
            <h1 className="text-xl font-semibold">Pluma Test Analytics</h1>
            <p className="text-sm text-slate-400">Sign in to the command center</p>
          </div>
        </div>
        <label className="mb-3 block text-sm">
          Email
          <input className="mt-1 w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-4 block text-sm">
          Password
          <input type="password" className="mt-1 w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <div className="mb-3 text-sm text-rose-300">{error}</div> : null}
        <button className="w-full rounded-xl bg-mint-500 py-2.5 font-semibold text-ink-950">Enter</button>
        <p className="mt-4 text-xs text-slate-500">Demo: admin@qa.local / admin123</p>
      </form>
    </div>
  );
}
