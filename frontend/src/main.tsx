import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { ClientLocaleProvider } from "./i18n/ClientLocaleContext";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ClientLocaleProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClientLocaleProvider>
    </AuthProvider>
  </StrictMode>
);
