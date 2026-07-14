# HANDOFF — Portal-Header Phase 2: hand-gerollte Header → shared `PageHeader`

> ## ✅ STATUS 14.07.: AUSGEFÜHRT — dieses Dokument ist ein Archiv, keine Anleitung mehr.
> Umgesetzt auf `kitta/portal-header-phase2-handrolled` (40 Files). **Zwei Angaben unten waren beim
> Ausführen bereits falsch — nicht mehr befolgen:**
>
> 1. **§3 „KRITISCHE Abhängigkeit — Phase 1 zuerst" (Rebase auf `origin/kitta/pageheader-floating-card`) ist OBSOLET und wäre SCHÄDLICH.**
>    PR #4149 wurde inzwischen nach staging gemergt (Squash `87bb038de`). Der Branch hat den
>    Card-Default also längst über staging; ein Rebase auf den alten, ungesquashten Phase-1-Branch
>    hätte ~55 Commits dorthin repliziert (Konflikte + doppelte PageHeader-Änderung).
>    Richtig war der im selben §3 genannte Alternativpfad: **auf `origin/staging` rebasen.**
> 2. **§8 behauptet, `tests/e2e/flows/portal-header-phase2.spec.ts` existiere — tat es nicht.**
>    Der Spec wurde im Zuge der Ausführung neu geschrieben (kb/admin/dispatch + 375px-Kalender-
>    Overflow-Regression) und liegt jetzt tatsächlich dort.
>
> Ebenfalls überholt: die Kandidatenliste (§6) war weder vollständig noch überall korrekt — die
> tatsächlich migrierte/ausgeschlossene Menge steht im PR + im Memory-Marker
> `COORDINATION-portal-header-phase2`. Genau dafür stand „RE-VERIFY jeden File" da.

> **Für eine FRISCHE Session ohne Vorkontext.** Dieses Dokument ist selbst-enthaltend. Lies es ganz, dann führe die Tasks (§7) mit `superpowers:subagent-driven-development` aus. RE-VERIFY jeden File gegen aktuellen Code.

---

## 1 · TL;DR / Quick Start

**Was:** ~34 Seiten quer über alle Portale (außer SV) rollen ihren Seiten-Titel hand (`<h1 className="text-heading-lg font-bold text-claimondo-navy">…</h1>`) statt den shared `PageHeader` zu nutzen. Migriere sie auf `<PageHeader>` — dann bekommen sie die (in Phase 1 gebaute) Floating-Card + portalweite Konsistenz.

**Warum:** Aaron 13.07.: „du hast nicht alle pageheader migriert." Phase 1 (PR #4149) machte nur den *shared* PageHeader zur Card-by-default — Hand-Roller wurden nicht erfasst. **KB (mitarbeiter) nutzt 0× PageHeader** = der Kern-Gap (Aaron nannte KB im Ursprungs-Request „admin, dispatch und kb").

**Wo:** Worktree `.claude/worktrees/portal-header-phase2-handrolled`, Branch `kitta/portal-header-phase2-handrolled` (off staging, gepusht).

**Start:**
```bash
cd ".claude/worktrees/portal-header-phase2-handrolled"
git rebase origin/kitta/pageheader-floating-card   # ⚠ PFLICHT — s. §3 (sonst kein Card)
claude
# → superpowers:subagent-driven-development, dieses Dokument als Master, per-Portal-Batches (§7)
```

## 2 · Der volle Kontext (die PageHeader-Refactor-Saga)

- **Ursprung:** Aaron wollte „admin, dispatch und kb weiten header refactor — dieser eckige header ist nicht gut … **vor allem die page header**".
- **Zwischenschritt (verworfen):** zuerst als globale „PortalTopBar" missinterpretiert → Aaron korrigierte auf den **`PageHeader`** (den Titel-Block oben auf jeder Seite).
- **Phase 1 = PR #4149** (Branch `kitta/pageheader-floating-card`, OPEN, mergeable, CI-build grün, opus-reviewed):
  - Der shared `src/components/shared/PageHeader.tsx` rendert seinen Titel-Block **per Default als weiche, helle Floating-Card** (`.page-header-card` in `globals.css`), statt der alten eckigen `bg-white border-b`-Leiste.
  - Neue **optionale** Props: `children` (Inhalt IN der Card, z.B. Hub-Tabs) + `bare` (Opt-out ohne Card). `align="center"` impliziert `bare`.
  - Brand-var-getrieben (`var(--brand-surface)`) → kunde/makler branded, Claimondo-Fallback intern.
  - Eckige Bänder entfernt: finance-hub, statistiken, sachverstaendige [id]+basic-freigaben, Fälle-Hub-Layout.
  - **Wirkt nur auf die 52 bestehenden PageHeader-Consumer.**
