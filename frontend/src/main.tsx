import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { DashboardCursorProvider } from "./cursor/DashboardCursorContext";
import { ClientLocaleProvider } from "./i18n/ClientLocaleContext";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ClientLocaleProvider>
        <DashboardCursorProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DashboardCursorProvider>
      </ClientLocaleProvider>
    </AuthProvider>
  </StrictMode>
);
