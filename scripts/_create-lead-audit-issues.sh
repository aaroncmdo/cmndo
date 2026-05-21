#!/usr/bin/env bash
# One-shot: erstellt 16 Sub-Issues + 1 Epic-Issue im Repo aaroncmdo/cmndo
# aus den Befunden des Lead-Audits 20.05.2026.
#
# Voraussetzung: gh CLI eingeloggt (gh auth status).
# Idempotenz: NICHT idempotent — bei Re-Run werden Duplikate angelegt.
# Re-Run nur nach Cleanup oder bewusst gewollt.

set -euo pipefail

AUDIT_LINK="https://github.com/aaroncmdo/cmndo/blob/kitta/aar-lead-audit-followups/docs/20.05.2026/lead-audit-vertikal-horizontal.md"
COMMON_LABEL="lead-audit"

# ─── Labels sicherstellen ────────────────────────────────────────────
gh label create "$COMMON_LABEL"  --color "FFA500" --description "Lead-Subsystem-Audit 20.05.2026" 2>/dev/null || true
gh label create "P0"             --color "B60205" --description "Production-Risiko"               2>/dev/null || true
gh label create "P1"             --color "D93F0B" --description "Architektur/Konsistenz"          2>/dev/null || true
gh label create "P2"             --color "FBCA04" --description "Hygiene/Cleanup"                 2>/dev/null || true
gh label create "epic"           --color "5319E7" --description "Tracking-Issue mit Sub-Tasks"    2>/dev/null || true

URLS=()

create_issue () {
  local prio="$1" title="$2" body="$3"
  local url
  url=$(gh issue create --label "$COMMON_LABEL" --label "$prio" --title "$title" --body "$body" | tail -1)
  URLS+=("$url")
  printf '%-3s | %s\n' "$prio" "$url"
}

# ─── P0 ──────────────────────────────────────────────────────────────

create_issue P0 "Lead-Audit · Twilio-Inbound-Webhook ohne Signature-Verify" "## Befund

