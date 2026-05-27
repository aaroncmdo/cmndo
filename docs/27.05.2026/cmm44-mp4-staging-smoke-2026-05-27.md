# CMM-44 MP-4 (Reader-Rewrite) — Staging-Smoke

**Datum:** 2026-05-27 · **Target:** https://app.staging.claimondo.de (PM2:3001, prod-Build)
**Script:** `scripts/smoke-cmm44-mp4-staging.mjs` · **Artefakte:** `docs/27.05.2026/smoke-mp4-staging/` (9 Screenshots + report.json)

## TL;DR — Verdikt

**MP-4 ist auf staging verifiziert.** Alle gesmokten Portale rendern die Phasen-Anzeige aus dem
4-Phasen-Modell (`getClaimLifecycle` / `v_claim_phase`): Admin-Kanban (4 Spalten + Card-Hover-Pipeline),
Admin-Fallakte-aside (4-Phasen vertikal, korrekte aktive Phase + Substate), Kanzlei-Pipeline (4 Spalten,
als Admin **und** als Kanzlei-Rolle), Kanzlei-Mandate (Phase-Spalte = 4-Phase+Substate). **0 pageerrors**
überall — **außer** einem **React #418 (Hydration-Mismatch) auf der Fallakte-aside** (root cause + Fix unten).

**Kunde:** nach Seed gesmoket (CLM-2026-00203) — ClaimStepper + Progress-Card rendern alle 4 Phasen, **0 pageerror**
(progress-card hat `showTimestamps=false` → trifft die #418 nicht). **Makler:** Daten + RLS verifiziert
(impersoniert: view_visible=1), aber das Portal surfaced den synthetischen Fall nicht — App-Query/Provenance-Nuance,
**kein MP-4-Bug** (Rendering via identisches Kanzlei-Pattern bewiesen). Details im Nachtrag unten.

## Voraussetzung verifiziert: staging IST mit MP-4 deployt

`deploy-vps-staging.yml` auto-deployt bei jedem Push auf `staging`. Erfolgreiche Deploys am 27.05.:
MP-4e #1857 (14:10), Handoff #1859 (14:44), Wave-C #1860 (14:49) — alle `success`. `origin/staging` trägt
4a #1844 / 4b #1848 / 4c #1852 / 4d #1855 / 4e #1857. Staging = aktueller staging-Branch.

## Methode

- Playwright, Basic-Auth via `httpCredentials` (nicht in URL), Form-Login `/login`, alle Test-Accounts
  `Test1234!` (2FA off + force_pw off — DB-verifiziert).
- Navigation an echten, invariant-sauberen claim_ids (`claim_id == faelle.id`) aus `v_claim_phase`:
  begutachtung `28492ffb…87`, erfassung `dcc6734d…0`.
- Phasen-Verteilung staging: **53 erfassung + 12 begutachtung** (0 regulierung/abschluss — erwartet:
  `lexdrive_case_id` durchgehend null, terminales `claims.status`-Vokabular erst MP-7/8).

## Ergebnisse pro Portal

| # | Portal / View | Rolle | Phasen-Render | pageerror |
|---|---|---|---|---|
| 01 | `/admin/faelle` (Kanban) | admin | 4 Spalten + Card-Hover-Pipeline, 53/12/0/0 | — |
| 02 | `/faelle/{begutachtung}` (Fallakte-aside) | admin | 4-Phasen vertikal, aktiv=Begutachtung·Kanzlei-Übergabe läuft | **#418** |
| 03 | `/faelle/{erfassung}` (Fallakte-aside) | admin | 4-Phasen vertikal, aktiv=Erfassung·Vollmacht offen | **#418** |
| 04 | `/kanzlei/kanban` | admin | 4 Spalten, 16/12/0/0, Substate-Chips + Mandat-Nr | — |
| 05 | `/kanzlei/mandate` | admin | Tabelle 28 Mandate, PHASE-Spalte = 4-Phase+Substate | — |
| 06 | `/kanzlei/kanban` | kanzlei | 4 Spalten + „Read-only — Phase ergibt sich automatisch" (0 Mandate für test-kanzlei) | — |
| 07 | `/kanzlei/mandate` | kanzlei | leer (test-kanzlei hat 0 zugewiesene Mandate, RLS) | — |
| 08 | `/dispatch/dashboard` | dispatch | n/a (lead-basiert, keine Claim-Phase) | — |
| 09 | `/gutachter/heute` | sv | n/a (Heute-Ansicht; AuftragHeaderPanel ist auf Fall-Detail, orthogonal) | — |

## Finding: React #418 (Hydration-Mismatch) auf Fallakte-aside

> **KORREKTUR (Session 5, nach Staging-Verifikation):** Die unten zunächst vermutete Ursache (tz-loses
> `toLocaleString` in PhaseStep/SubphaseStepper) war **NICHT** die #418 — der Fix (#1865) räumte sie nicht weg.
> Die **echte Quelle** ist ein verschachteltes `<a>` in `FallKontakteCard/KontaktRow` (der Profil-`<Link>`
> umschloss die tel:/mailto:-`<a>`), gefixt in **PR #1871** (empirisch verifiziert: 0 pageerror nach Deploy).
> #1865 (tz) + #1867 (SlaAlerts `Date.now()`) bleiben als valide Hydration-Hygiene, waren aber nicht diese #418.
> Lektion: bei React #418 zuerst den lokalen `next dev`-Verbose-Error holen (exakte Server/Client-Diff +
> Komponenten-Stack), nicht aus prod-minified raten. Volldetails: `SESSION-HANDOFF-claim-phasen-mp5-2026-05-27.md`.
> Die folgende Analyse bleibt als historischer Diagnose-Verlauf erhalten.

