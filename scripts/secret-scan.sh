#!/usr/bin/env bash
# Fails if the staged diff (or a given directory with --dir) contains secret-looking strings
# or any actual value from .env.local. Never prints the matched value.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERNS='AIza[0-9A-Za-z_-]{20,}|AQ\.Ab[0-9A-Za-z_-]{20,}|eyJ[0-9A-Za-z_-]{20,}\.|sb_secret[_][0-9A-Za-z_-]{16,}|service_role"?\s*[:=]\s*"?eyJ'
fail=0
if [[ "${1:-}" == "--dir" ]]; then
  target="$2"
  if grep -rEIl "$PATTERNS" "$target" 2>/dev/null; then echo "secret-scan: pattern match in files above"; fail=1; fi
else
  diff=$(git diff --cached -U0 --no-color || true)
  if echo "$diff" | grep -Eq "$PATTERNS"; then echo "secret-scan: secret-like pattern in staged diff"; fail=1; fi
fi
# actual values from .env.local (only long ones, to avoid trivial matches)
if [[ -f .env.local ]]; then
  while IFS='=' read -r k v; do
    [[ -z "${k// }" || "$k" == \#* ]] && continue
    case "$k" in GEMINI_MODEL|STORAGE_DRIVER|SUPABASE_URL|LOCAL_DATA_DIR) continue ;; esac  # not secrets
    v="${v%%#*}"; v="$(echo -n "$v" | xargs)"
    [[ ${#v} -lt 12 ]] && continue
    if [[ "${1:-}" == "--dir" ]]; then
      if grep -rFIlq -- "$v" "$target" 2>/dev/null; then echo "secret-scan: value of $k found in $target"; fail=1; fi
    else
      if echo "$diff" | grep -Fq -- "$v"; then echo "secret-scan: value of $k found in staged diff"; fail=1; fi
    fi
  done < .env.local
fi
if git ls-files --cached | grep -E '(^|/)\.env' | grep -v '\.env\.example$'; then echo "secret-scan: env file staged"; fail=1; fi
[[ $fail -eq 0 ]] && echo "secret-scan: clean" || exit 1
