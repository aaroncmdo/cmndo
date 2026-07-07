# Data-Integrity-Guard — Design (Ship-Safety P1)

**Goal:** Die „Feature geshippt, aber Bestand/Neu nicht korrekt verdrahtet"-Klasse (stille Daten-Lücken) **detektieren** — durch neue Health-Checks, die verletzte Daten-Invarianten gegen Prod finden + alerten. Fängt genau die 2 Lücken die im Prod-Smoke 05.–06.07. auftraten (Pflichtdokument-Slots, Reminder-Queuer) plus eine bekannte 3. Klasse (geschädigte Partei).

**Scope:** P1 von 3 Ship-Safety-Sub-Projekten (danach: Test-Account/Seed-Infra, dann Golden-Path-E2E). Nur **DETECT** (nicht PREVENT/CI-Gate — separates Folge-Projekt falls nötig).

## Kontext / bestehendes System (wir bauen darauf, keine neue Infra)

Health-Check-Framework existiert in `src/lib/health/`:
- `types.ts`: `HealthCheck = { id, category: 'funnel'|'cron'|'sends'|'config', title, run(ctx)→CheckResult }`; `CheckResult = { status: 'ok'|'warn'|'crit'|'error', metric?, detail (dt), sampleIds? (≤5) }`; `CheckCtx = { supabase }` (injizierter Admin/Service-Role-Client). Checks sind **rein read-only**.
- `checks/index.ts`: Registry `ALL_CHECKS` (aktuell 11 Checks).
- `run-checks.ts` (Runner, isoliert Check-Fehler), `persist-and-alert.ts` → Tabelle `health_check_runs`, `alert-email.ts`, Dashboard `/admin/health`.

Muster-Referenz: `checks/reminders-overdue.ts` (+ dessen Test).

## Architektur

**3 neue Files** `src/lib/health/checks/<name>.ts`, je ein exportiertes `HealthCheck`-Const (read-only-Query → zählt Invarianten-Verletzungen → Schwellen bestimmen `status` → bis 5 `sampleIds` zur Triage). **Registrierung:** je 1 Import + 1 Array-Eintrag in `checks/index.ts` (die einzige geteilte Datei — additiv, konfliktarm). Kategorie: bestehende (`funnel`/`cron`) wiederverwenden (YAGNI, keine neue Kategorie). Je 1 Unit-Test unter `checks/__tests__/<name>.test.ts` im Muster von `reminders-overdue.test.ts`.

**Design-Prinzip — saubere ~0-Baseline:** Ein Health-Check mit persistenter Verletzungs-Baseline = Alert-Fatigue → wird ignoriert. Jeder Check ist so gescoped, dass er **heute ~0** zurückgibt und nur **Regressionen** (neue Lücken) flaggt. An Prod 2026-07-07 kalibriert.

## Die 3 Checks

### 1. `claims-missing-pflichtdokumente` (category: `funnel`)
**Invariante:** Jeder aktive, recente Claim hat Pflichtdokument-Slots (`pflichtdokumente`-Zeilen) — sonst kann der Kunde keine Pflicht-Doku hochladen.
**Query:** `claims c` WHERE `c.abgeschlossen_am IS NULL AND c.deaktiviert_am IS NULL AND c.created_at > now() - interval '14 days' AND NOT EXISTS (select 1 from pflichtdokumente p where p.fall_id = c.id)`.
**Warum 14-Tage-Fenster:** Slot-Init wurde ~Ende Juni in den Konvertierungs-Pfad eingebaut; alle 10 slot-losen Bestands-Claims sind ≤2026-06-15 (Test/historisch). Kalibriert: 7d=0, 14d=0, 30d=1 → 14d gibt Baseline 0. Ein *recenter* aktiver Claim ohne Slots = echte Regression (Slot-Init im Erstell-Pfad fehlgeschlagen). Die 10 Alt-Claims werden bewusst NICHT geflaggt (separates Backfill-Cleanup, s.u.).
**Schwellen:** `metric ≥ 1 → warn`, `≥ 3 → crit`.
**Detail:** „N recente aktive Claims ohne Pflichtdokument-Slots — Slot-Init im Claim-Erstell-Pfad fehlgeschlagen, Kunde kann keine Pflicht-Doku hochladen." `sampleIds` = claim-IDs.

