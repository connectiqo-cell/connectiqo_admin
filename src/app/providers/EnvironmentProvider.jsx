import { createContext, useContext, useMemo, useState } from "react";

const EnvironmentContext = createContext(null);
const STORAGE_KEY = "admin_target_environment";

const environmentConfig = {
  staging: {
    label: "Staging",
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL_STAGING || "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY_STAGING || "",
    authServerUrl: import.meta.env.VITE_AUTH_SERVER_URL_STAGING || "",
    videoSdkBaseUrl: import.meta.env.VITE_VIDEOSDK_BASE_URL_STAGING || "https://api.videosdk.live/v2",
  },
  production: {
    label: "Production",
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL_PRODUCTION || "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY_PRODUCTION || "",
    authServerUrl: import.meta.env.VITE_AUTH_SERVER_URL_PRODUCTION || "",
    videoSdkBaseUrl: import.meta.env.VITE_VIDEOSDK_BASE_URL_PRODUCTION || "https://api.videosdk.live/v2",
  },
};

export function EnvironmentProvider({ children }) {
  const [environment, setEnvironment] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "staging"
  );

  const switchEnvironment = (nextEnvironment) => {
    localStorage.setItem(STORAGE_KEY, nextEnvironment);
    setEnvironment(nextEnvironment);
  };

  const value = useMemo(
    () => ({
      environment,
      config: environmentConfig[environment],
      switchEnvironment,
      environments: environmentConfig,
    }),
    [environment]
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment() {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return ctx;
}