- **Phase 2 (DIESES Handoff):** die **Nicht-Consumer** (hand-rolled `<h1>`) nachziehen → portalweit konsistente Card. Scope-Wahl Aaron: **wirklich alle Portale** außer SV · eigener Phase-2-Branch (damit #4149 sauber grün bleibt).

## 3 · ⚠ KRITISCHE Abhängigkeit — Phase 1 zuerst

Der Branch ist **off staging**. PR #4149 (der Card-Default) ist **noch nicht in staging** (OPEN). → Auf diesem Branch hat `PageHeader.tsx` die **Card-Logik noch NICHT**. Migrierst du jetzt `h1→PageHeader`, bekommen die Seiten den **alten** PageHeader (kein Card) — kein sichtbarer Gewinn.

**Lösung (Pflicht, vor dem Bau):** rebase auf Phase 1:
```bash
git fetch origin
git rebase origin/kitta/pageheader-floating-card
```
Dann hat dein Branch den Card-Default + die neuen Props (`children`/`bare`). **Alternativ:** warten bis #4149 → staging gemergt ist, dann `git rebase origin/staging`. Empfehlung: **jetzt auf pageheader-floating-card rebasen** (sofort visuell korrekt); falls #4149 später gemergt wird, ist der Rebase auf staging problemlos (gleiche Commits).
Verifiziere nach dem Rebase: `grep -q "page-header-card" src/components/shared/PageHeader.tsx` muss treffen.

## 4 · Die `PageHeader`-API (wohin du migrierst)

`src/components/shared/PageHeader.tsx` (Default-Export):
```tsx
import PageHeader from '@/components/shared/PageHeader'

type Props = {
  title: string
  description?: React.ReactNode        // Untertitel; ReactNode → erlaubt Inline-Links/Badges
  icon?: LucideIcon                    // optionales Icon vor dem Titel
  actions?: React.ReactNode            // Buttons rechts (Header-Aktionen)
  size?: 'md' | 'lg'                   // md=18px (Sub), lg=24px (Hub/Top-Level). Portal-Seiten → 'lg'
  useBranding?: boolean                // Titel in var(--brand-primary) (nur Whitelabel-SV) — hier meist NICHT
  leadingSlot?: React.ReactNode        // Node vor dem Titel (Back-Button/Avatar)
  align?: 'start' | 'center'           // start=default (Card); center=zentriert+boxless (Auth/Wizard)
  children?: React.ReactNode           // Inhalt IN der Card unter dem Titel (Tabs/Untertitel-Block)
  bare?: boolean                       // Opt-out: kein Card (wenn schon in eigener Card/inline)
}
```
**Verhalten:** `align="start"` + nicht `bare` → **Floating-Card** (Klasse `page-header-card`, `[data-page-header-card]`). `bare` oder `align="center"` → **boxless** (kein Card). Default-Padding der Card ist intern (`px-5 py-4`) — der Consumer-Wrapper liefert nur das Außen-Padding.

## 5 · Das Rezept (exakt, mit before/after)

**Fall A — nur Titel (häufigster, z.B. KB-Seiten):**
```tsx
// VORHER
<h1 className="text-heading-lg font-bold text-claimondo-navy">Meine Fälle</h1>
// NACHHER (+ import PageHeader oben)
<PageHeader title="Meine Fälle" size="lg" />
```

**Fall B — Titel + Beschreibung + Actions in einer Header-Row:**
```tsx
// VORHER
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-heading-lg font-bold text-claimondo-navy">Organisationen</h1>
    <p className="text-sm text-claimondo-ondo">Alle Communities & Büros</p>
  </div>
  <button onClick={…}>Neu</button>
</div>
// NACHHER
<div className="mb-6">
  <PageHeader
    title="Organisationen"
    size="lg"
    description="Alle Communities & Büros"
    actions={<button onClick={…}>Neu</button>}
  />
</div>
```

**Regeln:**
1. Nur den **Seiten-Titel** (top-of-page) migrieren — NICHT Section-/Card-Titel weiter unten.
2. **Positionierungs-Wrapper behalten** (`p-6`/`py-8`/`mb-6`/`max-w-*`); die Card sitzt darin.
3. Steckt der `<h1>` **in** einer eigenen `bg-white rounded`-Card / `<SectionCard>` → **`bare`** setzen (sonst Doppel-Card). (Zentrierte Auth/Onboarding → `align="center"`.)
4. Umlaute in Titeln/Beschreibungen **erhalten**. Kein neuer Token, keine Logik.
5. Import ergänzen: `import PageHeader from '@/components/shared/PageHeader'`.
6. Nach der Migration in dem File nach verwaisten Header-Utility-Imports schauen (Dead-Code).

## 6 · Klassifizierte Kandidatenliste (RE-VERIFY je File)

### ✅ MIGRATE — echte Portal-Seiten-Header (~34)
**admin (~22):**
`communities/CommunitiesListClient` · `community/page` · `einstellungen/page` · `einstellungen/aircall-relay-seats/RelaySeatClient` · `einstellungen/anspruch-saetze/AnspruchSaetzeClient` · `einstellungen/google/GoogleSettingsClient` · `einstellungen/vertraege/VertraegeEditorClient` · `health/page` · `kommentare/page` · `konto/page` · `marketing/page` · `marketing/lead-reaktivierung/page` · `marketing/linkedin/page` · `meine-tasks/MyTasksClient` · `organisationen/OrganisationenClient` · `partner/waitlist/page` · `personen-dubletten/page` · `reklamationen/ReklamationenClient` · `sla/page` · `support/page` · `team/TeamClient` · `versicherungen/VersicherungenClient` · `vertraege/page` · `werkstaetten/[id]/WerkstattDetailClient`

**KB / mitarbeiter (~8, DER Kern-Gap):**
`faelle/page` · `isochrone/page` · `kundentermine/page` · `performance/PerformanceClient` · `profil/MitarbeiterProfilClient` · `reklamationen/page` · `tasks/page` · `termine/page`

**dispatch (~2):** `kalender/KalenderClient` · `rueckrufe/page`  (⚠ `dispatch/dashboard/page` erst prüfen — wenn „Guten Tag"-Greeting → NICHT migrieren)

**kunde (~2, branded → ZULETZT):** `flotte/page` · `termine/[id]/KundeTerminDetailClient`

### ⚠ BARE / align="center" — Wizard/Registrierung/Onboarding/Token (per File entscheiden)
`flow/[token]/{FlowWizardKfz,WerkstattIntakeSignatur,page}` · `makler/(shell)/willkommen/OnboardingWizardClient` · `makler/registrieren/MaklerRegistrierenClient` · `sv/registrieren/SvRegistrierenClient` · `werkstatt-partner-werden/WerkstattPartnerWerdenClient` · `kunde/{schaden-melden,onboarding-details}/page` · `kunde/nachbesichtigung/[fall_id]/page` · `kunde/termin/[token]/{page,KundeTrackingClient}` · `kanzlei/abrechnung/[token]/{page,KanzleiCheckoutClient}`
→ Eigene/zentrierte Funnel-/Magic-Link-Header. **Default: LASSEN** (kein „eckiger Portal-Header"). Nur wenn eindeutig ein Standard-Titel: `align="center"` bzw. `bare`.

### ⛔ EXCLUDE — kein Seiten-Header
`faelle/[id]/_tabs/UebersichtTab` (Tab-Section-Titel) · `admin/smoke/lifecycle/page` (Debug) · `mitarbeiter/konsultation/[terminId]/KonsultationCockpit` (Cockpit) · `admin/page.tsx` + `mitarbeiter/page.tsx` (Greeting-Dashboards) · alles unter `gutachter/` (nutzt `SvPageChrome`).

## 7 · Tasks (subagent-driven, per Portal-Batch)

- [ ] **Task 0:** Rebase auf Phase 1 (§3) + verifizieren `page-header-card` in PageHeader.tsx vorhanden.
- [ ] **Task 1 — admin-Batch** (~22): Recipe pro File. `grep -n "text-heading-lg font-bold text-claimondo-navy\|<h1" <file>` → migrieren. Gruppen-Commit(s).
- [ ] **Task 2 — KB-Batch** (~8, Kern-Gap): Recipe. Commit.
- [ ] **Task 3 — dispatch-Batch** (~2, dashboard prüfen): Recipe. Commit.
- [ ] **Task 4 — kunde/kanzlei-Batch** (branded, ZULETZT): vor jedem File `git fetch` + aktive-Session-Check (Memory-Marker); Kollisions-blockierte Files skippen + im Report notieren.
- [ ] **Task 5 — Wizard/Registrierung** (BARE-Sektion): pro File entscheiden. Im Zweifel LASSEN.
- [ ] **Task 6 — Verifikation + PR** (§8).

Jeder Commit: 7-Punkte-Audit im Body; `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 8 · Verifikation

- `npx tsc --noEmit` (bei OOM: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`) — **erwarte NUR 2 pre-existing Fehler** (`jsqr`, `@turf/union` = fehlende Dev-Deps, s.u.); **kein neuer**.
- `npm run build` + 4 Ratchets (`check:token-audit`, `check:component-set`, `check:status-registry`, `check:knip`) + `npx vitest run`.
- **⚠ Environmental (kein Blocker):** die Dev-`node_modules` fehlen deklarierte Deps (`@turf/union`, `jsqr`) → lokaler Build/tsc/einige vitest failen in FREMDEN Files. CI `npm ci` baut clean. Nicht davon aufhalten lassen; verifiziere, dass DEINE geänderten Files fehlerfrei sind.
- **Prod-Playwright-Smoke (Aaron-Mandat 11.07.):** `tests/e2e/flows/portal-header-phase2.spec.ts` (`// Run:`-Header). Muster: `import { loginContextOrSkip, skipIfAuthWall } from './_golden-path-lib'` (Rollen: admin/dispatch/kb via TOTP-env, graceful skip ohne Secret). Pro Rolle 1–2 migrierte Seiten öffnen → `expect(page.locator('[data-page-header-card]').first()).toBeVisible()`. Post-merge-CI fährt es gegen `app.claimondo.de`.
- **PR:** `git push -u origin kitta/portal-header-phase2-handrolled` → `gh pr create --base staging --title "Portal-Header Phase 2: hand-rolled → PageHeader"`. Body: Scope + „hängt an #4149 (Card-Default)". Merge-Session zieht grüne staging-PRs auf prod.

## 9 · Koordination / Kollision

- **13+ aktive Sessions** auf kunde/makler/flow/admin (13.07.). Worktree isoliert (off staging) → **kein Working-Tree-Trample**; Merge-Konflikte sind lokal (1 h1-Zeile). Reihenfolge **admin+KB+dispatch zuerst** (intern), **kunde/kanzlei zuletzt**.
- **SV/gutachter NICHT anfassen** (SvPageChrome). **Dashboards bleiben Greeting.**
- Nach Merge nichts weiter nötig; #4149 (Phase 1) mergt unabhängig.

## 10 · Referenzen
- Phase 1: PR #4149, Branch `kitta/pageheader-floating-card`; Spec `docs/superpowers/specs/2026-07-11-portal-header-refactor-design.md`; Plan `docs/superpowers/plans/2026-07-11-pageheader-floating-card.md`; Marker [[coordination-pageheader-floating-card]].
- Phase 2 Task-Checkliste (Kurzform): `docs/superpowers/plans/2026-07-13-portal-header-phase2-handrolled.md`.
- Ursprungs-Session: 3c0b2713.
