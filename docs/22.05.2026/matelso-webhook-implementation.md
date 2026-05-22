# matelso Call-Tracking Webhook — Implementation Report (2026-05-22)

Branch: `kitta/matelso-integration` · Spec: `docs/superpowers/specs/2026-05-22-matelso-call-tracking-webhook-design.md` · Plan: `docs/superpowers/plans/2026-05-22-matelso-call-tracking-webhook.md`

Ausgeführt via Subagent-Driven-Development (Implementer + Spec-Review + Code-Quality-Review pro Task).

## Was gebaut wurde (auf dem Branch committet)

| Commit | Inhalt |
|---|---|
| `f5d7675d` / `f9cba515` | Pure Helpers `src/lib/matelso/process-call.ts` (Status-Map, Dedup-Key, Notification-Link/-Text) + 13 Tests |
| `14995092` | Migration `supabase/migrations/20260522122643_matelso_calls_table.sql` + Type in `database.types.ts` |
| `6e35153d` / `afa32578` | Route `src/app/api/webhooks/matelso/inbound/route.ts` (secret-Auth, Zod, Idempotenz, match-or-create Lead, Dispatch-Notification, Call-Record) |
| `9261c52b` | Recovery der orphaned Schema-Test-Datei (siehe unten) + Schema `src/lib/schemas/matelso-event.ts` (7 Tests) |
| `d99abe2d` | Datenschutz §10.5 (Markdown) — matelso CRM-Webhook + Art. 6 (1) b |

Zusätzlich (nicht git-tracked): formale DOCX `content/vertraege/02_Datenschutzerklaerung_DSGVO_Claimondo_v2.docx` §10.5 in place aktualisiert (gleicher Text wie Markdown; verifiziert: valide ZIP, neue Absätze + duale Rechtsgrundlagen, §10.4/§11 unberührt).

## Gate-Ergebnisse (Final-Tree)

- `npx tsc --noEmit`: **clean (exit 0)**
- `npm run build`: **grün** — Route `ƒ /api/webhooks/matelso/inbound` im Manifest. (Hinweis: `NODE_OPTIONS=--max-old-space-size=8192` nötig, sonst OOM im TS-Check-Step — gilt generell auf dieser Maschine, nicht matelso-spezifisch.)
- matelso-Tests: **20/20 grün** (7 Schema + 13 Helper).
- Volle Suite: 398 passed / 13 failed. Die 13 Failures sind **pre-existing + unrelated** (`src/lib/branding/__tests__/theme.test.ts` — Saturation/Font-Pair-Drift); kein matelso-Test betroffen. Gatender CI-Check für PRs ist `build` (grün); e2e läuft gegen Prod (nach Merge).

## Idempotenz / Robustheit (aus Code-Review)

- Call-Record per `upsert(onConflict: 'external_call_id')` (race-safe, wie aircall-Sibling) statt SELECT-then-INSERT.
- Dedup-Branch-Update mit Error-Guard → 500 bei DB-Fehler (matelso retried statt stiller Datenverlust).
- `createLead`-Fehler wird geloggt; Call wird trotzdem gespeichert (`lead_id: null`).
- Status-Mapping `/no-?answer/`-Regex statt breitem Substring (keine Fehlklassifikation).

## Incident: orphaned Task-1-Commits (behoben)

Während der Reviews wurde HEAD auf den Plan-Commit zurückgesetzt (vermutlich durch eine git-mutierende Aktion eines Review-Subagents — "working tree fully restored"). Task 1s Commits (`b6b5efeb`, `d53155d8`) wurden dadurch orphaned; die Schema-**Test**-Datei fiel still aus dem Branch. Per `git log`/`git ls-files`-Verifikation entdeckt, aus dem erreichbaren Orphan-Objekt recovered (`git checkout d53155d8 -- <test>`), Commit `9261c52b`. Lehre dokumentiert in Memory `feedback_reviewer_readonly_git`. Branch-History ist jetzt linear, 20/20 Tests grün.

## OFFEN — benötigt Aaron (in Reihenfolge)

