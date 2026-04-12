import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { ToastProvider } from "@heroui/toast";
import "./index.css";
import { WorkspacesPage } from "./pages/WorkspacesPage";
import { IDEPage } from "./pages/IDEPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WorkspacesPage />} />
          <Route path="/ide/:id" element={<IDEPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastProvider placement="bottom-right" toastOffset={16} />
    </HeroUIProvider>
  </React.StrictMode>,
);
