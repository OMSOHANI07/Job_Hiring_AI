import "server-only";

// Deterministic PII detectors. No AI runs before redaction.
// Every detector returns character spans on the input text so redaction and verification share one code path.

export type PiiType = "CANDIDATE" | "EMAIL" | "PHONE" | "URL" | "ADDRESS" | "PERSONAL_ID" | "LOCATION";

export interface Finding {
  type: PiiType;
  value: string;
  start: number;
  end: number;
}

export const TOKEN: Record<PiiType, string> = {
  CANDIDATE: "[CANDIDATE]",
  EMAIL: "[EMAIL]",
  PHONE: "[PHONE]",
  URL: "[URL]",
  ADDRESS: "[ADDRESS]",
  PERSONAL_ID: "[PERSONAL_ID]",
  LOCATION: "[LOCATION]",
};
export const CONTACT_REMOVED = "[CONTACT_DETAILS_REMOVED]";
const ANY_TOKEN = /\[(?:CANDIDATE|EMAIL|PHONE|URL|ADDRESS|PERSONAL_ID|LOCATION|CONTACT_DETAILS_REMOVED)\]/g;

// ---------------------------------------------------------------- line helpers
interface Line { text: string; start: number; index: number }

export function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  text.split("\n").forEach((t, index) => {
    out.push({ text: t, start: pos, index });
    pos += t.length + 1;
  });
  return out;
}

const SECTION_HEADING =
  /^\s*(?:professional\s+|career\s+|executive\s+)?(?:summary|profile|about(?:\s+me)?|objective|experience|work\s+experience|employment(?:\s+history)?|education|skills|key\s+skills|certifications?(?:\s*&\s*tools)?|projects|achievements|tools)\b\s*:?\s*$/i;

/** Header zone: lines before the first section heading, capped at the first 10 non-empty lines. */
export function headerZone(lines: Line[]): Line[] {
  const zone: Line[] = [];
  let nonEmpty = 0;
  for (const l of lines) {
    if (SECTION_HEADING.test(l.text)) break;
    if (l.text.trim()) nonEmpty++;
    if (nonEmpty > 10) break;
    zone.push(l);
  }
  return zone;
}

const SEP = /\s*(?:\||·|•|∙|◦|,|;|–|—|\/\/|\s{2,}|\t)\s*/;

// ---------------------------------------------------------------- email
const EMAIL_RE = /[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9_%+-])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}/g;

export function detectEmails(text: string): Finding[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => ({ type: "EMAIL", value: m[0], start: m.index!, end: m.index! + m[0].length }));
}

// ---------------------------------------------------------------- phone
// Candidate spans: optional +, digits with spaces / dashes / dots / parentheses. Validated by digit rules below.
const PHONE_CANDIDATE = /(?<![\w₹$€£@/.%+-])(?:\+[ ]?)?\(?\d[\d \-().]{5,22}\d(?![\w%/@]|\.\d)/g;
const YEAR_RANGE = /^(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|\d{2})$/;

export function isPhone(raw: string): boolean {
  const s = raw.trim();
  if (YEAR_RANGE.test(s)) return false;
  if (/\d\.\d{1,2}(?!\d)/.test(s) && !/\d{3,}\.\d{3,}/.test(s)) return false; // decimals like 8.7 / 2.4
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(s)) return false; // dates
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+")) return d.length >= 8 && d.length <= 15;
  if (d.length === 10 && /^[6-9]/.test(d)) return true; // Indian mobile
  if (d.length === 11 && d.startsWith("0")) return true; // 0-prefixed mobile or STD landline
  if (d.length === 12 && /^91[6-9]/.test(d)) return true; // 91 without +
  if (/\(\d{2,5}\)/.test(s) && d.length >= 8 && d.length <= 11) return true; // (022) 2345 6789
  return false;
}

/** Last-10-digit keys of every phone-like digit run in the text (separators ignored). */
export function phoneKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\+?\d[\d \-().]{6,22}\d/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 8) keys.add(d.slice(-10));
  }
  return keys;
}

export function detectPhones(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    let v = m[0];
    let start = m.index!;
    // trim trailing separators/punctuation the class may have swallowed
    v = v.replace(/[ \-(.]+$/, "");
    if (v.startsWith("(") && !v.includes(")")) { v = v.slice(1); start += 1; }
    if (isPhone(v)) out.push({ type: "PHONE", value: v, start, end: start + v.length });
  }
  return out;
}