1. **Prod-Migration anwenden** (`matelso_calls`-Tabelle existiert noch NICHT in der DB). `npx supabase db push --linked` braucht `SUPABASE_DB_PASSWORD` (nicht in `.env.local`). Entweder: Passwort bereitstellen (ich pushe), oder du fährst `db push` selbst (Worktree oder Haupt-Repo). Migration ist rein additiv (CREATE TABLE), kollidiert nicht mit den parallelen CMM-44-Drops.
2. **Smoke** (`scripts/smoke-matelso-webhook.mjs` ist noch zu schreiben — Task 5 war auf 1. gegated). Nach Migration: 4 Szenarien (answered/missed/anonym/retry) gegen lokal/Staging, self-cleaning. Erzeugt + löscht eine echte Prod-Lead-Zeile.
3. **`MATELSO_WEBHOOK_SECRET` auf VPS** (`/etc/claimondo/.env.local` + `pm2 reload claimondo-v2 --update-env`) — eigener starker Prod-Wert (der lokale Test-Wert in der Worktree-`.env.local` ist nur für die Smoke).
4. **matelso-Control-Panel**: "Wohin?" = `https://app.claimondo.de/api/webhooks/matelso/inbound?secret=<prod-secret>`, "Was?" = JSON-Body aus Spec §6. DDD-Key-Namen `callData.callId` + `callData.startTime` verifizieren.
5. **Legal-Review** des §10.5-Wortlauts (Markdown + DOCX). Typo-Nit: schließendes Anführungszeichen in „Marketing” → deutsches „Marketing“.
6. **PR**: bewusst noch NICHT geöffnet — offene staging-PRs können von der Release-Automation auto-gemergt werden (Memory `feedback_draft_pr_nicht_release_sicher`). PR erst nach grüner Smoke + deinem OK.

---

## UPDATE 2026-05-22 — Migration appliziert + Smoke grün

`supabase db push` schlug fehl (Drift: Remote-Prod hat `20260522113102 cmm44_sph_catchup_backfill` von der SP-H-Session, fehlt lokal — Branch noch nicht gesynct). Aaron hat daraufhin das Supabase-Plugin authentifiziert und Freigabe gegeben.

**Apply-Methode (bewusst):** `execute_sql` (raw DDL) statt `apply_migration` — `apply_migration` hätte eine NEUE Version in `schema_migrations` eingetragen, die NICHT zu meinem File `20260522122643` passt → Orphan-Version → hätte `db push` für alle re-broken (genau der Fehler, der oben auftrat). `execute_sql` fasst `schema_migrations` nicht an: das committete Migration-File bleibt Single Source of Truth und appliziert sauber (CREATE TABLE IF NOT EXISTS = no-op) sobald der Branch nach staging-Sync gemergt wird. `matelso_calls` (12:26) liegt chronologisch nach `113102` (11:31) → saubere Reihenfolge.

**Verifiziert auf Prod:** Tabelle existiert — 15 Spalten (exakt), RLS an, 1 Policy `matelso_calls_staff`, 6 Indexe, UNIQUE auf `external_call_id`. Kein `schema_migrations`-Eintrag (gewollt).

**Smoke (`scripts/smoke-matelso-webhook.mjs` gegen `npm start` :3000, prod-DB): SMOKE OK**
- [1] answered → neuer Lead (`is_new_lead=true`) ✓
- [2] retry gleiche `call_id` → `deduped=true`, gleiche lead_id (kein Dup) ✓
- [3] missed/anonym → Call-Record, kein Lead ✓
- [4] falsches Secret → 401 ✓ · [5] kaputtes JSON → 400 ✓
- DB: 2 Call-Records, danach Cleanup. Post-Smoke verifiziert: 0 Smoke-Zeilen, 0 `matelso_calls` total, Smoke-Lead gelöscht — Prod sauber.

**Noch offen (Aaron, extern):** `MATELSO_WEBHOOK_SECRET` auf VPS, matelso-Panel-Config, DDD-Key-Verify, Legal-Review §10.5, PR öffnen (erst wenn Legal-OK + bereit zum Merge — wegen Auto-Merge offener staging-PRs).
