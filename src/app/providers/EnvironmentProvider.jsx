import { createContext, useContext, useEffect, useMemo } from "react";

const EnvironmentContext = createContext(null);
const STORAGE_KEY = "admin_target_environment";

const productionConfig = {
  label: "Production",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL_PRODUCTION || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY_PRODUCTION || "",
  authServerUrl: import.meta.env.VITE_AUTH_SERVER_URL_PRODUCTION || "",
  videoSdkBaseUrl: import.meta.env.VITE_VIDEOSDK_BASE_URL_PRODUCTION || "https://api.videosdk.live/v2",
};

const environmentConfig = {
  production: productionConfig,
};

export function EnvironmentProvider({ children }) {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "production");
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo(
    () => ({
      environment: "production",
      config: productionConfig,
      switchEnvironment: () => {},
      environments: environmentConfig,
    }),
    []
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment() {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return ctx;
}
