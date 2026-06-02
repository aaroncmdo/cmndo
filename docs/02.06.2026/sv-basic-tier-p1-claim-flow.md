# SV-Basic-Tier P1 — GMB-Claim-Flow (Build + Verifikation)

**Datum:** 2026-06-02 · **Branch:** `kitta/sv-basic-p1-claim` (off staging) · **PR:** gegen staging (nicht selbst gemergt)
**Spec:** `docs/superpowers/specs/2026-06-01-sv-basic-tier-self-service-onboarding-design.md` §6 · **Plan:** `docs/superpowers/plans/2026-06-01-sv-basic-tier-p1-claim-flow.md`

## Was P1 liefert
Ein angeworbener Kfz-Gutachter beansprucht **anonym** seinen vorhandenen DAT-Kalt-Pin (`sv_leads`) — oder registriert sich frisch — und bekommt einen **pending** kostenlosen Basic-Account (`sachverstaendige`, `paket='basic'`) mit Prefill. Live erst nach Team-Freigabe (P3). Öffentliche Route `/sv/registrieren`.

## Vorgelagert: Security-Hotfix (separater PR #2208)
Live-RLS-Check beim Kickoff fand einen **anon-PII-Leak auf `sv_leads`** (anon `GRANT ALL` → ganzer DAT-Kaltpool inkl. PII via REST scrapebar). Gefixt vor P1 (Migration `20260601223604`, REVOKE anon + GRANT nur id,lat,lng,ist_aktiv — Klasse #2177). Extern verifiziert: anon `select=*`→401, `select=id,lat,lng`→200, 62/62 Pins erhalten. P1 baut auf der nun sicheren Tabelle.

## Gebaut (5 Tasks)
| Task | Datei(en) | Inhalt |
|---|---|---|
| T2 | `src/lib/sv-basic/claim-eligibility.ts` (+test) | Pure Helfer `istClaimbar`/`normalisiereSuche`/`buildSvInsertAusLead` (TDD, 6/6). **Live-Schema-Korrekturen:** kein `fachschwerpunkte` (Spalte existiert nicht), kein `partner_seit` (NOT NULL DEFAULT), `dat_nummer` aus `dat_expert_nr??dat_id`. |
| T3 | `src/lib/sv-basic/claim-actions.ts` | `sucheSvLeadKandidaten` (service-role, Minimal-Projektion {id,vorname,name,firma,plz,ort}, rate-limited, injection-sanitized) + `beanspracheSvLead` (Account-Kaskade createUser→profiles→sachverstaendige→sv_leads-Link, rollback-safe, Optimistic-Lock gegen Doppel-Claim, Email-Dedupe, Magic-Link, Admin-Task). |
| T4 | `claim-actions.ts` (+) | `registriereSvBasicNeu` (fresh, Mapbox-Geocode best-effort, `onboarding_quelle='self_service_neu'`). |
| T5 | `src/app/sv/registrieren/{page,SvRegistrierenClient}.tsx` | Public-Route + 4-Schritt-UI (Suche→Beanspruchen / Neu→Bestätigung). `primitives.*`/`shared/*`, Umlaute, Tokens. `/sv` ist bereits anon-Whitelist. |
| Email | `templates/SvBasicClaimLink.tsx` + `flows.ts` | „Passwort festlegen"-Recovery-Link-Mail (Du-ToV). |

## Gelockte Design-Entscheidungen (Abweichungen vom Plan, bewusst)
- **`sv_leads.ist_aktiv` bleibt `true`** während Pending (kein Karten-Loch — pending Account ist nicht `verifiziert`→nicht auf Karte; Cold-Pin trägt bis P3-Freigabe).
- **`verifizierung_frist_bis` wird NICHT gesetzt** (Review H1, s.u.) — Basic-SLA gehört in P3.
- **Magic-Link via Supabase `generateLink({type:'recovery'})`** (das lead-basierte `dispatch-magic-link` passt nicht).
- **Route `/sv/registrieren`** (Aaron-Entscheidung; `/partner-werden` verworfen).

## Adversarial-Final-Review (opus) — 4 Findings, alle gefixt
- **H1 (HIGH):** `verifizierung_frist_bis` + `verifizierung_status='ausstehend'` hätte den bestehenden **Tier-2-Verifizierungs-Cron** (`api/cron/verifizierung-reminder`, kein paket-Guard) getriggert → nach 48h „Verifizierung überfällig"-Mail + `frist_ueberschritten`-Flip + kritisch-Task + Tier-2-Countdown. Fix: kein Frist-Feld für Basic. (Zeitgetriggert — vom Insert-Smoke nicht fassbar; Klasse dead-code-activation.)
- **M1 (MEDIUM):** rohe DB-`error.message` an anon → Schema-Leak. Fix: log + generische Meldung.
- **M2 (MEDIUM):** Email-Send-Fehler verschluckt, UI behauptete „Link geschickt". Fix: `emailSent`→UI, adaptiver Bestätigungstext.
- **M3 (MEDIUM):** geteilter 5/IP/h-Rate-Limit-Bucket über alle anon-Flows. Fix: namespace pro Flow.
- **Clean verifiziert** (Review, mit Live-Evidenz): Injection (7 Payloads, kein Breakout), PII-Boundary, Privilege-Escalation (keine user-kontrollierte priv. Spalte), Rollback-Vollständigkeit, Race-Safety, Dispatch-Ausschluss (pending nicht dispatchbar via `applyDispatchableFilter`).

## Verifikation
- **Live-Auth-Smoke** (`scripts/probe-sv-basic-claim-smoke.mjs`, nicht committed): **20/20 GREEN** gegen Live-DB+Constraints — volle Kaskade, `paket=basic`/`ist_aktiv=false`/`verifizierung_status=ausstehend`/**`frist=NULL`**/`dat_nummer`/`paket_umkreis_km=25`, Optimistic-Lock-Race-Guard (2. Claim 0 Zeilen), Such-Projektion ohne PII, Cleanup restlos.
- **Build-Gate:** `tsc --noEmit` EXIT=0 · `vitest src/lib/sv-basic` 6/6 · `check:token-audit` 0 · `check:component-set` 0 neue · `next build` kompiliert die Route (`.next/.../sv/registrieren/page.js` + client-reference-manifest + BUILD_ID). `check:knip` läuft in CI (Junction-`.bin` lokal blockiert; alle neuen Files sind importiert).

## Offen (P2–P5)
P2 Unified Dynamic Onboarding · P3 Discretionary Verification (Admin-Queue + Basic-48h-SLA) · P4 Fallback-Matching + Karte (#2177-GRANT-Constraint!) · P5 Per-Lead-Billing.
