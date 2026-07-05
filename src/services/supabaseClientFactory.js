import { createClient } from "@supabase/supabase-js";

const cache = new Map();

export function getSupabaseClient(config) {
  const cacheKey = config.supabaseUrl;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase URL or anon key missing for selected environment");
  }

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  cache.set(cacheKey, client);
  return client;
}
