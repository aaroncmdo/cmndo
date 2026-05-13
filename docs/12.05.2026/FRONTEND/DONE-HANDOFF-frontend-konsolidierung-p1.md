# Handoff — Frontend-Konsolidierung Phase 1

**Stand:** 2026-05-12, übergeben an einen neuen Agenten.
**Aufgabe:** Den 12-Task-Plan `docs/superpowers/plans/2026-05-12-frontend-konsolidierung-phase-1.md` zu Ende bringen. T1 + T2 sind erledigt + gepusht, T3–T12 sind offen.

---

## Wo arbeiten

- **Branch:** `kitta/aar-frontend-konsolidierung-p1` (existiert lokal **und** auf `origin`, abgezweigt von `origin/main` = `ca307c88`, enthält schon PR #826 = Komponenten-Set-Policy + `AGENTS.md`-Block `claimondo-component-set` + Memory).
- **Empfehlung des Plans:** in einem eigenen `git worktree` arbeiten — es laufen aktuell 3 parallele Agenten mit Worktree-Locks (`kitta/aar-makler-b2b-landing`, `kitta/aar-polish-marketing`, `kitta/fix-jsx-build-errors-round2`). Nicht in deren Worktrees pfuschen.
- **Plan-Dokument:** `docs/superpowers/plans/2026-05-12-frontend-konsolidierung-phase-1.md` (Steps mit `- [ ]`-Checkboxen). **Spec dahinter:** `docs/12.05.2026/FRONTEND/FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md` + `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md`.

## Was erledigt ist (auf dem Branch, gepusht)

| Commit | Task | Inhalt |
|---|---|---|
| `f3296411` | **T1** | Drift-Bugs B1+B2: doppelter `<Link href="/gutachter/einstellungen">`-Block in `src/app/gutachter/GutachterShell.tsx` raus (User sah 2 „Einstellungen" im Sidebar-Footer) + doppelter Kopf-Kommentar in `src/app/admin/_components/AdminNav.tsx` raus. `DispatchNav.tsx` war NICHT doppelt — unangetastet. |
| `bdef9a4c` | **T2** | inline `function FilterChip` (3×, ~145 LOC) → `@/components/ui/Chip`. Files: `src/components/makler/{MaklerLeadsTable,MaklerAktenList}.tsx`, `src/app/admin/partner/waitlist/WaitlistTable.tsx`. Mapping: `<FilterChip active label count onClick/>` → `<Chip variant={active?'selected':'default'} count={count} onClick={...}>{label}</Chip>`. |

`npx tsc --noEmit` ist nach T1 und T2 jeweils grün gelaufen. Working-Tree war beim Übergeben clean (bis auf gitignorte `.superpowers/`, `scripts/*.json`, `docs/**/Smoke audits/`).

## Was noch zu tun ist — T3 bis T12

Reihenfolge & Details stehen vollständig im Plan-Dokument. Kurzfassung:

- **T3** — `function StatusPill` → `@/components/shared/StatusBadge` (Tone-Mapping: amber→warning, emerald→success, rose→danger, blue→info, gray→neutral, claimondo-navy→brand, claimondo-ondo→ondo; Sonderfarben via `colorCls`-Escape-Hatch) + inline `function EmptyState` → `@/components/shared/EmptyState` (default export, `variant='compact'` für die schmalen Listen). Files: `MaklerLeadsTable.tsx` (StatusPill + EmptyState), `MaklerAktenList.tsx` (EmptyState), `src/components/fall/PflichtdokumenteSection.tsx` (StatusPill), `src/app/**/branding/LivePreview.tsx` (StatusPill). **Achtung:** `MaklerLeadsTable.tsx` hat noch ein `<EmptyState />` (Aufruf an Z. ~71) — der ist Teil von T3.
- **T4** — `src/components/shared/StatCard.tsx` **neu anlegen** (Code-Vorlage im Plan, gebaut auf `@/components/primitives` — prüfe deren echte Props in `src/components/primitives/*/*.types.ts`!) → 5 inline-Implementierungen migrieren: `admin/_components/KpiCards.tsx`, `admin/finance/(hub)/FinanceClient.tsx` (`function KpiCard`), `gutachter/team/TeamClient.tsx` (`function StatCard`), `MaklerDashboard.tsx` (`StatCard` + `StatCardProvisionen`), `MaklerPromo.tsx` (`StatCard`).
- **T5** — `src/components/shared/SectionCard.tsx` **neu anlegen** (Vorlage im Plan) → 5 inline `function Card`/`SectionCard` migrieren (`faelle/[id]/_stammdaten/Sections.tsx`, `faelle/[id]/_prozess/Sections.tsx`, `dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx`, `MaklerSettings.tsx` (`size="lg"`), `kunde/KundeBetreuerStrip.tsx`) **+ `git rm src/components/tasks/TaskCreateModal.tsx`** (0 externe Consumer — vorher `grep -rn "TaskCreateModal" src` checken). → voller Build (faelle/[id]-Routen).
- **T6** — `src/components/shared/forms/{TextField,SelectField}.tsx` + `index.ts` **neu** (Vorlage im Plan — die **Solid**-Variante, NICHT Glass; `shared/glass/*` und `onboarding/fields/*` bleiben unangetastet, Phase 2) → ~13 inline `function Field` migrieren (`admin/sachverstaendige/anlegen/{Solo,Buero,Akademie}AnlegenWizard.tsx`, `admin/faelle/anlegen/AnlegenFallClient.tsx`, `admin/communities/CommunityAnlegenWizard.tsx`, `admin/einstellungen/vertraege/VertraegeEditorClient.tsx`, `admin/team/[id]/MitarbeiterDetail.tsx`, `gutachter/onboarding/buero/BueroOnboardingClient.tsx`, `gutachter-partner/WaitlistApply.tsx`, `…/mietwagen/MietwagenEditCard.tsx`, `kb/VsKorrespondenzCard.tsx`, `kunde/ClaimSummary.tsx`). → voller Build.
- **T7** — `src/components/makler/MaklerShell.tsx` (178 Z.) → Thin-Wrapper über `@/components/shared/portal-nav/PortalNav` (dark-Variante). Vorlage: `src/app/admin/_components/AdminNav.tsx`. Vor dem Umbau `PortalNav.tsx` + `DispatchNav.tsx` lesen für die exakte Props-API. Heilt B3 (`text-claimondo-shield`-Inkonsistenz). → voller Build.
- **T8** — 5 Layouts → `requirePortalAccess()` aus `src/lib/auth/portal-guard.ts`: `admin/layout.tsx` (`['admin']`), `gutachter/layout.tsx` (`['sachverstaendiger']`), `kunde/layout.tsx` (`['kunde']`), `mitarbeiter/layout.tsx` (Rollenname gegen `src/lib/auth/guards.ts` prüfen — vermutlich `'kundenbetreuer'`), `makler/(shell)/layout.tsx` (`['makler']`). **Portal-spezifische Folge-Queries bleiben** (sv-Lookup, makler-Status, kunde-Onboarding-Redirect, Whitelabel-Theme). Vorlage: `dispatch/layout.tsx` + `kanzlei/layout.tsx`. Memory `project_appshell_refactor` danach aktualisieren (Guard-Teil ist extrahiert). → voller Build.
- **T9** — `kanzlei/dashboard/page.tsx`: lokale `STATUS_PILL`-Hex-Map (Z. ~18-65) + `PHASE_LABEL` raus → `<FallStatusBadge status={…}/>` aus `@/components/shared/FallStatusBadge` + `LEAD_PHASE_LABELS`/`FALL_STATUS_LABELS` aus `src/lib/statusLabels.ts`. (Heilt die optische Status-Inkonsistenz: Kanzlei zeigte Fall-Status in anderen Farben als alle anderen Portale.) `MaklerAktenList.PHASE_COLORS` → zentrale Maps; wo Makler kürzere Labels braucht, optionalen `FALL_STATUS_LABELS_SHORT`-Export in `statusLabels.ts` ergänzen statt neuer lokaler Map. → voller Build (kanzlei/dashboard-Route).
- **T10** — die 8 App-Consumer von `@/components/ui/button` → `@/components/primitives` (`Button`-`tone`/`size` lt. `src/components/primitives/Button/Button.types.ts`; shadcn-`variant="outline"→tone="ghost"+outline`, `"ghost"→"ghost"`, `"destructive"→"destructive"`, default→`"navy"`). Files: `src/app/schaden-melden/**` (mehrere Clients) + `src/components/claims/InviteGegnerModal.tsx`. **`ui/button.tsx` NICHT löschen** (wird von `ui/dialog.tsx` + `ui/sheet.tsx` intern genutzt). Dann `git rm src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/avatar.tsx` (vorher 0-Importe verifizieren). → voller Build.
- **T11** — `scripts/check-component-set.mjs` neu (Vorlage im Plan, exit 0 / nur `--warn`) + `package.json`-Script `"check:component-set"` + optional CI-Schritt `node scripts/check-component-set.mjs || true`.
- **T12** — voller Build (`NODE_OPTIONS=--max-old-space-size=8192 npm run build`) grün, `npx tsc --noEmit` grün, `git push`, PR gegen `main` öffnen — **nicht selbst mergen** (Aaron gibt frei).

## Harte Regeln (aus `AGENTS.md` — gelten für jeden Commit)

- **Nie direkt auf `main` pushen** — immer Feature-Branch + PR.
- **DDL nur über supabase-CLI** (`npx supabase migration new` + `db push`), nie über Management-API. (In Phase 1 wahrscheinlich irrelevant — reine Refactors, keine DB.)
- **Kein unbegleiteter Stash am Session-Ende.**
- **Umlaute** (echte `ä/ö/ü/ß`) in Commit-Messages, Code-Comments, UI-Strings — Pre-Commit-Hook blockt ASCII-Ersatz.
- **7-Punkte-Audit im Commit-Body** (Build / UI / Redundanz / Dead-Code / Spec / Inkonsistenz / Regression) — die Plan-Tasks haben die Commit-Messages fertig formuliert, übernehmen.
- **Kein Auto-Merge** — PRs nur auf explizite Aaron-Freigabe mergen (sonst Doppel-Production-Builds).
- **Kein „Vercel deployt"-Mention** nach Commits/PRs — nur GitHub. (Wir nutzen Vercel nicht mehr; Production läuft auf dem VPS `app.claimondo.de`, Staging `app.staging.claimondo.de` Port 3001 hinter nginx-Basic-Auth User `aaroncmdo`. Deploy via GitHub Actions `deploy-vps.yml` / `deploy-vps-staging.yml`.)

## Verifikation

- Reine Refactors → `npx tsc --noEmit` reicht; **bei Route/Layout-Änderungen** (T5/T6/T7/T8/T9/T10) **immer voller Build**: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. (Lokaler 4-GB-Build OOMt sonst.)
- CI: nur der `build`-Job gatet PRs. Der `e2e`-Job läuft gegen Production (`app.claimondo.de`), nicht den PR → wird erst nach Merge+Deploy grün; vor dem Merge ist e2e-rot normal.

## Offene PRs (Kontext, nicht von dir mergen lassen außer Aaron sagt es)

- **#827** — `kitta/aar-docs-reorg-12-05`: Doc-Ordner-Reorg (FRONTEND/, SECU/, done/) + Plan + Redundanz-Audit + `.gitignore`. *Hinweis:* dabei sind ein paar Doppel-Kopien entstanden (`FRONTEND/branding-rollout-spec.md` neben `docs/12.05.2026/branding-rollout-spec.md`; `SECU/SECURITY-AUDIT-12.05.2026.md`/`SECU/rls-permissions-audit.md` neben den Originalen) — Aarons Reorg, ggf. später aufräumen.
- **#825** — `kitta/aar-branding-rollout-rest`: Branding-Rollout Phase 2-Rest + Phase 4 + Phase 5 (Email-Branding). Auf `staging` deployed, noch nicht auf `main`. (Enthält u.a. den `.gitignore`-Block — wenn #825 vor diesem Branch merged, gibt's evtl. einen trivialen `.gitignore`-Merge-Konflikt; harmlos.)

## Test-Login (falls du was im Browser smoken willst — Branding/SV-Portal)

`app.staging.claimondo.de/login` (nginx-Basic-Auth: User `aaroncmdo`) · `test-sv@claimondo.de` / `Test1234!` · SV `Test Aaron Gutachter GmbH`, `verifiziert=true`, `use_custom_branding=true`, `brand_primary=#E11D48` (knallrot), kein Logo.

## Was NICHT in Phase 1 ist (kommt in Phase 2 — eigener Plan)

`MaklerAkteDetail.tsx` → `shared/fall-*` (R14), Wizard-Engine-Vereinheitlichung (R9/R10/R11 — `FlowWizardKfz` löschen, `OnboardingWizard`/`BueroOnboardingClient` migrieren, ein Glass-Field-Set), Stammdaten-Renderer-Konsolidierung (R12), restliche Status-Maps (R8 — Termin/Abrechnung/Provision), `<table>` → `ui/table` (oder `ui/table` löschen). **Glass-Felder (`shared/glass/*`, `onboarding/fields/*`) in Phase 1 bewusst unangetastet.**
