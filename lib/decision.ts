// Display-only decision labels. The band stays the source of truth (build spec §10).
import type { Band } from "@/lib/scoring/types";

export const DECISION: Record<Band, { label: string; short: string; tone: "priority" | "accept" | "review" | "reject" }> = {
  priority_shortlist: { label: "Accept – Priority", short: "Accept – Priority", tone: "priority" },
  shortlist: { label: "Accept", short: "Accept", tone: "accept" },
  review: { label: "Review – Arjun decides", short: "Review", tone: "review" },
  not_shortlisted: { label: "Reject", short: "Reject", tone: "reject" },
};

export const BAND_LABEL: Record<Band, string> = {
  priority_shortlist: "Priority shortlist",
  shortlist: "Shortlist",
  review: "Review",
  not_shortlisted: "Not shortlisted",
};

export const ROLE_LABEL = { PM: "Product Manager", SPM: "Senior Product Manager" } as const;

const PENALTY_LABEL: Record<string, string> = {
  X1: "Credential-led CV",
  X2: "Domain claimed but not lived",
  X3: "Team-framed only",
  X4: "Framework vocabulary without candour",
  X5_PM: "Maintenance-only product work",
  X5_SPM: "Feature-level only, no product area",
};
const BONUS_LABEL: Record<string, string> = {
  B1: "Operations before the current function",
  B2: "Worked at a forwarder, 3PL or CHA",
};
export const penaltyLabel = (id: string) => PENALTY_LABEL[id] ?? id;
export const bonusLabel = (id: string) => BONUS_LABEL[id] ?? id;

/** Tooltip text for each flag chip. */
export function flagHelp(flag: string): string {
  if (flag.startsWith("evidence_not_found:"))
    return `No snippet for ${flag.split(":")[1]} could be found in the CV text, so its level was set to 0.`;
  if (flag.startsWith("floor:")) return `${flag.split(":")[1]} is 0, so the band is capped at Review.`;
  if (flag.startsWith("consider_for:"))
    return "Over 6 years of product experience: PM band capped at Review; this profile may fit the Senior PM role.";
  if (flag.startsWith("implausible_metric:")) return "The extraction flagged a metric that looks implausible. Verify in interview.";
  return (
    {
      confirm_relocation: "The CV doesn't say where the candidate is based or whether they'd relocate to Mumbai. Confirm before interview.",
      check_level_fit: "More than 10 years of product ownership. Check the level fits the role.",
      cleared_bar_capacity: "Cleared the bar but was moved down a band because the role's shortlist is at capacity.",
      overlapping_full_time_roles: "Two full-time roles overlap in time. Blocks Priority; ask about it.",
    } as Record<string, string>
  )[flag] ?? flag;
}

export const PII_TYPE_LABEL: Record<string, string> = {
  CANDIDATE: "Name", EMAIL: "Email", PHONE: "Phone", URL: "Links & handles",
  ADDRESS: "Address", PERSONAL_ID: "Personal identifiers", LOCATION: "Home location",
};
