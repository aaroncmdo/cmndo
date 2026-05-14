# Session-Recap 2026-05-14 — RLS-Hardening-Tag

Großer RLS-Hardening-Sprint plus Linear-Backlog-Cleanup. 9 Migration-PRs, alle Migrations live in Prod-DB via Recovery-Pfad, alle PRs gemerged in `staging`.

## Was gemacht wurde

### 9 RLS-Hardening-PRs (alle in `staging` gemerged, außer #1083 noch In Review)

| PR | Ticket | Effekt |
| --- | --- | --- |
| #1044 | AAR-888 | DROP 5 anon-Policies (`Anon sign faelle`, 4× `Flow anon …`) + DROP `benachrichtigungen.System insert` + TIGHTEN `profiles.Profil erstellen` auf `id = auth.uid()` |
| #1063 | AAR-862 | Storage-Reorg auf `claims/{claim_id}/<segment>/` + `fall_dokumente.claim_id` FK + Sync-Trigger + Code-Refactor in 8 Files + 4 Read-`.like()`-Stellen umgestellt + Backfill des 1 existierenden Files |
| #1065 | AAR-709 | Service-Role-Only-Policies für 6 Tabellen (`kunde_gutachten_requests`, `rechnungs_konfiguration`, `rechnungs_nr_counter`, `sv_onboarding_rechnungen`, `task_reminders`, `whatsapp_inbound_messages`) + REVOKE ALL FROM anon/authenticated/public |
| #1066 | AAR-711 | DROP buggy `incentives_all_public_consol` (doppelt `admin`) + DROP buggy `incentives_select_public_consol` (`true OR x`) + RENAME `sla_tracking.Admins read sla_tracking` → `staff_read_sla_tracking` |
| #1071 | AAR-851 | REVOKE SELECT FROM anon auf 14 Welle-7-Tabellen + `v_claim_timeline` (`claims`, `claim_payments`, `claim_parties`, `claim_mietwagen`, `claim_vehicle_involvements`, `gutachten`, `gutachten_fotos`, `gutachten_positionen`, `gutachter_termine`, `kanzlei_pakete`, `phase_transitions`, `repairs`, `vs_korrespondenz`, `airdrop_invitations`) |
| #1076 | (kein Linear) | REVOKE EXECUTE FROM PUBLIC/anon/authenticated auf 16 SECURITY DEFINER Functions (`is_*`-Helper, `can_access_fall`, `dispatcher_owns_lead`, `get_*`, `sync_fall_dokumente_claim_id`, `upsert_vehicle_by_fin`) |
| #1078 | AAR-895 | Service-Role-Only-Policies für 3 RLS-no-policy-Tabellen (`conversion_events`, `flow_links`, `lead_historie`) + REVOKE ALL |
| #1083 | AAR-896 | DROP breite SELECT-Policies auf 3 Public-Buckets (`avatare_public_read`, `gutachter_logos_select`, `profile_select`) + CREATE `avatare_owner_list` (foldername[1] = auth.uid()) |
| #(separat) | — | Aaron-Hotfix `95d6aa3a`: GRANT EXECUTE TO authenticated zurück für 5 Portal-Guard-Functions (`is_staff`, `is_admin`, `is_dispatcher`, `is_kundenbetreuer`, `can_access_fall`) wegen Portal-Login-Crash nach REVOKE in #1076 |

**Smoke gegen `staging.claimondo.de`:**

- AAR-888: 3× SQL-Proof auf `profiles`-Policy (anon-Block 42501, auth+match Pass, auth+mismatch Block) + 2× UI-Smoke (Login `test-dispatch@`, Magic-Link `/flow/<token>`)
- AAR-851: Server-Component-Render-Smoke (Login-Redirect, kein 5xx)
- Screenshots in `docs/14.05.2026/aar-888-smoke/` + `aar-851-smoke/`

### Advisors-Bilanz

| Vorher (Tagesstart) | Heute | Δ |
| --- | --- | --- |
| ~50 Security-Lints | **7 Lints** | -43 |

Restliche 7 sind alle bekannt + bewusst:

- 5× `authenticated_security_definer_function_executable` → **By-design** (Aaron-Hotfix für Portal-Guard, RLS-Policy-Evaluierung braucht EXECUTE)
- 1× `rls_policy_always_true` auf `gutachter_finder_anfragen.gfa_insert_public` → **Gewollt** (öffentliches Formular, Rate-Limit als Folge-Ticket)
- 1× `auth_leaked_password_protection` → **Auth-Setting**, im Supabase-Dashboard aktivierbar

### Linear-Backlog-Cleanup

20 In-Progress-Tickets durchgegangen, Status korrigiert:

**5× Done** (PRs schon gemerged): CMM-39, CMM-22, CMM-23, CMM-24, AAR-504

**15× Canceled** (Welle-7-Cluster komplett verworfen, alle PRs CLOSED, ersetzt durch CMM-Strecke):
AAR-815, AAR-816, AAR-818, AAR-825, AAR-826, AAR-829, AAR-830, AAR-831, AAR-832, AAR-838, AAR-840, AAR-841, AAR-842, AAR-844, AAR-845

**Effekt:** 0 Tickets mehr in In-Progress-Drift.

### Neue Linear-Tickets

- **AAR-895** RLS-no-policy Cleanup conversion_events/flow_links/lead_historie (heute, jetzt Done)
- **AAR-896** Public-Bucket SELECT-Policies einengen (heute, In Review)

## Wichtige technische Details (für Future-Aaron)

### Drift-Recovery-Pfad

Alle 9 Migrations wurden via Recovery-Pfad applied (AGENTS.md Regel 2 explizit erlaubt):

```bash
supabase db query --linked --file <migration.sql>
supabase migration repair --status applied <version>
```

Grund: 2 out-of-band-DDL-Migrations (`20260513183014` + `20260513183406`) sind in der Prod-DB applied, aber nicht im Git. Cleanup-Branch `kitta/aar-rls-drift-backfill` existiert für die endgültige Behebung — wurde heute nicht weitergeführt.

### REVOKE EXECUTE auf SECURITY DEFINER Functions

PUBLIC muss mit gerevoked werden (Postgres-Default für Functions). Erste Migrations-Variante mit nur `FROM anon, authenticated` hatte 15/16 Functions unverändert gelassen — Fix war `FROM PUBLIC, anon, authenticated`.

Aaron's Hotfix-Commit `95d6aa3a` hat dann GRANT EXECUTE für 5 Portal-Guard-Functions zurück an authenticated gegeben weil Portal-Login mit "permission denied for function is_staff" gecrasht ist. Die `is_*`-Helper werden **indirekt** im authenticated-Kontext aufgerufen (Portal-Guard, PostgREST-Resolver) — Code-Trace via `.rpc('is_admin')` zeigt 0 Treffer, weil die Calls implizit über RLS-Policy-Evaluation laufen.

**Lesson:** Code-Trace allein reicht nicht für REVOKE auf RLS-Helper-Functions. Wenn Portal-Guard sie aufruft (z.B. via View mit `security_invoker=on`), bricht es trotz 0 `.rpc()`-Treffern im Code.

### Storage-Pfade vereinheitlicht

8 Code-Stellen + 4 Read-`.like()`-Stellen auf `claims/{claim_id}/<segment>/` umgestellt. Es gab zuvor **4 parallele Konventionen** (`kunde-uploads/`, `gutachter-dateien/`, `sa-dokumente/`, `claim/` Singular). Jetzt einheitlich `claims/` (Plural).

Backfill-Skript `scripts/aar-862-storage-backfill.mjs` für künftige Re-Runs.

## Was als Nächstes ansteht

### Sofort (Quick-Wins)

- [ ] PR #1083 AAR-896 Bucket-Listings mergen (mein letzter offener RLS-PR)
- [ ] PR #1080 AAR-894 Dispatcher-Karte v1 reviewen (Aaron's eigenes Ticket)
- [ ] PR #1057 AAR-892 Layout-Hygiene reviewen (Aaron's eigenes Ticket)
- [ ] staging → main Sync für die heutigen RLS-PRs
- [ ] Supabase-Dashboard: "Leaked Password Protection" aktivieren (HaveIBeenPwned-Check)

### Mittelfristig