**Symptom:** `/faelle/[id]` wirft in prod `Minified React error #418` (Hydration: server-gerenderte HTML
≠ client). Seite rendert trotzdem korrekt (React re-rendert client-seitig) — kurzer Flash + Console-Error,
kein Crash. Feuert **nur** auf der Fallakte-aside, **nicht** auf Kanban/Mandate.

**Root Cause (auf origin/staging-Code verifiziert):**
1. `FallPhasenPanel.tsx` Variant `aside` defaultet `showTimestamps = true` (Z.155).
2. `buildClaimPhasePipeline` (subphase-visibility.ts Z.651) befüllt `reachedAt: reached?.at`.
3. `PhaseStep.tsx` Z.87 rendert den Timestamp via
   `new Date(data.reachedAt).toLocaleString('de-DE', { dateStyle:'short', timeStyle:'short' })`
   — **ohne `timeZone`** → Server (VPS=UTC) rendert andere Uhrzeit als Client (Browser=Europe/Berlin)
   → Text-Content-Mismatch → #418.

Das erklärt die Selektivität: `progress-card` (Kunde) + `header-strip` (SV) setzen `showTimestamps=false`,
Kanban-Hover ebenso → kein SSR-Timestamp → kein #418. Nur `aside` (Admin/KB) hat Timestamps an.

**Fix (1 Zeile):** `timeZone: 'Europe/Berlin'` in `PhaseStep.tsx:87` ergänzen — exakt wie es
`PhaseTimeline.tsx:38` bereits korrekt macht. `SubphaseStepper.tsx:38` (`toLocaleDateString` ohne tz) sollte
zur Sicherheit mit.

**Pre-existing vs MP-4:** `PhaseStep` ist pre-existing (AAR-565, unverändert). MP-4b's neuer Builder befüllt
`reachedAt` + `aside`-Default `showTimestamps=true` → der tz-lose Render liegt im MP-4-Anzeige-Pfad. Der
Handoff §7 nannte eine „pre-existing Hydration-Warnung (nested-`<a>`)" — die hier gefundene #418 ist die
**Timestamp-tz-Variante** (im lokalen Dev nur Warning, auf prod-Build = #418-Error → vom lokalen Dev-Smoke
nicht gefangen). Niedrige User-Impact, klarer Einzeiler-Fix.

## Kunde + Makler — Ausgangslage vor Seed (Begründung)

Beide Portale waren schon in Handoff §7 als offen markiert. DB-Probe bestätigt die Ursache auf staging:
- **test-kunde@** besitzt **0 eigene Fälle** (`faelle.kunde_id` / `claim_parties.user_id` / lead.email — alle leer).
- **test-makler@** hat **0 aktive `makler_fall_consent`**.

Ein Browser-Smoke dieser Portale braucht **Seeding in die geteilte Prod-DB**. Der bestehende
`seed-staging-test-users.mjs` deckt das **nicht** ab (er legt einen Magic-Link-Lead mit Fake-Email an,
setzt kein `kunde_id`/kein Consent) und ist stale (schreibt CMM-44-gedroppte Spalten wie `fall_nummer`,
`kunde_*`). Zudem ist der Seed-Fall **invariant-kaputt** (`faelle.id ≠ claims.id`) → fällt aus `v_claim_phase`.

