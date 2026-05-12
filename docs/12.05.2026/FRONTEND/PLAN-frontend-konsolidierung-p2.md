# Plan: Frontend-Konsolidierung Phase 2

> Fortsetzung von Phase 1 (PR #829, gemergt 12.05.2026 — `shared/StatCard`+`SectionCard`+`forms/*`, `MaklerShell→PortalNav`, 5 Layouts→`requirePortalAccess()`, `ui/{card,badge,avatar}` gelöscht, zentrale Status-Maps, Drift-Bremse). Quellen: `FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md` (R1–R15) + `KOMPONENTEN-SET-POLICY.md` + AGENTS.md §claimondo-component-set. Phase-1-Plan: `PLAN-frontend-konsolidierung-p1-NEUER-AGENT.md`.

**Architektur unverändert:** Atom = `@/components/primitives/*` (Dual-File, Token-Props), Composite = `@/components/shared/*`, Web-Rich = `@/components/ui/*` (shadcn/Radix). Handgerolltes Tailwind ≠ Standard für Komponenten.

**Bekannter Blocker für mehrere Tasks:** `primitives/*` (`Box`/`Card`/`Stack`/`Row`/`Text`/`Icon`/`Button`) haben bewusst KEINE `className`-Durchreiche (strikt Token-Props) und `primitives.Button` hat `onPress: () => void` als **required** Prop (kein `onClick`, kein Icon-only-Modus, kein `type="submit"`-only). Designs mit halbtransparenten Tints / Akzent-Bordern / freien Grid-/Button-Größen lassen sich damit nicht ausdrücken. → **P2-T0** ist die Voraussetzung für P2-T6.

---

## P2-T0 — Escape-Hatch in `primitives.Card`/`Box`/`Button` (Voraussetzung, Aaron-Entscheid nötig)

**Risiko:** mittel (ändert die Design-Philosophie „strikt Token-Props"). **Aufwand:** S.

Entweder (a) eine optionale `className`-Prop auf `Card`/`Box`/`Button` (Web-only, Native ignoriert per JSDoc — pragmatisch, aber öffnet die Tür für Drift), oder (b) zusätzliche Token-Props (z.B. `Card.accentColorLeft`, `Box.tintBg`, `Button.iconOnly`, `Button.onClick?` neben `onPress`). **Empfehlung:** (a) für `className` als dokumentierte Escape-Hatch mit Lint-Hinweis (nur wenn Token-Props nicht reichen) + (b) `Button.onClick?` optional machen (eines von `onClick`/`onPress` Pflicht) + `Button.size='icon-sm'|'icon-md'`. **Ohne diesen Task bleibt P2-T6 blockiert.**

- [ ] Step 1: Entscheid Aaron: (a) / (b) / beide / nichts.
- [ ] Step 2: `primitives/Card/Card.{web,native,types}.tsx`, `Box`, `Button` entsprechend erweitern. `tokens`-Bindung bleibt Default.
- [ ] Step 3: `tsc --noEmit` + voller Build grün. Commit.

---

## P2-T1 — 3× inline `KpiBox` → `shared/StatCard` ✅ ERLEDIGT (Teil von PR „Phase 2 — Plan + KpiBox→StatCard")

`provisionen/ProvisionenClient.tsx` (4×, bekommt Icons), `admin/kanzlei-board/page.tsx` (3×), `mitarbeiter/page.tsx` (6×, mit `href`). `function KpiBox` gelöscht, `color`→`tone` gemappt (blue/violet→ondo, amber→warning, emerald→success), `size="sm"`. Optik harmonisiert (weiße Card + Icon-Badge-Tint statt komplett getönte Box; violet entfällt). ASCII-Fix „Bestaetigt"→„Bestätigt". Voller Build grün.

---

## P2-T2 — Restliche Status-Maps zentralisieren (Audit R8 Rest)

**Risiko:** niedrig. **Aufwand:** M.

Termin-Status, Abrechnung-Status, Provision-Status, Auftrag-Status — aktuell pro Component hartkodierte Farb-/Label-Maps. Nach `lib/statusLabels.ts` ziehen (oder eigene `lib/<domain>-labels.ts` mit demselben 7-Slot-Schema) + die Consumer auf `<StatusBadge colorCls={…}>` / einen `<TerminStatusBadge>`/`<AbrechnungStatusBadge>` umstellen. Kandidaten greppen: `grep -rn "STATUS_PILL\|_COLORS\b\|_LABELS\b" src/app src/components` (außer `statusLabels.ts`). Jeder Map-Move = eigener Commit, voller Build bei Route-Files.

- [ ] Step 1: Kandidaten-Liste erstellen (Termin/Abrechnung/Provision/Auftrag).
- [ ] Step 2..n: Pro Domain: Map → `lib/statusLabels.ts` (Slots) + Consumer → Badge. Commit + Build.

---

## P2-T3 — `MaklerAkteDetail` → `shared/fall-*` (Audit R14)

**Risiko:** mittel-hoch (Makler-Akten-Detailseite, mehrere Tabs). **Aufwand:** L.

`src/components/makler/akte-detail/MaklerAkteDetail.tsx` (+ `MaklerChatTab`, `MaklerCopilotTab`) reimplementiert Fallakte-Bausteine die es schon als `shared/fall-*` gibt. Vorher: bestehendes `shared/fall-*`-Inventar sichten (`ls src/components/shared` + `grep -rn "shared/fall"`). Wo ein `shared/fall-*` passt → ersetzen; wo ein Makler-spezifischer Cut nötig ist (read-only, Consent-gefiltert) → Prop/Variant am `shared/fall-*` ergänzen statt parallel zu bauen. **Eigener Plan-Schritt + Browser-Smoke des Makler-Akten-Detail vor Merge** (Test-Login siehe Phase-1-Plan §Test-Login).

---

## P2-T4 — Stammdaten-Renderer-Konsolidierung (Audit R12)

**Risiko:** mittel-hoch (Fallakte + Dispatch + SV-Feldmodus rendern Stammdaten je eigen). **Aufwand:** L.

`_stammdaten/Sections.tsx`, `dispatch/.../Phase4Stammdaten.tsx`, `fall/StammdatenDetail.tsx`, `kunde/ClaimSummary.tsx`, `gutachter/feldmodus/SvFallakteView.tsx` rendern überlappende Feld-Listen. Ein `shared/stammdaten/StammdatenRenderer` der eine Feld-Schema-Liste + Mode (`inline-edit` | `readonly` | `compact`) bekommt. **Erst nach P2-T2** (braucht zentrale Labels) und nach Klärung ob `InlineEditField` der gemeinsame Edit-Baustein bleibt. Großer Task — eigener Plan.

---

## P2-T5 — Wizard-Engine vereinheitlichen (Audit R9/R10/R11)

**Risiko:** hoch (Onboarding-Flows, öffentlicher Flow, SV-Onboarding). **Aufwand:** XL.

`FlowWizardKfz` (Deprecation-Frist abwarten → dann löschen), `OnboardingWizard` (Kunde) + `BueroOnboardingClient` (SV) auf eine client-Wizard-Engine (`WizardClient`) migrieren; **ein** Glass-Field-Set (`shared/glass/*` + `onboarding/fields/*` zusammenführen). **Eigener Plan + Smoke jedes Flows + Deprecation-Check FlowWizardKfz.** Nicht in einem Rutsch — Sub-Tasks pro Wizard, je eigener PR.

---

## P2-T6 — `ui/button`-App-Consumer → `primitives.Button`; `ui/button` ggf. behalten (Audit, blockiert durch P2-T0)

**Risiko:** mittel (öffentlicher Schaden-melden-Funnel). **Aufwand:** M. **Blockiert: braucht P2-T0.**

8 Consumer (`schaden-melden/schritt-1..4`, `InviteGegnerModal`) nutzen `className` (`bg-claimondo-ondo/hover`, `h-14 w-14 rounded-full` Icon-Buttons, `w-full`), `type="submit"`, `onClick`. Nach P2-T0 (className-Hatch + `onClick?` + `size='icon-*'` an `primitives.Button`): pro File `import { Button } from '@/components/ui/button'` → `'@/components/primitives'`, Props mappen. `ui/button` bleibt (`ui/dialog`/`ui/sheet` nutzen es intern) — kann erst gelöscht werden wenn auch die zwei Rich-Components migriert sind (out of scope). **Voller Build + Browser-Smoke des Funnels vor Merge** (= Lead-Pipeline, hohe Stakes).

---

## P2-T7 — `<table>` → `ui/table` ODER `ui/table` löschen (Audit)

**Risiko:** niedrig. **Aufwand:** S/M.

Entscheidung Aaron: lohnt `ui/table` (Radix-a11y) für die ~30 handgerollten `<table>`-Listen, oder ist `ui/table` tot → löschen? Wenn behalten: die größten `<table>`-Listen (Admin-Fälle, SV-Liste, Makler-Akten) auf `ui/table` migrieren. Wenn löschen: `grep -rn "from '@/components/ui/table'"` → 0? → `git rm`.

---

## Reihenfolge / Parallelisierung

- **Sequentiell zuerst:** P2-T0 (Aaron-Entscheid, Voraussetzung), dann P2-T2 (Status-Maps).
- **Parallel danach** (verschiedene Datei-Cluster, kein Shared-State): P2-T6 (nach T0), P2-T3 (MaklerAkteDetail), P2-T7 (table-Entscheid). → könnten je ein „Hund"-Agent in eigenem Worktree.
- **Zuletzt, einzeln, je eigener Plan:** P2-T4 (Stammdaten), P2-T5 (Wizard) — die zwei größten, brauchen Smoke.

Jeder Task: eigener Branch (`kitta/aar-<slug>`), PR gegen `main`, voller `NODE_OPTIONS=8192 npm run build` bei Route/Layout-Changes, Audit-Status im Commit-Body, nicht selbst mergen.