// ---------------------------------------------------------------- URLs and handles
const PROFILE_HOSTS =
  /(?:linkedin\.com|lnkd\.in|github\.com|github\.io|gitlab\.com|leetcode\.com|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|wa\.me|kaggle\.com|hackerrank\.com|codechef\.com|codeforces\.com|stackoverflow\.com|instagram\.com|facebook\.com|about\.me|linktr\.ee|notion\.site|substack\.com|youtube\.com|topmate\.io)/i;
const SCHEME_URL = /\b(?:https?:\/\/|www\.)[^\s<>()"'|,;·•]+/gi;
const BARE_DOMAIN =
  /(?<![@\w.\-/])(?:[a-z0-9][a-z0-9-]+\.)+(?:com|in|co\.in|io|dev|me|org|net|co|ai|app|xyz|so|page|site|info|biz|us|uk|link|bio|ly|gg|ee|site|net\.in)(?:\/[^\s<>()"'|,;·•]*)?(?![\w-])/gi;
const LABELLED_HANDLE =
  /(?<![\w])(?:linkedin|github|gitlab|leetcode|behance|dribbble|medium|twitter|kaggle|hackerrank|codechef|codeforces|portfolio|website|instagram|telegram|skype)\s*(?:id|profile|handle|url)?\s*:\s*(@?[A-Za-z0-9_.\-/]+)/gi;
const AT_HANDLE = /(?<![\w.@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{1,29})(?![\w@])/g;

const stripTrailing = (s: string) => s.replace(/[.,;:!?)\]}'"]+$/, "");

export function detectUrls(text: string, header: Line[], nameTokens: string[]): Finding[] {
  const out: Finding[] = [];
  const push = (value: string, start: number) => {
    const v = stripTrailing(value);
    if (v.length >= 3) out.push({ type: "URL", value: v, start, end: start + v.length });
  };
  for (const m of text.matchAll(SCHEME_URL)) push(m[0], m.index!);
  const headerEnd = header.length ? header[header.length - 1].start + header[header.length - 1].text.length : 0;
  for (const m of text.matchAll(BARE_DOMAIN)) {
    const v = m[0];
    const hasPath = v.includes("/");
    const lower = v.toLowerCase();
    const inHeader = m.index! < headerEnd;
    const hasName = nameTokens.some((t) => lower.includes(t.toLowerCase()));
    // A bare company domain in a work line ("Delhivery.com") is not PII; profile hosts, paths,
    // header-zone domains and anything containing the candidate's name are.
    if (hasPath || PROFILE_HOSTS.test(v) || inHeader || hasName) push(v, m.index!);
  }
  const profile = new RegExp(`(?<![\\w.\\-/@])${PROFILE_HOSTS.source}(?:/[^\\s<>()"'|,;·•]*)?`, "gi");
  for (const m of text.matchAll(profile)) push(m[0], m.index!);
  for (const m of text.matchAll(LABELLED_HANDLE)) {
    const handle = m[1];
    if (!handle || /^\[/.test(handle)) continue;
    push(handle, m.index! + m[0].lastIndexOf(handle));
  }
  for (const l of header) {
    for (const m of l.text.matchAll(AT_HANDLE)) push(m[0], l.start + m.index!);
  }
  return out;
}

// ---------------------------------------------------------------- name
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function nameTokensOf(fullName: string): string[] {
  return fullName
    .split(/[\s.,'-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

export function detectName(text: string, fullName: string): Finding[] {
  const out: Finding[] = [];
  const name = fullName.trim();
  if (!name) return out;
  const parts = name.split(/\s+/).map(escapeRe);
  const full = new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("[\\s.]+")}(?![\\p{L}\\p{N}])`, "giu");
  for (const m of text.matchAll(full)) out.push({ type: "CANDIDATE", value: m[0], start: m.index!, end: m.index! + m[0].length });
  for (const t of nameTokensOf(name)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])`, "giu");
    for (const m of text.matchAll(re)) out.push({ type: "CANDIDATE", value: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/**
 * Prefill heuristic for the upload form: the first non-empty line (or its first separator segment)
 * if it is 2–4 capitalised words with no digits or "@". Arjun confirms or edits it.
 */
export function guessName(text: string): string {
  const first = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const candidates = [first, first.split(SEP)[0] ?? ""];
  for (const c of candidates) {
    const s = c.trim();
    if (!s || /[\d@]/.test(s)) continue;
    const words = s.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^\p{Lu}[\p{L}'.-]*$/u.test(w))) continue;
    if (SECTION_HEADING.test(s) || /curriculum|resume|vitae/i.test(s)) continue;
    // ALL CAPS -> Title Case for display
    return words.map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
  }
  return "";
}

// ---------------------------------------------------------------- address and personal identifiers
const PERSONAL_LABEL =
  /^[\s•·\-–*]*(address|permanent\s+address|current\s+address|residential\s+address|dob|d\.o\.b\.?|date\s+of\s+birth|age|gender|sex|marital\s+status|nationality|religion|caste|father'?s?\s+name|mother'?s?\s+name|spouse'?s?\s+name|passport(?:\s+(?:no\.?|number))?|aadhaa?r(?:\s+(?:no\.?|number))?|pan(?:\s+(?:no\.?|number|card))?|languages\s+known)\b\s*[:\-–]\s*(.+)$/i;
const AADHAAR = /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}(?!\d)/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PIN = /(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)/g;
const ADDRESS_WORDS =
  /\b(?:road|rd\.?|street|st\.|marg|lane|nagar|sector|flat|apartment|apt\.?|society|chs|bldg|building|floor|colony|near|opp\.?|behind|west|east|\(w\)|\(e\)|pin(?:code)?|house|h\.?\s?no|plot|village|dist(?:rict)?|taluka|tower|wing|phase|layout|cross|main)\b/i;

export function detectAddressAndIds(text: string, lines: Line[], header: Line[]): Finding[] {
  const out: Finding[] = [];
  for (const l of lines) {
    const m = l.text.match(PERSONAL_LABEL);
    if (m) {
      const label = m[1].toLowerCase();
      if (label.startsWith("languages")) continue; // not PII; kept so the label regex stays readable
      const value = m[2].trim();
      if (!value) continue;
      const vStart = l.start + l.text.lastIndexOf(value);
      const type: PiiType = /address/.test(label) ? "ADDRESS" : "PERSONAL_ID";
      out.push({ type, value, start: vStart, end: vStart + value.length });
      continue;
    }
    const pins = [...l.text.matchAll(PIN)];
    if (!pins.length) continue;
    const isHeader = header.some((h) => h.index === l.index);
    const addrWords = l.text.match(new RegExp(ADDRESS_WORDS.source, "gi"))?.length ?? 0;
    const hasPlace = new RegExp(PLACE_RE.source, "iu").test(l.text);
    const addressLine =
      /\b(?:pin\s*(?:code)?|postal\s+code|zip)\s*[:\-]?\s*\d/i.test(l.text) ||
      (isHeader && (addrWords > 0 || hasPlace)) ||
      (addrWords >= 2 && hasPlace && (l.text.match(/,/g)?.length ?? 0) >= 2);
    if (addressLine) {
      // an address-like line with a PIN code: remove the whole line
      const t = l.text.trim();
      const s = l.start + l.text.indexOf(t);
      out.push({ type: "ADDRESS", value: t, start: s, end: s + t.length });
    } else if (isHeader) {
      for (const p of pins) out.push({ type: "ADDRESS", value: p[0], start: l.start + p.index!, end: l.start + p.index! + p[0].length });
    }
  }
  for (const m of text.matchAll(AADHAAR)) out.push({ type: "PERSONAL_ID", value: m[0], start: m.index!, end: m.index! + m[0].length });
  for (const m of text.matchAll(PAN)) out.push({ type: "PERSONAL_ID", value: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

// ---------------------------------------------------------------- header location
export const PLACES = [
  "Navi Mumbai", "Mumbai", "Bombay", "Thane", "Pune", "Bengaluru", "Bangalore", "New Delhi", "Delhi NCR", "Delhi", "Gurugram",
  "Gurgaon", "Noida", "Greater Noida", "Faridabad", "Ghaziabad", "Hyderabad", "Secunderabad", "Chennai", "Madras", "Kolkata",
  "Calcutta", "Ahmedabad", "Gandhinagar", "Surat", "Vadodara", "Baroda", "Rajkot", "Jaipur", "Udaipur", "Jodhpur", "Lucknow",
  "Kanpur", "Noida", "Kochi", "Cochin", "Thiruvananthapuram", "Trivandrum", "Kozhikode", "Chandigarh", "Mohali", "Indore",
  "Bhopal", "Nagpur", "Nashik", "Aurangabad", "Kolhapur", "Coimbatore", "Madurai", "Tiruchirappalli", "Visakhapatnam", "Vizag",
  "Vijayawada", "Mysuru", "Mysore", "Mangaluru", "Mangalore", "Hubli", "Goa", "Panaji", "Patna", "Ranchi", "Bhubaneswar",
  "Cuttack", "Guwahati", "Shillong", "Dehradun", "Ludhiana", "Amritsar", "Jalandhar", "Varanasi", "Prayagraj", "Allahabad",
  "Agra", "Meerut", "Raipur", "Jammu", "Srinagar", "Vapi", "Kandla", "Gandhidham", "Mundra", "Nhava Sheva", "Panvel",
  "Maharashtra", "Karnataka", "Tamil Nadu", "Telangana", "Andhra Pradesh", "Kerala", "Gujarat", "Rajasthan", "West Bengal",
  "Uttar Pradesh", "Madhya Pradesh", "Haryana", "Punjab", "Bihar", "Odisha", "Assam", "Jharkhand", "Uttarakhand",
  "Himachal Pradesh", "Chhattisgarh", "India", "Dubai", "Abu Dhabi", "Singapore", "London", "Toronto", "New York",
  "San Francisco", "Sydney", "Berlin", "Amsterdam", "Rotterdam",
];
const PLACE_RE = new RegExp(`(?<![\\p{L}])(?:${[...new Set(PLACES)].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![\\p{L}])`, "giu");
const LOCATION_LABEL = /^[\s•·\-–*]*(?:location|city|current\s+location|based\s+in|residence|home\s+town|hometown)\s*[:\-–]\s*(.+)$/i;

/**
 * Home city is an excluded attribute. Remove places on the contact line (header zone lines that carry
 * contact details, a name, separators, or nothing but place names) and on "Location:" lines.
 * Places inside work-experience lines (company locations) are kept.
 */
export function detectLocations(text: string, lines: Line[], header: Line[], contactFindings: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const l of header) {
    const lineEnd = l.start + l.text.length;
    const hasContact = contactFindings.some((f) => f.start >= l.start && f.end <= lineEnd);
    const segs = l.text.split(SEP).filter((s) => s.trim());
    const onlyPlaces = l.text.replace(PLACE_RE, "").replace(/[\s,|·•()\-–]/g, "").length === 0;
    const hasSeparators = segs.length >= 2;
    if (!(hasContact || onlyPlaces || hasSeparators || /^\s*[📍⌖]/u.test(l.text))) continue;
    for (const m of l.text.matchAll(PLACE_RE)) {
      out.push({ type: "LOCATION", value: m[0], start: l.start + m.index!, end: l.start + m.index! + m[0].length });
    }
  }
  for (const l of lines) {
    const m = l.text.match(LOCATION_LABEL);
    if (m) {
      const v = m[1].trim();
      if (!v) continue;
      const s = l.start + l.text.lastIndexOf(v);
      out.push({ type: "LOCATION", value: v, start: s, end: s + v.length });
    }
  }
  return out;
}

// ---------------------------------------------------------------- all detectors
const PRIORITY: Record<PiiType, number> = { EMAIL: 0, URL: 1, PERSONAL_ID: 2, PHONE: 3, ADDRESS: 4, CANDIDATE: 5, LOCATION: 6 };

/** Run every detector and resolve overlaps (earliest start, then longest, then type priority). */
export function detectAll(text: string, fullName: string): Finding[] {
  // Mask existing redaction tokens so re-running on redacted text never matches inside them.
  const masked = text.replace(ANY_TOKEN, (t) => " ".repeat(t.length));
  const lines = splitLines(masked);
  const header = headerZone(lines);
  const tokens = nameTokensOf(fullName);
  const emails = detectEmails(masked);
  const urls = detectUrls(masked, header, tokens);
  const phones = detectPhones(masked);
  const names = detectName(masked, fullName);
  const ids = detectAddressAndIds(masked, lines, header);
  const contact = [...emails, ...urls, ...phones, ...names];
  const places = detectLocations(masked, lines, header, contact);
  const all = [...emails, ...urls, ...phones, ...names, ...ids, ...places].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || PRIORITY[a.type] - PRIORITY[b.type],
  );
  // Overlapping spans are merged (never dropped), so a partial overlap can't leave a fragment behind.
  const kept: Finding[] = [];
  for (const f of all) {
    const last = kept[kept.length - 1];
    if (last && f.start < last.end) {
      last.end = Math.max(last.end, f.end);
      if (PRIORITY[f.type] < PRIORITY[last.type]) last.type = f.type;
      continue;
    }
    kept.push({ ...f });
  }
  return kept.map((f) => ({ ...f, value: text.slice(f.start, f.end) }));
}