- [ ] **AAR-623** klären (Kundenportal WhatsApp-Tasks, seit 20.04. In Review ohne PR — verworfen oder fertigstellen?)
- [ ] **PR #974** CJ-Smoke-Framework entscheiden (alter PR von 13.05.)
- [ ] **Performance-Advisors** durchschauen (heute nur Security)
- [ ] **Drift-Backfill** abschließen (`kitta/aar-rls-drift-backfill`-Branch)
- [ ] **`gutachter_finder_anfragen.gfa_insert_public`** Rate-Limit-Ticket anlegen (bewusst gelassen, aber irgendwann)

### Backlog (Memory `live_rls_audit` listet noch HIGH-Punkte)

- [ ] makler/sv mass-assignment
- [ ] abrechnungen RLS
- [ ] audit-spoofing
- [ ] conversion_events deeper-Audit (wir haben jetzt nur service_only gemacht)

## Smoke-Risiken die offen sind

- **Realtime-Subscription** auf `gutachter_termine` nach AAR-851 REVOKE — nicht autonom verifiziert weil kein aktiver Termin-Token verfügbar war. Sollte funktionieren (Publication ist orthogonal zu Table-Grants), aber Reviewer-Smoke gegen Live-Termin offen.
- **Email-OTP-Flow** nach AAR-888 `profiles`-Tighten — nicht autonom testbar (Email-Mailbox-Zugriff fehlt). SQL-Tests A/B/C decken die Policy-Logik exakt ab, aber End-to-End Kunde-Onboarding bleibt offen.
- **Cardentity-Re-Check** + andere Crons die jetzt auf den 6 `_service_only`-Tabellen lesen — alle Caller via service_role, sollte funktionieren.

## Recovery-Pfad-Status DB ↔ Git

DB ist vor Git in 2 Stellen (`20260513183014` + `20260513183406`). Alle heutigen Migrations sind sowohl in DB als auch im Git. Beim nächsten `supabase db push` würde es wieder den Drift-Fehler bringen — Drift muss separat aufgeräumt werden (`kitta/aar-rls-drift-backfill`-Branch nicht vergessen).

---

## Nachmittags-Update (ab ~13:30 Uhr)

Quick-Wins-Abarbeitung nach Recap-Erstellung. Alle „Sofort"-Punkte abgehakt + ein zusätzliches anon-Cleanup als Folge-Findung.

### Quick-Wins durchgezogen

| Quick-Win | Ergebnis | PR |
|---|---|---|
| PR #1083 AAR-896 Bucket-Listings mergen | ✅ Squash → staging | #1083 |
| PR #1080 AAR-894 Dispatcher-Karte reviewen | ✅ Review + Merge | #1080 |
| PR #1057 AAR-892 Layout-Hygiene reviewen | ✅ Review + Conflict-Resolution (GutachterShell) + Squash-Merge | #1057 |
| staging → main Sync für Nachmittag-PRs | ✅ 13 Commits inkl. AAR-896 + AAR-894 + imgly | #1089 |
| Leaked-Password-Protection im Dashboard | ✅ Aaron hat Toggle aktiviert (Authentication → Providers → Email) | — |

**GutachterShell-Conflict bei #1057:** beide Branches modifizierten den Return-`<div>` — staging hatte fontVars/fontPair-Logik aus dem Whitelabel-Imgly-Paket, AAR-892 wollte `<MitteilungenProvider>`-Wrap. Lösung: Provider außen, alle staging-Style-Props innen. Resolution lief in isoliertem Worktree (`claimondo-v2-aar892-merge`), nicht im Haupt-Working-Tree — kein Stash, kein WIP-Risiko für Aarons paralleles `kitta/aar-902-mini-wizard-prototyp`.

### REVOKE-Falle nachgezogen (#1091 + #1096)

Aarons **#1091** (12:16 Uhr) war ein Urgent-Fix nach dem #1076-REVOKE-Batch: 5 weitere is_*-Helper-Functions (`is_sv`, `is_kanzlei`, `is_claim_user_party`, `is_dat_badge_sichtbar`, `is_sv_for_claim`) hatten silent EXECUTE-Permission verloren, RLS-Policies die sie verwenden brachen → UI-Crashes + unsichtbare Daten. #1091 hat GRANT'd TO **anon, authenticated** — der anon-Grant war prophylaktisch.

