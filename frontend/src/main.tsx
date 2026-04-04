import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./stores/appStore";
import "./index.css";
import ProjectList from "./pages/ProjectList";
import PlanningChat from "./pages/PlanningChat";
import ExecutionDashboard from "./pages/ExecutionDashboard";
import AgentProfiles from "./pages/AgentProfiles";
import SettingsPage from "./pages/Settings";
import Layout from "./components/Layout";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<ProjectList />} />
              <Route path="/projects/:id" element={<PlanningChat />} />
              <Route path="/projects/:id/execute" element={<ExecutionDashboard />} />
              <Route path="/agents" element={<AgentProfiles />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </HeroUIProvider>
  </React.StrictMode>
);
