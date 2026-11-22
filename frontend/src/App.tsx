import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { getToken } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExecutivePage } from "./pages/ExecutivePage";
import { ExecutionsPage } from "./pages/ExecutionsPage";
import { ExecutionDetailPage } from "./pages/ExecutionDetailPage";
import { TestPointsPage } from "./pages/TestPointsPage";
import { TestPointDetailPage } from "./pages/TestPointDetailPage";
import { ResultDetailPage } from "./pages/ResultDetailPage";
import { FailuresPage } from "./pages/FailuresPage";
import { ComparePage } from "./pages/ComparePage";
import { LogsPage } from "./pages/LogsPage";
import { VideosPage } from "./pages/VideosPage";
import { MatrixPage } from "./pages/MatrixPage";
import { PerformancePage } from "./pages/PerformancePage";
import { JiraPage } from "./pages/JiraPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";

function Guard({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Guard>
              <Layout />
            </Guard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="executive" element={<ExecutivePage />} />
          <Route path="executions" element={<ExecutionsPage />} />
          <Route path="executions/:id" element={<ExecutionDetailPage />} />
          <Route path="testpoints" element={<TestPointsPage />} />
          <Route path="testpoints/:id" element={<TestPointDetailPage />} />
          <Route path="results/:id" element={<ResultDetailPage />} />
          <Route path="failures" element={<FailuresPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="videos" element={<VideosPage />} />
          <Route path="matrix" element={<MatrixPage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="jira" element={<JiraPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
