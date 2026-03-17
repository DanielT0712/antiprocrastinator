import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { SchedulePage } from "./components/schedule/SchedulePage";
import { WeeklyTemplatePage } from "./components/schedule/WeeklyTemplatePage";
import { TasksPage } from "./components/tasks/TasksPage";
import { AppsPage } from "./components/apps/AppsPage";
import { AnalyticsPage } from "./components/analytics/AnalyticsPage";
import { SettingsPage } from "./components/settings/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="schedule/template" element={<WeeklyTemplatePage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
