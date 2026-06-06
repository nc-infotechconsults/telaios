import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./stores/appStore";
import { AuthProvider } from "./context/AuthContext";
import { AppSettingsProvider } from "./context/AppSettingsContext";
import { applyAppSettingsToDocument, loadCachedAppSettings } from "./lib/appSettings";
import "./index.css";
import LoginPage from "./pages/Login";
import ProjectLayout from "./components/ProjectLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";
import PlanningChat from "./pages/PlanningChat";
import DesignChat from "./pages/DesignChat";
import OperatorLayout from "./pages/operator/OperatorLayout";

applyAppSettingsToDocument(loadCachedAppSettings());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <>
      <ToastProvider placement="bottom-right" maxVisibleToasts={5} disableAnimation={true} />
        <AuthProvider>
          <AppSettingsProvider>
          <AppProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected routes */}
                <Route element={<ProtectedRoute />}>
                  {/* Admin Console (workspace-level views) */}
                  <Route path="/"               element={<ProjectLayout wsView="overview"  />} />
                  <Route path="/projects-list"  element={<ProjectLayout wsView="projects"  />} />
                  <Route path="/library"        element={<ProjectLayout wsView="library"   />} />
                  <Route path="/analytics"      element={<ProjectLayout wsView="analytics" />} />
                  <Route path="/agents"         element={<ProjectLayout wsView="agents"    />} />
                  <Route path="/people"         element={<ProjectLayout wsView="people"    />} />
                  <Route path="/audit"          element={<ProjectLayout wsView="audit"     />} />
                  <Route path="/billing"        element={<ProjectLayout wsView="billing"   />} />
                  <Route path="/security"       element={<ProjectLayout wsView="security"  />} />
                  <Route path="/settings"       element={<ProjectLayout wsView="settings"  />} />

                  {/* Operator portal */}
                  <Route path="/operator" element={<OperatorLayout />} />

                  {/* Project shell */}
                  <Route path="/projects/:projectId" element={<ProjectLayout />} />

                  {/* Deep-link sub-pages rendered outside the project shell */}
                  <Route path="/projects/:projectId/plans/:planId" element={<PlanningChat />} />
                  <Route path="/projects/:projectId/design/:designSessionId" element={<DesignChat />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AppProvider>
          </AppSettingsProvider>
        </AuthProvider>
    </>
  </React.StrictMode>
);
