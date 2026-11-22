const TOKEN_KEY = "qa_token";
const PROJECT_KEY = "qa_project";
const THEME_KEY = "qa_theme";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getProjectId(): string | null {
  return localStorage.getItem(PROJECT_KEY);
}

export function setProjectId(id: string) {
  localStorage.setItem(PROJECT_KEY, id);
}

export function getTheme(): "dark" | "light" {
  return (localStorage.getItem(THEME_KEY) as "dark" | "light") || "dark";
}

export function setTheme(theme: "dark" | "light") {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    if (!path.includes("/api/auth/login")) window.location.href = "/login";
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export function artifactUrl(id: string): string {
  const token = getToken() ?? "";
  return `/api/artifacts/${id}?token=${encodeURIComponent(token)}`;
}

export function apiOrigin(): string {
  const env = import.meta.env.VITE_API_ORIGIN as string | undefined;
  if (env) return env.replace(/\/$/, "");
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return window.location.origin;
}

export function absoluteArtifactUrl(id: string): string {
  return `${apiOrigin()}${artifactUrl(id)}`;
}

export function traceViewerSrc(artifactId: string): string {
  return `${apiOrigin()}/trace/index.html?trace=${encodeURIComponent(absoluteArtifactUrl(artifactId))}`;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
