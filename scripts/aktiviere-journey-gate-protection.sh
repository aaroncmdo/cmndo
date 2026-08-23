#!/usr/bin/env bash
#
# Aktiviert Branch-Protection auf `main` mit dem Journey-Gate als einzigem required check.
#
# ⚠ AARON FUEHRT DIESES SCRIPT AUS — es veraendert den Repo-Flow fuer ALLE Sessions.
#
# Warum es noetig ist: `main` ist heute NICHT branch-protected (gemessen 23.08.:
# `gh api repos/:owner/:repo/branches/main/protection` -> 404). Es gibt keinen einzigen
# required check; Regel 1 ("nie direkt auf main pushen") ist reine Konvention. Ohne
# Aktivierung kann das Journey-Gate nur BERICHTEN, nicht blockieren.
#
# Bewusst minimal gehalten:
#   - genau EIN required check (journey-gate) — keine weiteren, damit nichts still mitgatet
#   - KEINE Review-Pflicht: sonst braucht jeder Release-Drain einen zweiten Menschen
#     und die Fleet steht
#   - enforce_admins=false: der Notausgang bleibt offen
#
# Rueckgaengig:
#   gh api -X DELETE repos/:owner/:repo/branches/main/protection

set -euo pipefail

echo "=== VORHER ==="
gh api repos/:owner/:repo/branches/main/protection 2>&1 | head -3 || echo "(nicht geschuetzt)"
echo

read -r -p "Branch-Protection auf main aktivieren? Danach nimmt main keine Direct-Pushes mehr an. [j/N] " antwort
case "$antwort" in
  j|J|y|Y) ;;
  *) echo "Abgebrochen."; exit 0 ;;
esac

gh api -X PUT repos/:owner/:repo/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["journey-gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo
echo "=== NACHHER ==="
gh api repos/:owner/:repo/branches/main/protection --jq '{checks: .required_status_checks.contexts, admins: .enforce_admins.enabled, reviews: .required_pull_request_reviews}'
echo
echo "Fertig. Ein rotes Journey-Gate blockiert ab jetzt den Merge nach main."
echo "Uebersteuerung im Einzelfall: Label 'journey-override' + Begruendung als PR-Kommentar."