**Risiko-Einschätzung (warum vertretbar, das aktuell als Komponenten-Beweis zu führen):**
- **Kunde-Detail** rendert `FallPhasenPanel` Variant `progress-card` + `ClaimStepper`. Das Panel ist
  dieselbe Komponente wie die Admin-aside (✓ gesmoket), nur Variant `progress-card` — und der hat
  `showTimestamps=false`, **trifft also nicht mal die #418**.
- **Makler** nutzt `getClaimPhaseMap` + `MAIN_PHASE_LABEL` — identisches Pattern wie Kanzlei-Liste (✓ gesmoket).

→ Offene Entscheidung: gezieltes reversibles Seed (1 invariant-sauberer Test-Claim an test-kunde +
1 makler_consent) und beide echt smoken, **oder** den Komponenten-Beweis akzeptieren und zu MP-5.

## Nachtrag: Kunde + Makler geseedet + gesmoket

**Seed (reversibel, Test-only, geteilte Prod-DB):** invariant-sauberer Claim **CLM-2026-00203**
(`cccc5555-…-50`, `claims.id==faelle.id`), an test-kunde geownt (`faelle.kunde_id`), + Lead
(`cccc5555-…-51`, `sa_unterschrieben` → sub_phase `vollmacht_offen`) + `makler_fall_consent`
(`cccc5555-…-52`, test-makler). Fixture-Rezept (CMM-63): `status≠'neu'` + `created_via='lead_konvertierung'`
+ `onboarding_complete=true` (sonst Redirect auf `/kunde/onboarding`).

**Kunde ✓ (Screenshot 10):** `/kunde/faelle` → Single-Fall-Redirect auf `/kunde/faelle/{claim_id}`. ClaimStepper
(horizontal, oben) **und** „Mein Fortschritt"-Progress-Card (FallPhasenPanel `progress-card`) rendern beide alle
4 Hauptphasen (● Erfassung·Vollmacht offen → Begutachtung → Regulierung → Abschluss). **0 pageerror** — bestätigt
die #418-Analyse: `progress-card` hat `showTimestamps=false` → kein tz-Timestamp → kein #418.

**Makler — Daten/RLS ok, Portal-Surface-Nuance (kein MP-4):** Tab „Aktiv 1" (Count sieht den Fall), aber Liste
leer + Detail „Seite nicht gefunden". Impersonations-Probe (test-makler): `faelle_direct=1`, `consent=1`,
**`v_faelle_mit_aktuellem_termin`-Read=1** → der Makler HAT Zugriff (RLS `faelle_makler_read` ist consent-basiert).
Das Portal surfaced den **synthetischen** Fall trotzdem nicht (App-Query/Embed/Provenance — echte Makler-Fälle
kommen über Lead→promotion_code; ein zusätzlicher Lead änderte es nicht). **Kein MP-4-Render-Bug** — MP-4e's
Makler-Phasen-Rendering = identisches `getClaimPhaseMap`+`MAIN_PHASE_LABEL`-Pattern wie Kanzlei (✓ via 04/05/06).
Tieferes Makler-Surface-Debugging ist eigenes Thema, nicht Teil der MP-4-Verifikation.

**Seed-Cleanup (falls nicht als Test-Fixture behalten):**
```sql
DELETE FROM makler_fall_consent WHERE id='cccc5555-0000-4000-8000-000000000052';
UPDATE faelle SET lead_id=NULL WHERE id='cccc5555-0000-4000-8000-000000000050';
UPDATE claims SET lead_id=NULL WHERE id='cccc5555-0000-4000-8000-000000000050';
DELETE FROM faelle WHERE id='cccc5555-0000-4000-8000-000000000050';
DELETE FROM claims WHERE id='cccc5555-0000-4000-8000-000000000050';
DELETE FROM leads  WHERE id='cccc5555-0000-4000-8000-000000000051';
```

## Empfehlung

1. **#418-Fix** als kleiner PR (`PhaseStep.tsx` + `SubphaseStepper.tsx` tz ergänzen) — Koordination mit der
   aktiven mp4b-Session (`kitta/cmm44-claim-phase-mp4b`), da `fall-phases/*` deren File-Domäne ist.
2. **Kunde/Makler:** Entscheidung Seed-vs-Komponenten-Beweis (s.o.).
3. Danach **MP-5** (52-Substate-Rollen-Visibility) wie im Handoff.

## Artefakte

- Script: `scripts/smoke-cmm44-mp4-staging.mjs`
- Screenshots + report.json: `docs/27.05.2026/smoke-mp4-staging/`
- Lokaler Lauf, detached HEAD `470b65f9`; Code-Verifikation gegen `origin/staging`.
