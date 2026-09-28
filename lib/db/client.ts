import "server-only";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null = null;

/** STORAGE_DRIVER=supabase uses Supabase (service role, server-side); anything else uses the local JSON store. */
export function getStore(): Store {
  if (store) return store;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    store = new SupabaseStore(url, key);
  } else {
    if (process.env.VERCEL) {
      throw new Error("The local store is not persistent on Vercel. Set STORAGE_DRIVER=supabase with Supabase keys.");
    }
    store = new LocalStore();
  }
  return store;
}

/** Tests only. */
export function setStoreForTests(s: Store | null) {
  store = s;
}