\`/api/webhooks/twilio/inbound/route.ts\` (610 Zeilen) verifiziert KEIN \`X-Twilio-Signature\` — Webhook ist Spoofing-fähig. Aircall macht es richtig (HMAC-SHA1).

Vorlage existiert in \`/api/twilio/inbound-kb-whatsapp/route.ts:10-24\` (\`validateTwilioSignature\`), aber dort zwei eigene Schwächen:
- nur in \`NODE_ENV === 'production'\` aktiv (Staging fängt Bugs nicht)
- URL hardcoded \`https://cmndo.vercel.app/...\` (VPS-Routing über \`app.claimondo.de\` würde Sig-Mismatch geben)

## Akzeptanzkriterien
- [ ] \`validateTwilioSignature\` portiert in \`/api/webhooks/twilio/inbound/route.ts\`
- [ ] URL aus \`NEXT_PUBLIC_APP_URL\` abgeleitet (nicht hardcoded)
- [ ] Sig-Verify in allen Envs aktiv (nicht prod-only)
- [ ] Gleiche Korrektur in \`/api/twilio/inbound-kb-whatsapp/route.ts\` mitgenommen
- [ ] Negative-Test: Request ohne gültige Sig → 403

## Aufwand
~1h

## Referenz
$AUDIT_LINK §5 P0-2 + §10.2"

# ─── P1 ──────────────────────────────────────────────────────────────

create_issue P1 "Lead-Audit · RPC convert_anfrage_zu_lead schreibt source_channel nicht (10 NULL-Leads in Prod)" "## Befund

\`supabase/migrations/20260518193208_convert_anfrage_zu_lead.sql:48-56\` INSERT listet 5 Spalten — \`source_channel\` fehlt. \`leads.status\` hat DB-Default \`'neu'\` und greift, aber \`leads.source_channel\` ist NULL-able ohne Default.

**Empirisch in Prod (\`scripts/probe-leads-source-channel-drift.sql\`):**
- 10 Leads haben \`source_channel = NULL\` — alle aus kfzgutachter-LP-RPC-Bypass
- 6 davon aktiv (\`status='neu'\`), 3 zu Fall konvertiert (permanent ohne Source-Tag), 1 disqualifiziert

## Akzeptanzkriterien
- [ ] Migration: RPC schreibt \`source_channel = 'kfzgutachter-ads-lp'\` (oder aus Anfrage-quelle ableiten)
- [ ] Backfill-Migration: existierende 10 NULL-Leads mit \`'kfzgutachter-ads-lp'\` füllen (oder \`anfragen.quelle\`-Lookup)
- [ ] Smoke: nächste kfzgutachter-LP-Submission hat \`source_channel\` gesetzt
- [ ] Erwägen: TypeScript-Wrapper um RPC der \`createLead()\`-Pattern erzwingt

## Aufwand
~1h (inkl. Backfill + Smoke)

## Referenz
$AUDIT_LINK §5 P0-1 + §11.1 + §11.2"

create_issue P1 "Lead-Audit · createManualLead Result-Pattern auf {ok} normalisieren" "## Befund

\`src/app/dispatch/leads/actions.ts:51\` returnt \`{ success, error?, leadId? }\` — alle anderen Lead-Actions + zentraler \`createLead()\` nutzen \`{ ok, error?, leadId? }\`.

AGENTS.md §Server-Actions: \"Vermeide den Mix mit \`success\` (alte Files), neue Code-Pfade nutzen \`ok\`.\"

## Akzeptanzkriterien
- [ ] Return-Type auf \`{ ok: true; leadId } | { ok: false; error }\` (discriminated union)
- [ ] Caller in \`NeuLeadDrawer.tsx\` + alle anderen Consumer angepasst
- [ ] grep \`!result.success\` in \`dispatch/leads/\` — 0 Treffer

## Aufwand
~30min

## Referenz
$AUDIT_LINK §5 P1-1"

create_issue P1 "Lead-Audit · Server-side-Zod in 3 ungeschützten Quellen" "## Befund

Drei Lead-Eintrittspunkte ohne Zod-Validation:
- \`src/app/dispatch/leads/actions.ts\` (\`createManualLead\`)
- \`src/app/dispatch/kalender/_actions/spontan.ts\` (\`createSpontanTermin\`)
- \`src/app/api/webhooks/aircall/inbound/route.ts\` (Webhook-Body)

Aktuell nur Inline-Checks → keine Typsicherheit, keine konsistente Error-Message.

## Akzeptanzkriterien
- [ ] Zentrale Schemas in \`src/lib/schemas/lead-*\` (mit P1-5/P2-8 koordinieren)
- [ ] \`.safeParse()\` in allen drei Actions
- [ ] Error-Return im bestehenden \`{ ok }\`-Pattern
- [ ] Negative-Tests pro Quelle

## Aufwand
~2h

## Referenz
$AUDIT_LINK §5 P1-2"

create_issue P1 "Lead-Audit · RLS-Test-Suite für leads-Policies" "## Befund

AAR-888 hat 9→6 RLS-Policies auf \`leads\` konsolidiert (\`leads_staff_all_consolidated\`, \`leads_kanzlei_kb_select_consolidated\`, \`leads_makler_sv_select_consolidated\`, \`lead_historie_service_only\`). Kein automatisierter Test.

Re-Check zeigte: \`SET LOCAL ROLE anon; SELECT count(*) FROM leads\` crasht mit \`permission denied for table claims\` — RLS-Policy referenziert claims, Grant-Drift möglich (siehe Issue P1-8).

## Akzeptanzkriterien
- [ ] Test-Suite \`src/lib/leads/__tests__/leads-rls.test.ts\`
- [ ] Visibility-Matrix: anon × authenticated-other × admin × dispatch × kundenbetreuer × kanzlei × makler × sv
- [ ] Pro Rolle: erwartete Lead-Sichtbarkeit (eigene vs. alle vs. keine)
- [ ] CI-Integration

## Aufwand
~2-3h

## Referenz
$AUDIT_LINK §5 P1-3 + §11.3"

create_issue P1 "Lead-Audit · Mini-Wizard Geocoding-Failure → Dispatcher-Notice" "## Befund

\`src/lib/actions/create-lead-from-mini-wizard.ts:108-127\` macht Geocoding fire-and-forget (\`void (async () => { mapbox... })()\`). Bei Mapbox-API-Fehler bleibt \`unfallort_lat/lng\` NULL → Lead wird auf Triage-Karte nicht angezeigt, ohne dass jemand erfährt warum.

## Akzeptanzkriterien
- [ ] try/catch um Geocoding-Block
- [ ] Bei Failure: \`createNotification('dispatch-rolle', 'lead-geocoding-fail', leadId)\`
- [ ] Sentry-Tag setzen für Aggregat-Monitoring
- [ ] Optional: UI-Indicator in Lead-Detail (\"Adresse konnte nicht geocoded werden\")

## Aufwand
~1h

## Referenz
$AUDIT_LINK §5 P1-4"

create_issue P1 "Lead-Audit · source_channel Union-Type + zentrales Doku-Modul (Naming-Drift fixen)" "## Befund

\`src/lib/leads/create-lead.ts:34\` typisiert \`source_channel: string\` — TypeScript erzwingt nur \"ist String\". Empirisch in Prod sind Naming-Drift sichtbar:
- underscore: \`mini_wizard\`, \`gutachter_finder_self_dispatch\`, \`self_service\`, \`dispatch_spontan\`
- Bindestrich: \`admin-direkt\`, \`aircall-inbound\`, \`kfzgutachter-ads-lp\`
- kein Trennzeichen: \`manuell\`, \`elementor\`, \`rueckruf\`

\`manuell\` ist vermutlich Alt-Naming für \`admin-direkt\`.

## Akzeptanzkriterien
- [ ] \`src/lib/leads/source-channels.ts\` mit Union-Type + Kommentar pro Wert (wer setzt ihn, woher kommt der Lead)
- [ ] \`LeadBase['source_channel']\` enger typisiert
- [ ] Naming-Convention entscheiden (Bindestrich oder underscore — eines)
- [ ] Backfill-Migration: alte/Alt-Werte konsolidieren (\`manuell\` → \`admin-direkt\`)

## Aufwand
~1h (Decision + Implementation)

## Referenz
$AUDIT_LINK §5 P1-5 + §11.2 + §11.4 P2-8"

create_issue P1 "Lead-Audit · lead_historie-Trigger für Status-Mutations" "## Befund

\`lead_historie\`-Tabelle existiert seit 13.05. (Migration \`20260513151701_aar_lead_historie_lock.sql\`), service-role-only-Architektur ist beabsichtigt — aber Production-Konversion (\`convertLeadToClaim\`, \`mark_expired_leads\`, \`updateLeadStatus\`) loggt keine Audit-Einträge.

Compliance-Lücke. Bei Streit (\"warum disqualifiziert?\", \"wer hat Status geändert?\") gibt es keine Spur.

## Akzeptanzkriterien
- [ ] AFTER-UPDATE-Trigger auf \`public.leads\` der bei Änderung von \`status\`/\`disqualifiziert\`/\`qualifizierungs_phase\` einen \`lead_historie\`-Eintrag schreibt
- [ ] \`geaendert_von\` aus \`auth.uid()\` (oder \`service_role\` wenn NULL)
- [ ] Migration via supabase-CLI (AGENTS.md Regel 2)
- [ ] Smoke: einmal \`status\` ändern → Eintrag in \`lead_historie\` sichtbar
- [ ] Optional: auch \`disqualifiziert\` bei Auto-Cron einbeziehen

## Aufwand
~2h (inkl. Migration + Smoke)

## Referenz
$AUDIT_LINK §5 P0-3 + §10.1"

create_issue P1 "Lead-Audit · RLS-Function-Grant-Sweep nach AAR-894-Pattern" "## Befund

RLS-Smoke (\`scripts/probe-leads-rls-smoke.sql\`) crasht mit:
\`42501: permission denied for table claims — HINT: Grant the required privileges to the current role with: GRANT SELECT ON public.claims TO anon\`

RLS-Policy auf \`leads\` referenziert \`claims\` (vermutlich via SECURITY-INVOKER-Pfad oder Join), Grant ist nicht durchgängig.

Memory \`feedback_rls_function_grants\`: SECURITY-DEFINER-Functions in RLS-Policies verlieren \`GRANT EXECUTE TO authenticated\` bei \`CREATE OR REPLACE\` / Policy-Refactor — passierte schon bei AAR-894 (\`dispatcher_owns_lead\`, \`is_claim_user_party\`, \`is_sv_for_claim\`).

## Akzeptanzkriterien
- [ ] Sweep aller SECURITY-DEFINER-Functions die in RLS-Policies referenziert sind
- [ ] Pro Function: \`GRANT EXECUTE ... TO authenticated, service_role\` verifiziert
- [ ] Migration falls Grants fehlen
- [ ] Test: anon kann \`leads\`-RLS-Smoke ohne \`claims\`-Permission-Error fahren (entweder durch SECURITY-DEFINER-Wrap oder durch korrekten Function-Pfad)

## Aufwand
~2h

## Referenz
$AUDIT_LINK §11.3"

create_issue P1 "Lead-Audit · 3 fehlende Lead-Quellen ins Vertikal-Inventar nachziehen" "## Befund

Live-DB-Probe entdeckte 3 Lead-Quellen die im Vertikal-Audit nicht erfasst wurden:
- \`gutachter_finder_self_dispatch\` — **63 Leads, 34 konvertiert (höchste Konversionsrate)**
- \`self_service\` — 7 Leads
- \`elementor\` — 1 Lead (alter WordPress-Funnel?)

Audit hatte 7 Quellen; real existieren mindestens 10. Konsequenz: das Lifecycle-Trace ist unvollständig — die wichtigste Quelle (gutachter_finder mit 54% Konversion) hat keinen dokumentierten End-to-End-Trace.

## Akzeptanzkriterien
- [ ] Vertical-Trace für \`gutachter_finder_self_dispatch\` (Quelle 8) — von Karte-Click bis Lead-Insert
- [ ] Vertical-Trace für \`self_service\` (Quelle 9)
- [ ] \`elementor\`: entweder dokumentieren oder als legacy markieren (Sourcen-Decision)
- [ ] Audit-MD \`docs/20.05.2026/lead-audit-vertikal-horizontal.md\` §2 ergänzen

## Aufwand
~1.5h

## Referenz
$AUDIT_LINK §11.2"

# ─── P2 ──────────────────────────────────────────────────────────────

create_issue P2 "Lead-Audit · convert_anfrage_zu_lead Channel-Side-Effects (Decision)" "## Befund

Migration \`20260518193208\`:58-89 hat auskommentierte Channel-Side-Effects mit dokumentierten Blockern:
- Gutachter-Termin-Channel: \`admin_termine.erstellt_von\` ist NOT NULL, RPC-Caller liefert keine \`auth.uid()\`
- Makler-Channel: \`leads.vermittelnder_makler_id\` existiert nicht

Tech-Debt-Markierung — Decision treffen.

## Akzeptanzkriterien
- [ ] Decision: aktivieren (Migration für nullable + Spalte) oder Code löschen
- [ ] Bei aktivieren: Migration + Test
- [ ] Bei löschen: auskommentierte Blöcke + Erklärungs-Kommentare weg

## Aufwand
~0.25h Decision + 0.5-2h Implementation

## Referenz
$AUDIT_LINK §5 P2-1"

create_issue P2 "Lead-Audit · Auto-Disqualifikation Dispatcher-Notice" "## Befund

RPC \`mark_expired_leads()\` setzt \`disqualifiziert=true\` nach 7 Tagen blind. Cron \`send-lead-reminders\` ruft die RPC auf — aber Dispatcher bekommen keine Notification dass Leads auto-disqualifiziert wurden.

## Akzeptanzkriterien
- [ ] Nach RPC: \`SELECT id, vorname, nachname FROM leads WHERE just_disqualified\` (RPC-Return erweitern)
- [ ] Bulk-Notification an dispatch-Rolle mit Liste
- [ ] Oder: \`NOTIFY pgcron\` raus + Cron pickt es auf

## Aufwand
~1h

## Referenz
$AUDIT_LINK §5 P2-2"

create_issue P2 "Lead-Audit · Phase-Components zu primitives.Card refactoren" "## Befund

\`src/app/dispatch/leads/[id]/ExitSkript.tsx\` + 2-3 weitere Phase-Components nutzen handgerolltes Tailwind (\`bg-red-50 border-red-200\`) statt \`primitives.Card\` / \`shared.SectionCard\`.

AGENTS.md §claimondo-component-set: Atom-Layer = \`primitives/*\` ist Pflicht für neue Components.

## Akzeptanzkriterien
- [ ] \`ExitSkript.tsx\` refactored zu \`primitives.Card\` + \`primitives.Alert\` (oder \`shared.SectionCard\`)
- [ ] Sweep der Phase-Files auf Tailwind-Defaults statt Claimondo-Tokens
- [ ] Visuelle Smoke (Dispatch-Lead-Detail)

## Aufwand
~1.5h

## Referenz
$AUDIT_LINK §5 P2-3"

create_issue P2 "Lead-Audit · cmndo.vercel.app Hardcoded-Fallback-Cleanup (22+ Stellen)" "## Befund

Memory \`project_vps_infrastructure\`: prod läuft auf \`app.claimondo.de\` (VPS), nicht mehr Vercel. Code hat 22+ Stellen mit Fallback \`process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'\`.

Lead-direkt-relevant:
- \`src/lib/whatsapp.ts:325\` — Magic-Link-URL für WA-Sends an Leads
- \`src/app/flow/[token]/actions.ts:1073\` — Flow-Wizard (Lead-Erfassung)
- \`src/lib/termine/trigger-losgefahren.ts:83\` — Termin-Tracking-Links

Wenn \`NEXT_PUBLIC_APP_URL\` korrekt gesetzt → kein Issue. Risiko: ENV-Reset würde Lead-Magic-Links auf tote Vercel-URL leiten.

## Akzeptanzkriterien
- [ ] ENV-Audit: \`NEXT_PUBLIC_APP_URL=https://app.claimondo.de\` in \`/etc/claimondo/.env.local\` (prod) und \`app.staging.claimondo.de\` (staging) verifiziert
- [ ] Code-Fallback auf \`app.claimondo.de\` aktualisiert ODER throw bei fehlender ENV
- [ ] Sweep über alle 22+ Stellen

## Aufwand
~1h

## Referenz
$AUDIT_LINK §10.3"

create_issue P2 "Lead-Audit · Index auf leads.status (Performance)" "## Befund

Index-Sweep zeigt: \`leads\` hat 6 Indizes, **keinen auf \`status\`**. Dispatch-Lead-Liste filtert nach \`status\` (Default-View), Cron \`dispatch-lead-alert\` scannt \`qualifizierungs_phase='neu' > 5min\`. Bei wachsender Lead-Tabelle wird Seq-Scan teuer.

## Akzeptanzkriterien
- [ ] \`CREATE INDEX idx_leads_status ON public.leads(status)\` via supabase-CLI-Migration
- [ ] Erwägen: composite \`(status, created_at DESC)\` für Dispatch-Sort
- [ ] EXPLAIN ANALYZE vor/nach an typischer Query

## Aufwand
~30min (inkl. Migration)

## Referenz
$AUDIT_LINK §10.5"

# ─── Epic mit Checkbox-Liste ─────────────────────────────────────────

EPIC_BODY="## Zweck

Tracking-Issue für die 15 Sub-Issues des Lead-Subsystem-Audits vom 20.05.2026.

## Audit-Report

$AUDIT_LINK

Branch: \`kitta/aar-lead-audit-followups\` (Commit \`69c8580b\`)

## TL;DR (Audit-Befunde)

- **1 P0** (Twilio-Webhook-Spoofing)
- **9 P1** (Architektur/Konsistenz — inkl. RPC-source_channel-Drift empirisch 10 Leads NULL)
- **6 P2** (Hygiene/Cleanup)
- **2 Agent-Falsch-Positive** im Re-Check korrigiert (\`quali-offen\` ist im Enum, \`#25D366\` ist whitelisted)

## Sub-Issues

### P0
$(printf -- '- [ ] %s\n' "${URLS[0]}")

### P1
$(printf -- '- [ ] %s\n' "${URLS[1]}" "${URLS[2]}" "${URLS[3]}" "${URLS[4]}" "${URLS[5]}" "${URLS[6]}" "${URLS[7]}" "${URLS[8]}" "${URLS[9]}")

### P2
$(printf -- '- [ ] %s\n' "${URLS[10]}" "${URLS[11]}" "${URLS[12]}" "${URLS[13]}" "${URLS[14]}")

## Methodik

2 parallele Explore-Agents (vertikal + horizontal) → 2 Re-Check-Runden → 1 Live-DB-Verifikation gegen Prod. Probe-SQLs unter \`scripts/probe-leads-*.sql\` aufbewahrt.

## Bundling-Vorschlag

- **Sicherheit-PR:** P0-Twilio
- **RPC-Cleanup-PR:** convert_anfrage_zu_lead source_channel + Channel-Side-Effects + Backfill
- **Konsistenz-PR:** createManualLead Result-Pattern + Zod + source_channel-Union + lead_historie-Trigger
- **Hygiene-PR:** Index, Phase-Components, Auto-Disqualifikations-Notice
- **Eigenständig:** RLS-Test-Suite, Function-Grant-Sweep, fehlende Lead-Quellen-Trace, Vercel-Fallback-Sweep
"

EPIC_URL=$(gh issue create --label "$COMMON_LABEL" --label "epic" --title "Lead-Audit Epic (20.05.2026) — Tracking" --body "$EPIC_BODY" | tail -1)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "EPIC: $EPIC_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