### 2. `termine-missing-reminders` (category: `cron`)
**Invariante:** Jeder bestätigte Zukunfts-Gutachter-Termin hat Kunden-Reminder (`termin_reminders`) — sonst kein Erinnerungs-Versand → No-Show-Risiko.
**Query:** `gutachter_termine gt` WHERE `gt.start_zeit > now() AND gt.status = 'bestaetigt' AND NOT EXISTS (select 1 from termin_reminders tr where tr.termin_id = gt.id)`.
**Baseline:** 0 (verifiziert; die 1 gefundene Lücke wurde 06.07. via `/api/reminder-generate` gefixt). Kein Zeitfenster nötig — künftige Termine sind per Definition „recent". `dispatch_pending` (noch kein SV bestätigt) + `storniert`/`verschoben`/`abgeschlossen` sind bewusst ausgeschlossen (nur `bestaetigt` erwartet Reminder).
**Schwellen:** `metric ≥ 1 → warn`, `≥ 3 → crit`.
**Detail:** „N bestätigte Zukunfts-Termine ohne Reminder — der Queuer (`generateReminderForTermin`) feuerte beim Buchen/Bestätigen nicht, Kunde bekommt keine Termin-Erinnerung." `sampleIds` = termin-IDs.

### 3. `claims-missing-geschaedigter` (category: `funnel`)
**Invariante:** Jeder aktive Claim hat eine geschädigte Partei (`claim_parties` mit `rolle = 'geschaedigter'`) — sonst laufen Kunde-/Halter-Edits in der Fallakte ins Leere.
**Query:** `claims c` WHERE `c.deaktiviert_am IS NULL AND NOT EXISTS (select 1 from claim_parties cp where cp.claim_id = c.id and cp.rolle = 'geschaedigter')`.
**Baseline:** 0 (verifiziert; der `createClaimForFall`-Bug der das verursachte ist behoben + gelöscht — AGENTS.md). Hard invariant, kein Fenster — jede Verletzung = echte Regression.
**Schwellen:** `metric ≥ 1 → warn`, `≥ 3 → crit`.
**Detail:** „N Claims ohne geschädigte Partei — Claim-Erstellung hat keine `geschaedigter`-`claim_parties`-Zeile angelegt, Kunde-/Halter-Edits in der Fallakte greifen nicht." `sampleIds` = claim-IDs.

## Error-Handling
Pro Check: DB-Fehler → `{ status: 'error', detail: 'DB-Fehler beim Prüfen …: ${error.message}' }` (Muster der bestehenden Checks). Der Runner (`run-checks.ts`) isoliert throwende Checks — ein Fehler in einem Check bricht die anderen nicht (verifiziert in `run-checks.test.ts`).

## Testing
Je Check ein Unit-Test `checks/__tests__/<name>.test.ts` im Muster `reminders-overdue.test.ts`: gemockter Supabase-Client (`.from().select()…`-Kette), 3 Szenarien — (a) Verletzung → erwarteter `status`/`metric`/`sampleIds`, (b) clean → `status: 'ok'`, `metric: 0`, (c) DB-Fehler → `status: 'error'`.

## Was NICHT dazugehört (YAGNI / explizit ausgeschlossen)
- **PREVENT / CI-Gate** (Option b aus dem Brainstorming) — separates, code-level Projekt, schwer generisch zu automatisieren. Nur falls die DETECT-Checks zeigen, dass Regressionen häufig durchrutschen.
- **Backfill der 10 historischen slot-losen Alt-Claims** — separates, niedrig-prio Daten-Cleanup. Die Checks flaggen sie bewusst NICHT (14d-Fenster), um die Baseline sauber zu halten.
- **Weitere Invarianten** (Claim ohne Fahrzeug, `claims.sv_id` gesetzt ohne SV-Record, …) — additive Folge-Checks nach v1, gleiches Muster.

## Rollout
Die 3 Checks laufen automatisch mit dem bestehenden Health-Check-Cron (durchläuft `ALL_CHECKS`), erscheinen auf `/admin/health` + alerten bei `warn`/`crit` über die bestehende Alert-Email. Kein neuer Cron, kein Deployment-Setup, keine DDL/Migration. Kollisionsarm: 6 neue Files + 3 additive Zeilen in `checks/index.ts`.
