# Pre-Go-Live App-Sweep — Befund-Report (2026-07-13)

Read-only Audit über die ganze App: Dead Code, Bugs, Redundanz, lose Enden, Runtime-Errors, DB-Logs/Advisors. 4 parallele Subagenten + direkte DB-Signale (Health-Monitor, Postgres/API-Logs, Supabase-Advisors) + `tsc`/`knip`. **Keine Inline-Fixes** (12 Parallel-Sessions aktiv) — dies ist die Fund-Liste zum Routen.

**Gesamtbild:** Die App ist überraschend diszipliniert — `tsc --noEmit` = 0 Fehler, AGENTS.md-Patterns weitgehend befolgt (nested-select-Normalisierung, Result-Objects, Service-Role für claims), Migrations-Set ohne Twin-Drift (700 Files, 0 Kollisionen), die meisten Advisor-Flags sind dokumentiert-gewollt. Die echten Funde sind eine überschaubare, klar priorisierbare Menge.

---

## P0/P1 — vor Go-Live fixen

| # | Bereich | Fund | Quelle | Fix | Lane |
|---|---|---|---|---|---|
| **S1** | Security | **Authenticated IDOR:** `v_claim_full/listing/sv/phase/timeline` laufen `security_invoker=false` (DEFINER), `authenticated`-lesbar, kein In-View-Ownership-Filter → jeder eingeloggte User liest jeden Claim per ID (PII). Verifiziert per pg_class. | Agent D + MCP-Verify | `security_invoker=true` flippen NACH per-Rollen-RLS-Smoke (`v_claim_for_gast` ist die Vorlage). Nicht blind flippen. | ⚠️ überlappt **62dd5486** (storage-rls-audit) |
| **B1** | Bug | **Claim-Erstellung legt keine `geschaedigter` claim_parties-Zeile an** → Kunde-/Halter-Edits in Fallakte greifen nicht (8 Claims). | Health-Monitor | claim_parties-geschaedigter-Insert im Claim-Erstell-Pfad (convertLeadToClaim) sicherstellen. | frei |
| **B2** | Bug | **Pflichtdok-Slot-Erzeugung ist prod-disabled** (`create-pflicht.ts:46-53` `void existingSlots;void docs;void seen`) → nur 3 hardcoded Fälle legen Slots an, Kunde kann Pflicht-Doku nicht hochladen (11 Claims). | Health-Monitor + Agent A (Root gefunden) | Katalog-Slot-Loop reaktivieren („TODO Folge-PR"). | frei |
| **B3** | Bug | **Mitarbeiter-/Partner-Account-Anlage sendet keine Zugangs-Mail** → 5 stuck (4 werkstatt, 1 kundenbetreuer, nie eingeloggt). | Health-Monitor | Zugangs-Mail-Versand im Account-Anlage-Pfad. | ✅ **f99fdb10** (kitta/mitarbeiter-account-mail) owned das |
| **L1** | Lose Ende | **SV-Verifizierungs-Doku-Upload + SA-Re-Upload sind „kommt in Kürze"-Platzhalter** (`gutachter/verifizierung/page.tsx:220,252`) — obwohl 14-Tage-Frist-Cron läuft → SVs werden gemahnt, können nichts hochladen. | Agent A | Upload-Komponente bauen ODER Frist-Cron pausieren bis fertig. | frei |
| **L2** | Go-Live-Env | **OCR-Landmine:** `api/ocr-trigger/route.ts:101` `getStubData` liefert Fake-OCR wenn `GOOGLE_VISION_API_KEY` fehlt → stiller Stub in Prod. | Agent A | Prod-Env-Key verifizieren (kein Code-Fix, Ops-Check). | frei |
| **B4** | Bug | **Golden-Path-Rollen-Sicht kaputt:** `Cannot read properties of undefined (reading 'rest')` in rolle:kunde/sv/kb-sicht (Supabase-Client undefined) + „kunde sichtbar=false, erwartet true". | Health-Monitor (golden_path smoke) | Client-Init im Sicht-Check + kunde-Sichtbarkeits-Logik prüfen. | frei |

---

## P2 — sollte vor/kurz nach Go-Live

| # | Bereich | Fund | Fix |
|---|---|---|---|
| **B5** | Bug | `admin/sachverstaendige/_karte/actions.ts:98-108` `softDeleteGutachter` zählt offene Fälle mit `.in('id', [])` bei leerer Bridge → Guard-Bypass, SV mit offenen claim-only-Fällen löschbar (+ auth-User-Delete). Zusätzlich `throw` statt `{ok,error}`. | Nach `sv_id`+`operative_status` zählen (wie `reassignCases`). |
| **B6** | Bug | slot-ttl-cleanup expired stale Slot-Reservierungen nicht (älteste 62d). | Cleanup-Cron prüfen. |
| **B7** | Integration | LexDrive Inbound-Webhook 51 Tage still — Rückkanal evtl. tot. | LexDrive-Integration verifizieren. |
| **L3** | Lose Ende | 4 aktive Prod-`console.log` die IDs leaken: `termin-verlegung-actions.ts:449`, `verlegung-vorschlaege.ts:147`, `get-sv-tagesplan.ts:64` (AAR-864), `flow/[token]/actions.ts:1350` (AAR-908). | Entfernen/auf Logger umstellen. |
| **S2** | Security | `touch_claim_recency` SECURITY DEFINER + anon-ausführbar (bumpt Recency-TS auf beliebigem Claim). | `REVOKE EXECUTE … FROM anon`. |

---

## P3 — Cleanup (Boy-Scout)

- **Dead-Code (Agent A, safe delete):** `dispatch/rueckrufe/actions.ts:138` `markAngerufen`/`markNichtErreicht` (0 Consumer, throw) · `copilot/prompts.ts:97,131` (2 deprecated Builder) · `sv-matching-modul/match-and-slots.ts:23` (deprecated Field). Deprecated Cron `api/cron/monatsabrechnung` + System-A-Pricing (`berechneLeadpreis`) = Aaron-gated Retirement.
- **Dead revalidatePath (Agent D):** `kanzlei-wunsch/actions.ts:60` `/admin/claims/${id}` (→ `/admin/faelle`) · `onboarding/slots.ts:177` `/gutachter-finden` (weg). Silent No-Ops.
- **Platzhalter prod-sichtbar:** `seo/jsonld.ts:33` (Draft-Bios/LinkedIn) · `embed/config/route.ts:143` (whatsapp immer null) · `embed-track/route.ts:63` (Beacon persistiert nichts) · `gutachter/abrechnung/page.tsx:597` (PDF-Export disabled) · `KalenderConnectStep.tsx` (MS365 disabled, AAR-715 withdrawn).
- **Workspace-Müll:** `task-5-report.md` (Repo-Root) + `.claire/` — außerhalb `src/`.
- **knip-Baseline:** 97 ungenutzte Files / 226 Exports / 24 Types (getrackt, Boy-Scout-Abbau).

---

## Redundanz — Tech-Debt-Programm (Agent C)

Dominantes Muster: **kanonische Shared-Libs existieren, werden aber ignoriert.**
- **`@/lib/format` adoptieren = größter Hebel:** Namens-Auflösung `[vorname,nachname].join(' ')` in **~120 Stellen** (→ `formatNameKurz`) · EUR inline in **66 Files** vs 5 (→ `formatEUR`, Cent/Euro-Bug-Klasse) · Datum inline **~80 Files** vs 17 · E.164-Telefon in 9 Blöcken (→ `toE164`).
- **3 parallele „Nutzer benachrichtigen"-Pfade:** `notifications.ts`→benachrichtigungen · `create-mitteilung.ts`→mitteilungen · direkte `.insert()`-Bypässe.
- **3–4 konkurrierende Phase/Subphase-Ableitungen** je „SSoT" (`subphase-resolver`, `gutachter/subphase`, `stepper-state`, `lifecycle`+`v_claim_phase`) → **Liste≠Detail≠SV-Drift** (live UX-Bug-Klasse). Kanon = `lifecycle`/`v_claim_phase`.
- Ad-hoc Row-Types statt `database.types.ts`; hand-gerollte StatCard/SectionCard; `PAKET_PRIO` doppelt.
- **Nicht anfassen (dokumentiert-konsolidiert):** `findBestSV`-Delegate, `convert-lead-to-fall`-Wrapper, `communications/send`-Registry.

---

## Verifiziert SAUBER / gewollt — NICHT jagen

- `tsc --noEmit` = **0 Fehler**.
- Die Postgres-Log-Fehler `c.claim_nr`/`clm_nr`/`p.user_id`/enum `gutachter` = **Introspection/Audit-Sweep-Rauschen** (+ meine eigenen Diagnose-Queries), NICHT in `src/`. Committed Code nutzt korrekt `claim_nummer`/`profiles.id`.
- 14 `security_definer_view` = dokumentiertes RLS-Gate-Muster (anon revoked); einziger Rest = S1 (auth-IDOR).
- 16 `rls_enabled_no_policy` = bewusste deny-all-PII-Tabellen (dokumentiert in firmen/personen-Migs).
- 26/34 anon-SECURITY-DEFINER-Funktionen = harmlose no-arg-Trigger-Funktionen.
- `apply_gutachten_ocr`/`next_rechnungs_nr`/`count_unread_updates` = kein anon-Definer-Loch (MCP-verifiziert).
- `v_claim_base` existiert nicht = Refactor-Ziel, keine Live-Inkonsistenz. Echte Konvergenz = geschädigter-Name aus 1 Quelle (listing=profiles vs detail=personen).
- Migrations-Twin-Drift = 0 Kollisionen. `getSichtbarFuerRolle` = korrekt (fail-safe admin-only). `created_at`/`erstellt_am` = Schema-Heterogenität, Code liest korrekt.
- Leere `catch{}` = gewollte Guards (gtag/localStorage/mapbox). W1/W2 = Linear-Labels.
- Cleanup-Integrität = 0 dangling refs.

---

## Performance (Advisors, non-blocking)

320 `multiple_permissive_policies` (RLS mehrfach permissiv → per-row-Kosten), 124 `unused_index`, 40 `unindexed_foreign_keys`, 18 `auth_rls_initplan` (`auth.uid()` nicht `(select …)`-gewrapped). Alles Perf-Debt, kein Go-Live-Blocker — als eigener Optimierungs-Pass.
