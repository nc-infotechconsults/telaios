import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./stores/appStore";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";
import ProjectList from "./pages/ProjectList";
import PlanningChat from "./pages/PlanningChat";
import ExecutionDashboard from "./pages/ExecutionDashboard";
import AgentProfiles from "./pages/AgentProfiles";
import SettingsPage from "./pages/Settings";
import UsersPage from "./pages/Users";
import LoginPage from "./pages/Login";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/common/ProtectedRoute";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HeroUIProvider>
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
                    <Route path="/projects/:id" element={<PlanningChat />} />
                    <Route path="/projects/:id/execute" element={<ExecutionDashboard />} />
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
