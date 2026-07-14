# Portal-Header Phase 2 — hand-gerollte Header → shared `PageHeader` (portalweit)

> **For agentic workers (FRESH SESSION):** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Worktree `.claude/worktrees/portal-header-phase2-handrolled` (branch `kitta/portal-header-phase2-handrolled`, off staging). **Selbst-enthaltend (Spec + Plan in einem).** RE-VERIFY jeden File.

**Goal:** Seiten die ihren Seiten-Titel **hand-rollen** (`<h1 className="text-heading-lg font-bold text-claimondo-navy">…</h1>`) statt den shared `PageHeader` zu nutzen, auf `PageHeader` migrieren — dann bekommen sie die Phase-1-Floating-Card + portalweite Konsistenz. **KB (mitarbeiter) hatte 0 PageHeader** — der Kern-Gap (Aaron „nicht alle migriert").

**Architecture:** Reines Markup. `PageHeader` rendert seit Phase 1 (PR #4149) die Card by default. Migration = `<h1>…</h1>` (+ optional Beschreibungs-`<p>` / Actions-Row) → `<PageHeader title=… size="lg" [description] [actions] />` + Import. Kein DDL, keine Logik.

**Kontext:** Phase 1 (PR #4149) = Card-Default im shared PageHeader + Band-Removals. Diese Phase 2 = die **Nicht-Consumer** (hand-rolled) nachziehen. `gutachter/SV` ausgenommen (nutzt `SvPageChrome`). Dashboards (`admin/page.tsx`, `mitarbeiter/page.tsx`, evtl. `dispatch/dashboard`) bleiben **Greeting-Style** („Guten Tag") — NICHT migrieren.

## Global Constraints
- Regel 1: PR gegen **staging**, nie main. Kein DDL. Umlaute in UI-Strings erhalten. Token-audit-safe. 7-Punkte-Audit im Commit. Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
- Vitest env=node. `tsc`/Build OOMen lokal environmental (missing dev-deps `@turf/union`/`jsqr`) → CI clean; markup ist type-inert.
- **Kollision:** viele aktive Sessions auf kunde/makler/flow/admin. Worktree ist isoliert (off staging) → kein Working-Tree-Trample; Merge-Konflikte sind lokal (1 h1-Zeile). Reihenfolge: **admin+KB+dispatch zuerst** (intern), **kunde/kanzlei zuletzt** (branded + aktive Sessions; vor Edit `git fetch` + Memory-Marker checken).

## Recipe (pro MIGRATE-File)
1. Finde den **Seiten-Titel-`<h1>`** (top-of-page, nicht Section-/Card-Titel): `<h1 className="text-heading-lg font-bold text-claimondo-navy">TITEL</h1>` (Varianten: `text-2xl`/`text-xl font-bold`).
2. Schau die **umgebende Header-Zeile** an: gibt es daneben eine Beschreibung (`<p className="text-… text-claimondo-ondo">`) und/oder Actions (Buttons in einer flex-row mit dem h1)?
3. Ersetze den Header-Block durch:
   ```tsx
   <PageHeader title="TITEL" size="lg" description={…?} actions={…?} />
   ```
   + `import PageHeader from '@/components/shared/PageHeader'`.
4. **Positionierungs-Wrapper behalten** (das `<div className="p-6">`/`py-8`/`mb-6` bleibt; die Card sitzt darin). Falls der h1 **in** einer eigenen `bg-white rounded`-Card/`SectionCard` steckt → `bare` (Phase-1-Muster).
5. NICHT: neue Tokens, Status-Scales; keine Logik-Änderung.

## Klassifikation der Kandidaten (RE-VERIFY je File)

### MIGRATE — echte Portal-Seiten-Header (~34)
**admin (~22):** `communities/CommunitiesListClient` · `community/page` · `einstellungen/page` · `einstellungen/aircall-relay-seats/RelaySeatClient` · `einstellungen/anspruch-saetze/AnspruchSaetzeClient` · `einstellungen/google/GoogleSettingsClient` · `einstellungen/vertraege/VertraegeEditorClient` · `health/page` · `kommentare/page` · `konto/page` · `marketing/page` · `marketing/lead-reaktivierung/page` · `marketing/linkedin/page` · `meine-tasks/MyTasksClient` · `organisationen/OrganisationenClient` · `partner/waitlist/page` · `personen-dubletten/page` · `reklamationen/ReklamationenClient` · `sla/page` · `support/page` · `team/TeamClient` · `versicherungen/VersicherungenClient` · `vertraege/page` · `werkstaetten/[id]/WerkstattDetailClient`
**KB / mitarbeiter (~8, Kern-Gap):** `faelle/page` · `isochrone/page` · `kundentermine/page` · `performance/PerformanceClient` · `profil/MitarbeiterProfilClient` · `reklamationen/page` · `tasks/page` · `termine/page`
**dispatch (~2):** `kalender/KalenderClient` · `rueckrufe/page` (⚠ `dispatch/dashboard/page` = prüfen ob Greeting → dann NICHT)
**kunde (~2, branded — zuletzt):** `flotte/page` · `termine/[id]/KundeTerminDetailClient`

### BARE oder align="center" — Wizard/Registrierung/Onboarding/Token (per File entscheiden, NICHT blind card)
`flow/[token]/*` (FlowWizardKfz, WerkstattIntakeSignatur, page) · `makler/(shell)/willkommen/OnboardingWizardClient` · `makler/registrieren/MaklerRegistrierenClient` · `sv/registrieren/SvRegistrierenClient` · `werkstatt-partner-werden/WerkstattPartnerWerdenClient` · `kunde/schaden-melden/page` · `kunde/onboarding-details/page` · `kunde/nachbesichtigung/[fall_id]/page` · `kunde/termin/[token]/*` · `kanzlei/abrechnung/[token]/*`
→ Diese haben **eigene/zentrierte Header** (Funnel/Magic-Link). Default: **NICHT migrieren** (out of scope — kein „eckiger Portal-Header"). Nur migrieren wenn der Header klar ein Standard-Titel ist; dann `align="center"` (zentriert) bzw. `bare`.

### EXCLUDE — kein Seiten-Header
`faelle/[id]/_tabs/UebersichtTab` (Tab-Section-Titel) · `admin/smoke/lifecycle/page` (Debug) · `mitarbeiter/konsultation/[terminId]/KonsultationCockpit` (Cockpit-Layout) · `admin/page.tsx` + `mitarbeiter/page.tsx` (Greeting-Dashboards).

## Tasks (subagent-driven, per Portal-Batch)

- [ ] **Task 1 — admin-Batch** (~22 MIGRATE): pro File Recipe anwenden. Gruppen-Commit(s) „phase2 admin handrolled→PageHeader". `npx vitest run` betroffene Tests.
- [ ] **Task 2 — KB-Batch** (~8, der benannte Gap): Recipe. Commit „phase2 KB handrolled→PageHeader".
- [ ] **Task 3 — dispatch-Batch** (~2, dashboard prüfen): Recipe. Commit.
- [ ] **Task 4 — kunde/kanzlei-Batch** (branded, ZULETZT): `git fetch` + aktive-Session-Check vor jedem File; Recipe; Kollisions-blockierte Files skippen + im Report notieren.
- [ ] **Task 5 — Wizard/Registrierung** (BARE/center-Sektion): pro File entscheiden migrieren (center/bare) ODER lassen. Konservativ: im Zweifel LASSEN (out of scope).
- [ ] **Task 6 — Verifikation:** `npm run build` (8GB heap) + 4 Ratchets + `npx vitest run`. e2e-Prod-Smoke-Spec `tests/e2e/flows/portal-header-phase2.spec.ts` (Login je Rolle, repräsentative migrierte Seiten → `[data-page-header-card]` sichtbar). Push + `gh pr create --base staging` („portal-header Phase 2"). Merge-Session zieht auf prod.

## Self-Review
- Deckt den Aaron-Gap (KB=0 PageHeader → Task 2) + „alle Portale" (admin/dispatch/KB/kunde/kanzlei) ab. Wizards/Registrierung bewusst konservativ (eigene Header). SV ausgenommen (SvPageChrome). Dashboards bleiben Greeting.
- Kein DDL/Logik. Recipe = mechanisch + per-File-Urteil (Section-Titel ≠ Page-Header).
