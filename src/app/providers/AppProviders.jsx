import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./ThemeProvider.jsx";
import { AuthProvider } from "./AuthProvider.jsx";
import { EnvironmentProvider } from "./EnvironmentProvider.jsx";
import { AuditProvider } from "./AuditProvider.jsx";
import { ToastProvider } from "./ToastProvider.jsx";

export function AppProviders({ children }) {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <EnvironmentProvider>
          <AuthProvider>
            <AuditProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuditProvider>
          </AuthProvider>
        </EnvironmentProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
