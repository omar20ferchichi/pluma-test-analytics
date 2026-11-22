import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Clapperboard,
  Columns3,
  FileBarChart,
  Gauge,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  ScrollText,
  Settings,
  Sun,
  Target,
  Ticket,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, clearToken, getProjectId, getTheme, setProjectId, setTheme } from "../lib/api";
import { clsx } from "../lib/format";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { to: "/executive", label: "Executive", icon: Users },
  { to: "/executions", label: "Executions", icon: Activity, shortcut: "G E" },
  { to: "/testpoints", label: "TestPoints", icon: Target, shortcut: "G T" },
  { to: "/matrix", label: "Matrix", icon: Columns3 },
  { to: "/failures", label: "Failures", icon: AlertTriangle, shortcut: "G F" },
  { to: "/compare", label: "Compare", icon: GitCompare },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/videos", label: "Videos / traces", icon: Clapperboard },
  { to: "/performance", label: "Performance", icon: Gauge },
  { to: "/jira", label: "Jira", icon: Ticket },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setPid] = useState(getProjectId() ?? "");
  const [theme, setThemeState] = useState(getTheme());
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ type: string; id: string; title: string; subtitle: string }>>([]);
  const [openSearch, setOpenSearch] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api<{ projects: Array<{ id: string; name: string }> }>("/api/projects").then((res) => {
      setProjects(res.projects);
      const stillValid = res.projects.some((project) => project.id === projectId);
      if ((!projectId || !stillValid) && res.projects[0]) {
        setPid(res.projects[0].id);
        setProjectId(res.projects[0].id);
        window.dispatchEvent(new Event("qa-project-change"));
      }
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpenSearch(true);
      }
      if (event.key === "/" && (event.target as HTMLElement).tagName !== "INPUT") {
        event.preventDefault();
        setOpenSearch(true);
      }
      if (event.key === "Escape") setOpenSearch(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!search.trim() || !projectId) return;
    const handle = setTimeout(() => {
      api<{ results: typeof results }>(`/api/search?projectId=${projectId}&q=${encodeURIComponent(search)}`).then((res) =>
        setResults(res.results),
      );
    }, 200);
    return () => clearTimeout(handle);
  }, [search, projectId]);

  const crumbs = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    return ["Command center", ...parts];
  }, [location.pathname]);

  return (
    <div className="grid-bg min-h-full lg:h-full lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-white/10 bg-ink-950/90 px-4 py-5 backdrop-blur lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-500/15 font-mono text-mint-400 ring-1 ring-mint-500/30">
            TP
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">Pluma TestPoint</div>
            <div className="text-xs text-slate-400">Analytics</div>
          </div>
        </div>
        <nav className="grid gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5",
                    isActive && "bg-mint-500/10 text-mint-400 ring-1 ring-mint-500/20",
                  )
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col lg:h-full lg:overflow-hidden">
        <header className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-ink-950/80 px-5 py-3 backdrop-blur">
          <div className="text-xs text-slate-500">{crumbs.join(" / ")}</div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-white/10 bg-ink-800 px-3 py-1.5 text-sm"
              value={projectId}
              onChange={(e) => {
                setPid(e.target.value);
                setProjectId(e.target.value);
                window.dispatchEvent(new Event("qa-project-change"));
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300"
              onClick={() => setOpenSearch(true)}
            >
              <Search size={14} /> Search <span className="kbd">/</span>
            </button>
            <button
              className="rounded-lg border border-white/10 p-2"
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                setThemeState(next);
              }}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="rounded-lg border border-white/10 p-2"
              onClick={() => {
                clearToken();
                navigate("/login");
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-auto px-5 py-6">
          <Outlet context={{ projectId }} />
        </main>
      </div>
      {openSearch ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={() => setOpenSearch(false)}>
          <div className="mx-auto mt-24 max-w-xl rounded-2xl border border-white/10 bg-ink-900 p-4 shadow-panel" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
              placeholder="Search TestPoints, tickets, errors, logs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-3 max-h-80 overflow-auto">
              {results.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => {
                    setOpenSearch(false);
                    if (item.type === "execution") navigate(`/executions/${item.id}`);
                    else if (item.type === "testpoint") navigate(`/testpoints/${item.id}`);
                    else if (item.type === "failure") navigate(`/results/${item.id}`);
                    else navigate(`/logs?q=${encodeURIComponent(item.subtitle)}`);
                  }}
                >
                  <div className="text-xs uppercase text-slate-500">{item.type}</div>
                  <div className="font-medium">{item.title}</div>
                  <div className="truncate text-sm text-slate-400">{item.subtitle}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useProjectId() {
  const [projectId, setPid] = useState(getProjectId());
  useEffect(() => {
    const sync = () => setPid(getProjectId());
    window.addEventListener("qa-project-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("qa-project-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return projectId;
}
