import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AdminRouteGuard } from "./components/AdminRouteGuard";
import { AdminShell } from "./components/AdminShell";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { LoginPage } from "./pages/LoginPage";
import { ModelsPage } from "./pages/ModelsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TasksPage } from "./pages/TasksPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminHomePage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<AdminRouteGuard />}>
          <Route element={<AdminShell />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/logs" element={<AuditLogsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
