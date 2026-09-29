#!/usr/bin/env bash
# One-command production deploy with the Vercel CLI (run `npx vercel login` once first).
# Links the project, copies the needed env vars from .env.local into Vercel (values are piped, never printed),
# forces STORAGE_DRIVER=neon, runs the Neon schema setup, and deploys to production.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.local ]] || { echo "missing .env.local"; exit 1; }
# read KEY=VALUE lines literally (values may contain <, >, &, spaces)
env_get() { local line; line=$(grep -m1 "^$1=" .env.local || true); line="${line#*=}"; printf '%s' "${line%%  #*}"; }
DATABASE_URL=$(env_get DATABASE_URL); GEMINI_API_KEY=$(env_get GEMINI_API_KEY); GEMINI_MODEL=$(env_get GEMINI_MODEL)
RESEND_API_KEY=$(env_get RESEND_API_KEY); RESEND_FROM=$(env_get RESEND_FROM); EMAIL_MODE=$(env_get EMAIL_MODE)
EMAIL_REDIRECT_TO=$(env_get EMAIL_REDIRECT_TO)
[[ -n "${DATABASE_URL:-}" ]] || { echo "Set DATABASE_URL (Neon) in .env.local first."; exit 1; }
[[ -n "${GEMINI_API_KEY:-}" ]] || { echo "Set GEMINI_API_KEY in .env.local first."; exit 1; }

echo "1/4 Neon schema"
npx tsx --env-file=.env.local scripts/neon-setup.ts

echo "2/4 Link Vercel project"
npx vercel link --yes --project "${VERCEL_PROJECT:-kargo-hiring-dashboard}" ${VERCEL_SCOPE:+--scope "$VERCEL_SCOPE"}

echo "3/4 Environment variables (production + preview)"
put() { # name value
  local name="$1" value="$2"
  [[ -z "$value" ]] && return 0
  for target in production preview; do
    npx vercel env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$name" "$target" >/dev/null
  done
  echo "  set $name"
}
put GEMINI_API_KEY "$GEMINI_API_KEY"
put GEMINI_MODEL "${GEMINI_MODEL:-gemini-3.8-flash}"
put STORAGE_DRIVER "neon"
put DATABASE_URL "$DATABASE_URL"
put RESEND_API_KEY "${RESEND_API_KEY:-}"
put RESEND_FROM "${RESEND_FROM:-}"
put EMAIL_MODE "${EMAIL_MODE:-redirect}"
put EMAIL_REDIRECT_TO "${EMAIL_REDIRECT_TO:-}"

echo "4/4 Deploy to production"
npx vercel deploy --prod --yes
