import "server-only";
import { z } from "zod";
import type { InterviewBrief, ScoreRow } from "@/lib/db/types";
import { bonusLabel, flagHelp, penaltyLabel, ROLE_LABEL } from "@/lib/decision";
import { CFG } from "@/lib/scoring/config";
import { evidenceFound } from "@/lib/scoring/evidence";
import type { GenerateFn } from "./gemini";
import { generateStructured } from "./structured";

export const BRIEF_PROMPT_VERSION = "brief-v1.0";

const BriefSchema = z.object({
  summary: z.string().min(20).max(700),
  strengths: z.array(z.object({ criterion: z.string(), point: z.string().max(300), evidence: z.string().max(400) })).min(1).max(4),
  risks: z.array(z.object({ criterion: z.string(), point: z.string().max(300) })).min(1).max(4),
  questions: z.array(z.object({ criterion: z.string(), question: z.string().max(400), listen_for: z.string().max(300) })).min(3).max(6),
});

const SYSTEM = `You prepare a one-page interview brief for Arjun Mehta, founder of Kargo (Series A logistics SaaS in Mumbai; customers are mid-sized freight forwarders and 3PLs). He is interviewing for the role given below.
You receive an ANONYMISED CV and the deterministic rubric result already computed by code. You do not re-score or change any level.
Rules:
1. Use only facts in the CV text and the rubric result. Never invent employers, numbers or events.
2. strengths: 2-4 items, each tied to a criterion id, with "evidence" copied VERBATIM from the CV text (25 words or fewer).
3. risks: 1-4 items: the gaps, weak evidence (grade C), failed non-negotiables, penalties or flags that Arjun should test. Be specific and fair.
4. questions: 4-6 interview questions. Start from the rubric probes provided and tailor each one to this CV's specifics. "listen_for" says what a strong answer contains.
5. summary: 2-3 sentences on the career path and why the candidate is at this point in the ranking.
6. Never mention or guess name, gender, age, college, family, home city or career gaps. Redaction tokens like [CANDIDATE] stand for removed details; never repeat them.
Return ONLY JSON matching the schema.`;

export function briefLogistics(score: ScoreRow, flags: string[]): string[] {
  const out: string[] = [];
  if (flags.includes("confirm_relocation")) out.push("Confirm they are Mumbai-based or willing to relocate: the role is in-office and the CV doesn't say.");
  if (flags.some((f) => f.startsWith("consider_for:"))) out.push(`${score.product_years} years of product experience, above the PM range: check expectations on level and pay.`);
  if (flags.includes("check_level_fit")) out.push("More than 10 years of product ownership: check the level fits.");
  if (flags.includes("overlapping_full_time_roles")) out.push("Two full-time roles overlap on the CV: ask about the timeline.");
  for (const f of flags.filter((x) => x.startsWith("evidence_not_found:"))) out.push(flagHelp(f));
  return out;
}

export async function generateBrief(input: {
  resumeId: string;
  redactedText: string;
  score: ScoreRow;
  finalBand: string;
  finalFlags: string[];
  evidence: Record<string, string[]>;
  grades: Record<string, string>;
  piiValues: { type: string; value: string }[];
  generate?: GenerateFn;
}): Promise<{ brief: InterviewBrief; model: string }> {
  const rc = CFG.roles[input.score.role];
  const rubric = {
    role: ROLE_LABEL[input.score.role],
    decision: input.score.decision,
    final_band: input.finalBand,
    score: input.score.score,
    criteria: rc.criteria.map((c) => ({
      id: c.id, name: c.name, level: input.score.levels[c.id], grade: input.grades[c.id] ?? null,
      evidence: input.evidence[c.id] ?? [], rubric_probe: c.interview_probe,
    })),
    penalties: input.score.penalties.map((p) => `${p}: ${penaltyLabel(p)}`),
    bonuses: input.score.bonuses.map((b) => `${b}: ${bonusLabel(b)}`),
    non_negotiables_failed: input.score.non_negotiables_failed,
    gate_failed: input.score.gate_failed,
    flags: input.finalFlags,
    engine_probes: input.score.interview_probes,
  };
  const user = [
    `ROLE: ${ROLE_LABEL[input.score.role]}`,
    "RUBRIC RESULT (computed by code):",
    JSON.stringify(rubric),
    "",
    "ANONYMISED CV TEXT (between the markers):",
    "<<<CV", input.redactedText, "CV>>>",
  ].join("\n");
  const ids = new Set(rc.criteria.map((c) => c.id));
  const out = await generateStructured({
    system: SYSTEM, user, schema: BriefSchema, piiValues: input.piiValues, generate: input.generate,
    check: (b) => {
      const bad = [...b.strengths, ...b.risks, ...b.questions].find((x) => !ids.has(x.criterion));
      if (bad) return `criterion "${bad.criterion}" is not one of ${[...ids].join(", ")}`;
      const unquoted = b.strengths.find((s) => !evidenceFound([s.evidence], input.redactedText));
      if (unquoted) return `strength evidence "${unquoted.evidence.slice(0, 60)}" is not verbatim from the CV`;
      if (/\[(CANDIDATE|EMAIL|PHONE|URL|LOCATION|ADDRESS|PERSONAL_ID|CONTACT_DETAILS_REMOVED)\]/.test(JSON.stringify(b))) return "do not repeat redaction tokens";
      return null;
    },
  });
  return { brief: { ...out.data, logistics: briefLogistics(input.score, input.finalFlags) }, model: out.model };
}
