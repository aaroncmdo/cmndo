# SV-Basic-Tier P2a — Unified Dynamic Onboarding (Basic-Pfad) — Build + Verifikation

**Datum:** 2026-06-02 · **Branch:** `kitta/sv-basic-p2a-plan` · **PR:** gegen staging (nicht selbst gemergt)
**Plan:** `docs/superpowers/plans/2026-06-02-sv-basic-tier-p2a-onboarding.md` · **Spec §7**

## Was P2a liefert
Ein pending Basic-SV (eingeloggt via P1-Recovery-Link) durchläuft einen **config-getriebenen, dynamischen** Onboarding-Flow (`flow_key='sv-onboarding'`) auf der bestehenden Wizard-Engine, der aus dem Claim Bekanntes überspringt und nur die Lücken sammelt (Telefon-Verify · Profil · Kalender · Vertrag), und landet danach in „Prüfung läuft" bis zur P3-Freigabe.

**Additiv:** das bezahlte `/gutachter/willkommen` (statischer `WillkommenClient`) bleibt **unangetastet** — `willkommen/page.tsx` verzweigt nur bei `paket='basic'`.

## Scope-Lock (Aaron 2026-06-02)
**Stripe-Zahlungsmethode (SetupIntent, §7 Step 70) NICHT in P2a → verschoben auf P5** (Billing-Gate greift erst dort). P2b (Migration der bezahlten Rollen auf denselben flow_key + `WillkommenClient`-Drop) = **separater Plan** (Regressionsrisiko bezahlte Strecke).

## Gebaut
| Bereich | Datei(en) | Inhalt |
|---|---|---|
| Migrationen | `20260602081443` typ-CHECK +3 · `20260602083751` Completion-Marker `basic_onboarding_abgeschlossen_am` · `20260602083957` Seed (5 Phasen/6 Felder) + Basic-Vertragsvorlage (DRAFT) | via Plugin |
| Feld-Typen | `fields/{PhoneVerify,AvatarUpload,CalendarConnect}Field.tsx` + `types.ts`-Union | 3 self-persisting Widgets (Muster `_termin`); Kalender/Avatar drop-in, Phone-Verify neu |
| Save | `lib/sv-onboarding/{whitelist,save-step}.ts` (+test) | `speichereSvOnboardingStep` — spaltenweise gewhitelistet, eigene Zeile (Mass-Assignment-Guard); Sync-Helper in eigenem Nicht-`'use server'`-File |
| Finalize | `lib/sv-onboarding/finalize.ts` | Vertrag via `signAndStoreContract` (Name aus Profil) + Completion-Marker; KEIN ist_aktiv/portal_zugang/onboarding_status-Flip |
| Loader | `lib/onboarding/lade-sv-onboarding-phasen.ts` | Prefill aus SV-Zeile + synthetische `phone_verified`/`kalender_connected` → skippt erfüllte Phasen (localizePhase/-Feld wie Bestands-Loader) |
| Wiring | `WizardClient.tsx` | 3 Feld-`case`s + `sv-onboarding`-`handleWeiter`-Branch (Save vs. `_finalize`) — Bestands-Branches unberührt |
| Routing | `willkommen/page.tsx` + `SvBasicOnboardingClient.tsx` + `SvBasicPendingReview.tsx` | `paket='basic'`-Weiche: Marker/0-Phasen → Pending-Review, sonst Wizard. Paid-Pfad 100% unverändert |

## Gelockte Design-Entscheidungen
- **Completion via eigener Marker** (`basic_onboarding_abgeschlossen_am`), NICHT via `verifizierung_status`/`onboarding_status` → kollidiert nicht mit P1/Tier-2-Cron/paid-Crons; verhindert Wizard-Reentry trotz `portal_zugang=false` (kein Redirect-Loop).
- **Self-persisting Widgets** (`_termin`-Muster): phone/avatar/kalender schreiben ihre eigenen Spalten via Bestands-Actions; der Save-Loop droppt sie (nicht in Whitelist).
- **`_self`-db_target** für `kalender_connected` (Loader liefert synthetischen Skip-Wert aus google_connected_at OR sv_kalender_verbindungen).
- **Finalize setzt NICHT live** (kein ist_aktiv/portal_zugang) — P3-Freigabe bleibt das Gate. `verifizierung_status` bleibt unverändert (P1 nicht angefasst).

## Build-Fehler gefangen (nur durch vollen Build)
`save-step.ts` (`'use server'`) exportierte den **sync** `filterAufWhitelist` → `next build`: „Server Actions must be async functions" (tsc sieht das NICHT — AGENTS.md Punkt 1). Fix: Helper nach `whitelist.ts` (kein `'use server'`).

## Verifikation
- **Build-Gate:** `tsc --noEmit` clean · `vitest src/lib/sv-onboarding` 1/1 · `check:token-audit` 0 · `check:component-set` 0 neue · **`next build` ✓ (Compiled successfully 37s, `/gutachter/willkommen` + Server-Actions validiert)**. `check:knip` läuft im CI.
- **Data-Layer-Smoke** (`scripts/probe-sv-p2a-onboarding-smoke.mjs`, nicht committed): **8/8 GREEN** gegen Live-DB+Seed — 5 Phasen, Skip-Mechanik (frisch→5, alles-bekannt→nur vertrag), **Mass-Assignment-Guard end-to-end** (paket gedroppt/nie geschrieben, standort_adresse geschrieben), Completion-Marker, Cleanup restlos.

## Offen / vor Go-Live
- **🔴 Basic-Vertragstext** ist ein **DRAFT** (`sv_basic_partnervertrag` v1-draft) — vor Go-Live durch finale juristische Fassung ersetzen (reiner Content-Swap der `vertragsvorlagen.inhalt_html`-Zeile, kein Code).
- **Staging-Browser-Smoke** (mit Twilio-SMS + Google-OAuth): voller UI-Pfad Login→Wizard→phone-verify→profil→kalender→vertrag→Pending-Review; Negativ: paid-SV sieht unverändert `WillkommenClient`. Lokaler Dev-Server bewusst nicht gefahren (Connection-Pool + 11 Parallel-Sessions).
- **P2b** = separater Plan.

## Abhängigkeit
Code-unabhängig von P1 (#2223, disjunkte Files), läuft aber runtime auf P1 (pending Basic-Accounts). Branch off staging.
