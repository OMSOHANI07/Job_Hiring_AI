import "server-only";
import { LocalStore } from "./local";
import { NeonStore } from "./neon";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null = null;

/**
 * STORAGE_DRIVER=neon uses Neon Postgres (DATABASE_URL), =supabase uses Supabase (service role);
 * anything else uses the local JSON store (dev only). All server-side.
 */
export function getStore(): Store {
  if (store) return store;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "neon") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("STORAGE_DRIVER=neon needs DATABASE_URL");
    store = new NeonStore(url);
  } else if (driver === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    store = new SupabaseStore(url, key);
  } else {
    if (process.env.VERCEL) {
      throw new Error("The local store is not persistent on Vercel. Set STORAGE_DRIVER=neon (or supabase).");
    }
    store = new LocalStore();
  }
  return store;
}

/** Tests only. */
export function setStoreForTests(s: Store | null) {
  store = s;
}
