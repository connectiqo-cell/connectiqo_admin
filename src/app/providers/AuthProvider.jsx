import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useEnvironment } from "./EnvironmentProvider.jsx";
import { getSupabaseClient } from "../../services/supabaseClientFactory.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { config } = useEnvironment();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient(config);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [config]);

  const login = async (email, password) => {
    const supabase = getSupabaseClient(config);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    // Verify the signed-in user is in the admins table
    const { data: adminRow } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!adminRow) {
      await supabase.auth.signOut();
      throw new Error("Access denied: account is not authorised as admin");
    }
  };

  const logout = async () => {
    const supabase = getSupabaseClient(config);
    await supabase.auth.signOut();
    setSession(null);
  };

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      loading,
      login,
      logout,
    }),
    [session, loading, config]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
