import "server-only";
import { getStore } from "./client";

export interface DisplayIdentity {
  resume_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  links: string[];
}

/**
 * The single place where a Resume ID is re-mapped to a person. Used only by the results page,
 * the dashboard and the exports. Nothing on the AI side ever calls this.
 */
export async function getDisplayIdentity(resumeId: string): Promise<DisplayIdentity | null> {
  const p = await getStore().getPii(resumeId);
  if (!p) return null;
  return { resume_id: p.resume_id, full_name: p.full_name, email: p.email, phone: p.phone, links: p.links };
}

export async function getDisplayIdentities(resumeIds: string[]): Promise<Map<string, DisplayIdentity>> {
  const rows = await getStore().listPii(resumeIds);
  return new Map(rows.map((p) => [p.resume_id, { resume_id: p.resume_id, full_name: p.full_name, email: p.email, phone: p.phone, links: p.links }]));
}
