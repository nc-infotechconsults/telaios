import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./stores/appStore";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { applyAppSettingsToDocument, loadCachedAppSettings } from "./lib/appSettings";
import "./index.css";
import LoginPage from "./pages/Login";
import ProjectLayout from "./components/ProjectLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";
import PlanningChat from "./pages/PlanningChat";
import DesignChat from "./pages/DesignChat";

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
                  {/* Workspace-level views */}
                  <Route path="/"          element={<ProjectLayout wsView="projects"  />} />
                  <Route path="/library"   element={<ProjectLayout wsView="library"   />} />
                  <Route path="/analytics" element={<ProjectLayout wsView="analytics" />} />
                  <Route path="/agents"    element={<ProjectLayout wsView="agents"    />} />
                  <Route path="/users"     element={<ProjectLayout wsView="users"     />} />
                  <Route path="/settings"  element={<ProjectLayout wsView="settings"  />} />

                  {/* Project shell */}
                  <Route path="/projects/:projectId" element={<ProjectLayout />} />

                  {/* Deep-link sub-pages rendered outside the project shell */}
                  <Route path="/projects/:projectId/plans/:planId" element={<PlanningChat />} />
                  <Route path="/projects/:projectId/design/:designSessionId" element={<DesignChat />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AppProvider>
        </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
