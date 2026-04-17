import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import { ToastProvider } from "@heroui/toast";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./stores/appStore";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import PlanningChat from "./pages/PlanningChat";
import ExecutionDashboard from "./pages/ExecutionDashboard";
import AgentProfiles from "./pages/AgentProfiles";
import SettingsPage from "./pages/Settings";
import UsersPage from "./pages/Users";
import DocumentExplorer from "./pages/DocumentExplorer";
import LoginPage from "./pages/Login";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/common/ProtectedRoute";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HeroUIProvider>
        <ToastProvider placement="bottom-right" maxVisibleToasts={5} />
        <AuthProvider>
          <AppProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected routes */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<ProjectList />} />
                    <Route path="/projects/:projectId" element={<ProjectDetail />} />
                    <Route path="/projects/:projectId/plans/:planId" element={<PlanningChat />} />
                    <Route path="/projects/:projectId/execute" element={<ExecutionDashboard />} />
                    <Route path="/projects/:projectId/documents" element={<DocumentExplorer />} />
                    <Route path="/agents" element={<AgentProfiles />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/users" element={<UsersPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AppProvider>
        </AuthProvider>
      </HeroUIProvider>
    </ThemeProvider>
  </React.StrictMode>
);
