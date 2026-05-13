import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
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
import ProtectedRoute from "./components/common/ProtectedRoute";
import SettingsPage from "./pages/SettingsPage";

applyAppSettingsToDocument(loadCachedAppSettings());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HeroUIProvider>
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
                  <Route element={<Layout />}>
                    <Route path="/" element={<ProjectList />} />
                    <Route path="/projects/:projectId" element={<ProjectDetail />} />
                    <Route path="/projects/:projectId/plans/:planId" element={<PlanningChat />} />
                    <Route path="/projects/:projectId/execute" element={<ExecutionDashboard />} />
                    <Route path="/projects/:projectId/documents/:documentId" element={<DocumentViewerPage />} />
                    <Route path="/projects/:projectId/environments/:envId" element={<EnvironmentDetail />} />
                    <Route path="/library" element={<LibraryPage />} />
                    <Route path="/library/agents/:agentId" element={<LibraryAgentDetail />} />
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
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
