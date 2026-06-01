import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./stores/appStore";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { applyAppSettingsToDocument, loadCachedAppSettings } from "./lib/appSettings";
import "./index.css";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import PlanningChat from "./pages/PlanningChat";
import DesignChat from "./pages/DesignChat";
import ExecutionDashboard from "./pages/ExecutionDashboard";
import LibraryPage from "./pages/LibraryPage";
import LibraryAgentDetail from "./pages/LibraryAgentDetail";
import UsersPage from "./pages/Users";
import AnalyticsPage from "./pages/AnalyticsPage";
import DocumentViewerPage from "./pages/DocumentViewerPage";
import EnvironmentDetail from "./pages/EnvironmentDetail";
import DockerShellPage from "./pages/DockerShellPage";
import LoginPage from "./pages/Login";
import Layout from "./components/Layout";
import ProjectLayout from "./components/ProjectLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";
import SettingsPage from "./pages/SettingsPage";
import AgentProfiles from "./pages/AgentProfiles";

applyAppSettingsToDocument(loadCachedAppSettings());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider placement="bottom-right" maxVisibleToasts={5} disableAnimation={true} />
        <AuthProvider>
          <AppProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected routes */}
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/environments/:envId/docker/shell/:containerId"
                    element={<DockerShellPage />}
                  />
                  {/* New glassmorphism project shell — wraps all /projects/:projectId routes */}
                  <Route path="/projects/:projectId" element={<ProjectLayout />} />

                  <Route element={<Layout />}>
                    <Route path="/" element={<ProjectList />} />
                    {/* Legacy project detail — kept for backward compatibility */}
                    <Route path="/projects/:projectId/detail" element={<ProjectDetail />} />
                    <Route path="/projects/:projectId/plans/:planId" element={<PlanningChat />} />
                    <Route path="/projects/:projectId/design" element={<DesignChat />} />
                    <Route path="/projects/:projectId/design/:designSessionId" element={<DesignChat />} />
                    <Route path="/projects/:projectId/execute" element={<ExecutionDashboard />} />
                    <Route path="/projects/:projectId/documents/:documentId" element={<DocumentViewerPage />} />
                    <Route path="/projects/:projectId/environments/:envId" element={<EnvironmentDetail />} />
                    <Route path="/library" element={<LibraryPage />} />
                    <Route path="/library/agents/:agentId" element={<LibraryAgentDetail />} />
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/agents" element={<AgentProfiles />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AppProvider>
        </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