**Folge-Findung im Advisor-Check (17 Lints, vorher 7):** Die 5 anon-Grants waren übers Ziel hinaus. Audit via `pg_policies` + `pg_views` + `pg_proc` + grep auf `.rpc()`-Calls zeigte:

- `is_sv`/`is_kanzlei` — nur in authenticated-only-Policies aufgerufen (tasks, vertragsvorlagen, forderungspositionen)
- `is_claim_user_party` — in claims/claim_parties Policies mit `{public}`-Rolle, ABER anon hat kein SELECT-Grant auf diese Tabellen → Policy feuert für anon eh nie
- `is_dat_badge_sichtbar` — Orphan: 0 Policies, 0 Views, 0 andere Functions; einzige Caller-Datei `src/lib/sv/qualifikationen-gate.ts` ist Dead-Code (nirgends importiert)
- `is_sv_for_claim` — 0 Caller in DB + Code

**PR #1096** hat alle 5 sauber `REVOKE EXECUTE FROM anon, PUBLIC` gemacht ohne authenticated-Pfade zu brechen. Recovery-Pfad: `supabase db query --linked --file <migration>` + `supabase migration repair --status applied 20260514142023`.

**Memory-Lesson reinforced:** Wenn ein Urgent-Fix breit-GRANTed wird, sollte ein Folge-Audit pro-Role nachprüfen ob alle Empfänger den Grant wirklich brauchen. Code-Trace allein verfehlt RLS-implizite Aufrufe (siehe Memory `feedback_use_server_konstanten`-Schwester-Lesson).

### Finale Advisor-Bilanz

| Etappe | Lints |
|---|---|
| Tagesstart | ~50 |
| Nach Vormittags-RLS-Sprint (Recap-Erstellung) | 7 |
| Nach #1091 GRANT-Restore (anon prophylaktisch) | 17 |
| Nach #1096 anon-REVOKE Cleanup | **12** |

Restliche 12 alle dokumentiert by-design:
- 1× `rls_policy_always_true` (`gfa_insert_public` — öffentliches Formular, Rate-Limit als Folge-Ticket)
- 11× `authenticated_security_definer_function_executable`:
  - 5× Portal-Guards (`is_admin`, `is_dispatcher`, `is_kundenbetreuer`, `is_staff`, `can_access_fall`) — Aarons Hotfix `95d6aa3a`
  - 3× AAR-894-Karte-Helper (`dispatcher_owns_lead`, `is_claim_user_party`, `is_sv_for_claim`) — Migrations `20260514105054` + `20260514105431`
  - 3× #1091-Restores (`is_sv`, `is_kanzlei`, `is_dat_badge_sichtbar`) — RLS-Recursion-Schutz

### Sync-Bilanz staging ↔ main

| Zeitpunkt | Sync-PR | Inhalt |
|---|---|---|
| Morgens (vor Recap) | #1085 | 7 RLS-PRs (#1044/#1063/#1065/#1066/#1071/#1076/#1078) + Marketing-Polish |
| Nachmittags | #1089 | AAR-894 Karte (10 Feature-Commits) + AAR-896 + imgly-Whitelabel |
| Abends | #1097 | #1096 anon-REVOKE Cleanup |

Staging und main jetzt bündig (0 ungesyncte Commits).

### Was bleibt offen

Unverändert aus dem Original-Recap-Backlog:

- AAR-623 klären (Kundenportal WhatsApp-Tasks)
- PR #974 CJ-Smoke-Framework entscheiden
- Performance-Advisors durchschauen (nur Security gemacht)
- Drift-Backfill `kitta/aar-rls-drift-backfill` abschließen (2 out-of-band Migrations)
- `gfa_insert_public` Rate-Limit-Ticket
- HIGH-Backlog aus `live_rls_audit` Memory (makler/sv mass-assignment, abrechnungen RLS, audit-spoofing, conversion_events deeper-Audit)

Neu hinzugekommen:
- **`src/lib/sv/qualifikationen-gate.ts` ist Orphan-Code** — `isDatBadgeSichtbar` + `getSichtbareQualifikationen` werden nirgends importiert. Folge-Ticket: löschen oder Konsumenten finden (AAR-515 hatte das mal als Welle-5-Rendering-Gate eingeführt, Verbleib unklar).
