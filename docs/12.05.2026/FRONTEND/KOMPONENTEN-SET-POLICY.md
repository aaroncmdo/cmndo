# Komponenten-Set-Policy — verbindlich (12.05.2026)

**Entscheidung getroffen** (Aaron, 12.05.2026): Mobile-App = **React Native** (eigene App, nicht Capacitor) → die `src/components/primitives/*`-Dual-File-Vorbereitung (`.web.tsx` + `.native.tsx`) ist der gewollte Pfad. Strategie = **Hybrid**.

Diese Policy beendet den Zustand „drei konkurrierende ‚offizielle' Komponenten-Sets, keines durchgesetzt" (siehe `FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md`: shadcn-`ui/*` mit <10 % Adoption, `primitives/*` mit ~28 Consumern, handgerolltes Tailwind als De-facto-Standard). Ab jetzt gilt **eine** Schichtung.

---

## Die drei Layer (ab jetzt verbindlich)

### 1 · Atom-Layer = `@/components/primitives/*`
**Dual-File Web+Native**, gebunden an `src/lib/design-tokens.ts` (die plattform-agnostische Token-Quelle). Jeder Primitive hat `*.web.tsx` + `*.native.tsx` + `*.types.ts` (Props leben im `.types.ts`, beide Plattformen importieren sie).

Vorhanden: `Badge`, `Box`, `Button`, `Card`, `CloseButton`, `Drawer`, `DropletBadge`, `Icon`, `Modal`, `Row`, `Stack`, `Text`.

**Regel:**
- **Pflicht** für Buttons, Cards/Section-Container, Modals/Sheets/Drawers, Text-Blöcke, Box/Stack/Row-Layout, Badges, Icons.
- **Kein handgerolltes** `<button className="…rounded-…bg-claimondo-navy…">` / `<div className="bg-white rounded-… border border-claimondo-border p-…">` mehr für **neuen** Code.
- Neue Atoms kommen hierhin — mit `.web.tsx` + `.native.tsx` + `.types.ts`. Werte ausschließlich aus `design-tokens.ts` (kein Tailwind-Default-Farbton, kein Inline-Hex außer `var(--brand-*, #fallback)` für Brand-Props).
- Web/Native-Asymmetrien sind erlaubt, wenn plattformgerecht, und gehören als JSDoc ins `.types.ts` dokumentiert (z. B. `Modal.closeOnEsc` ist web-only; `Drawer.placement='bottom-sheet'` ist web-only — siehe `native-primitive-drift-audit.md`).

### 2 · Composite-Layer = `@/components/shared/*`
Zusammengesetzte UI-Bausteine, gebaut **auf** den Primitives — oder, wo kein passendes Primitive existiert (z. B. `<table>`, Icon-Badge-Tints, freie Grid-Größen), auf token-gebundenem Tailwind (`claimondo-*` → `var(--brand-*)`). Vorhanden u. a.: `PageHeader`, `StatusBadge`, `FallStatusBadge`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `StatCard`, `SectionCard`, `DataTable` (`Table`/`Thead`/`Tbody`/`Tr`/`ClickableTr`/`Th`/`Td` + `DataTableContainer`), `forms/TextField`+`forms/SelectField`, `Avatar`, `AvatarUpload`, `PhoneButton`, `GlassPanel`, `glass/*`, `portal-nav/*`, `fall-header/*`, `fall-phases/*`, `fall-tabs/*`, `fall-kontakte/*`, `fall-mitteilungen/*`, `stammdaten/*`, `TerminCard`, `TodoCard`, `VersichererSelect`, `NotificationPreferencesForm`, `DokumenteDownloadListe`.

**Regel:** Wenn ein UI-Muster in >2 Stellen vorkommt → hierhin extrahieren statt es zum dritten Mal inline zu bauen. Composites bauen auf `primitives/*` (für Plattform-Tauglichkeit) oder — wenn explizit web-only / kein Primitive passt — auf `ui/*` bzw. token-gebundenem Tailwind.

**Tabellen-Listen / Dashboards:** `shared/DataTable` statt handgerolltem `<thead className="bg-claimondo-bg text-xs uppercase …">` / `<td className="px-4 py-3 …">`. `className` wird via `cn()`/tailwind-merge gemergt — kollidierende Caller-Klassen gewinnen automatisch (kein `!` nötig). Hinweis Tailwind v4: `!important` ist der **Suffix** `class!`, **nicht** der Prefix `!class` (der generiert in v4 keine Regel).

### 3 · Web-only Rich-Components = `@/components/ui/*` (shadcn / Radix)
**Erlaubt, aber nur** für desktop-spezifische Rich-UI ohne sinnvolles Native-Pendant. Behalten: `tabs`, `select`, `dialog`, `sheet`, `dropdown-menu`, `checkbox`, `input`, `label`, `textarea`, `separator`, `Chip`, `loading-button`, `PasswordInput`, `sonner` (Toast). **`table` gelöscht (12.05.2026):** war shadcn-getokt (`muted`/`border` statt `claimondo-*`), kein Radix, 0 Consumer → ersetzt durch `shared/DataTable` (Claimondo-getokt).

**Begründung:** Die Mobile-App (RN) baut Listen/Tabellen/Date-Picker/Dropdowns mit Native-Patterns neu — ein 1:1-Port dieser Screens ist nicht geplant. Also lohnt sich Radix' fertige Accessibility-Arbeit für die Web-Desktop-Tools, ohne dass es die Web/Native-Konsistenz auf **Atom**-Ebene bricht.

**Regel:** `ui/*` ist **nicht** für Atoms. Buttons/Cards/Badges/Modals kommen aus `primitives/*`, nicht aus `ui/*`. Die überlappenden `ui/*`-Atoms werden entfernt (siehe Cleanup).

### Handgerolltes Tailwind = kein Standard
Reine Layout-Utilities (`flex`, `grid`, `gap-*`, `px-*`, `mt-*`, …) auf Wrapper-Divs bleiben normal. **Komponenten** (Button, Card, Pill, Drawer, Field, …) werden nicht mehr inline aus Tailwind gebaut — sie kommen aus den drei Layern oben. Bestehende Inline-Implementierungen werden schrittweise migriert (Plan: `FRONTEND-KONSOLIDIERUNG-PHASE-1`).

---

## Cleanup-Folgen (Konkret)

### Sofort entfernen — überlappende `ui/*`-Atoms
| Datei | Ersatz | Aktion |
|---|---|---|
| `src/components/ui/card.tsx` (0 Importe) | `primitives.Card` + `shared/SectionCard` | löschen |
| `src/components/ui/badge.tsx` (0 Importe) | `primitives.Badge` / `shared/StatusBadge` | löschen |
| `src/components/ui/avatar.tsx` (0 Importe) | `shared/Avatar` / `KundeAvatar` | löschen |
| `src/components/ui/button.tsx` (8 Importe) | `primitives.Button` | 8 Consumer migrieren, dann löschen |
| `src/components/ui/dropdown-menu.tsx`, `separator.tsx`, `sonner.tsx` (0 Importe) | — | **behalten** (Radix-Rich-Components, werden bei der Migration weg von Inline-`<select>`/`<hr>`/inline-Toast genutzt) — oder bei finaler Entscheidung „brauchen wir nie" löschen |

### Quick-Wins (jetzt eindeutig — Detail im Phase-1-Plan)
1. `function FilterChip` (3×) → **`ui/Chip`** (+`ChipRow`) — existiert 1:1.
2. `function StatusPill` (3×) → **`shared/StatusBadge`**; inline `function EmptyState` (2-3×) → **`shared/EmptyState`**.
3. `shared/StatCard` extrahieren (auf `primitives.Card`/`Text`/`Box`) → 5 Inline-Implementierungen ersetzen (`FinanceClient`, `admin/_components/KpiCards`, `TeamClient`, `MaklerDashboard`, `MaklerPromo`).
4. `shared/forms/TextField` + `…/SelectField` extrahieren → ~13 Inline-`function Field` ersetzen.
5. `shared/SectionCard` extrahieren + 3 Inline-`function Card`-Section-Shells umstellen; `tasks/TaskCreateModal.tsx` löschen (0-Consumer-Dup von `TaskAnlegenModal`).
6. `MaklerShell` → `shared/portal-nav/PortalNav` (dark-Variante) migrieren (~120 LOC weg, heilt die `text-claimondo-shield`-Inkonsistenz).
7. 5 Layouts (`admin`, `gutachter`, `kunde`, `mitarbeiter`, `makler/(shell)`) → `requirePortalAccess()` aus `lib/auth/portal-guard.ts`.
8. Bugs fixen: doppelter `<Link href="/gutachter/einstellungen">`-Block in `GutachterShell.tsx:452-468`; doppelter Kommentar-Block in `DispatchNav.tsx`/`AdminNav.tsx`.
9. `kanzlei/dashboard/page.tsx` `STATUS_PILL`/`PHASE_LABEL` + `MaklerAktenList.PHASE_COLORS` → zentrale Map (`lib/statusLabels.ts`) + `FallStatusBadge` (heilt die optische Status-Inkonsistenz zwischen Portalen).

### Mid-Term
- `MaklerAkteDetail.tsx` (611 LOC) → auf `shared/fall-header`/`shared/stammdaten`/`shared/fall-tabs` migrieren (wie Kanzlei = 18-Z.-Redirect auf `/faelle/[id]`).
- Wizard-Engine vereinheitlichen: `WizardClient` (DB-getrieben) als einzige client-Engine; `FlowWizardKfz` nach Deprecation-Frist (≥ 2026-05-26) löschen; `OnboardingWizard`/`BueroOnboardingClient` migrieren; `onboarding/fields/*` ↔ `shared/glass/*` zu **einem** Field-Set; `shared/StepIndicator` für `FlowProgress` + `GlassStepIndicator`.
- Stammdaten-Renderer konsolidieren: `StammdatenAccordion`+`StammdatenDetail` → `shared/stammdaten` `mode='read'`; `Phase4Stammdaten` → `mode='edit'`; Field-Visibility zentral aus `lib/fall/phase-config.ts`.
- Status-/Label-Maps zentralisieren: `lib/status/{lead,termin,abrechnung,provision}.ts` analog `lib/statusLabels.ts`; ~25 UI-Stellen importieren statt eigene `cfg`-Maps.
- `<table>` (53×) → `ui/table` für die ~10 Admin-/Makler-Tabellen.

### Drift-Bremse — Lint-Regel
Ein `scripts/check-component-set.mjs` (oder ESLint-Rule), der in `src/app/**` + `src/components/**` (ausgenommen `ui/`, `primitives/`, `shared/`) warnt bei:
- `<button className=` (außer mit `type="submit"`-Forms ohne Styling) — Hinweis: nutze `primitives.Button`
- `<div className=".*bg-white.*rounded.*border.*claimondo-border` — Hinweis: nutze `primitives.Card` / `shared/SectionCard`
- lokales `function (StatCard|KpiCard|FilterChip|StatusPill|MiniDrawer|SectionCard|InfoRow|InfoCard)` — Hinweis: shared-Pendant nutzen

Als `--warn` einbinden (CI nicht hart blocken, aber sichtbar machen); später ggf. auf `--error` für neue Dateien.

---

## Was bewusst getrennt bleibt
- **`GutachterShell.tsx`** ≠ `PortalNav` — Whitelabel-Theme (`var(--brand-sidebar-bg)` etc.), Feldmodus-Sonderfall (Sidebar/FAB/Spotlight ausgeblendet), WeatherBanner, `sv-modal-root`-Portal, Geo-Tracking, eigener Realtime-Badge-Channel. *Aber:* der Auth-Guard-Teil → trotzdem `requirePortalAccess(['sachverstaendiger'])`.
- **`kunde/layout.tsx`** ≠ `PortalNav` — SV-Branding-Resolution, 4 Sidebar-Kontakt-Cards, Sprach-Banner, Onboarding-Redirect pro Fall. Fachlich dicht, nicht copy-paste.
- **`lib/makler/queries.ts`** ≠ `lib/fall/queries.ts` — Consent-Scope-Shape + Minimal-View.
- **`primitives/*`-Web/Native-Asymmetrien** — plattformgerecht; nur JSDoc nachziehen + Glass-Blur-Native-Lib (`expo-blur` vs. `@react-native-community/blur`) vor Mobile-Launch entscheiden.

---

## Querverweise
- `FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md` — die vollständige Bestandsaufnahme (Adoptions-Zahlen, Cluster R1–R16 + R-S1–R-S5, belegende greps).
- `native-primitive-drift-audit.md` — der Atom-Layer (`primitives/*`) ist sauber; Problem ist Adoption, nicht Qualität.
- `dead-code-audit.md` — File/Export-Level (Knip); überlappt bei TerminCard-Konsolidierung, `lib/statusLabels.ts` „9 unused exports" (= die ignorierte zentrale Map).
- `branding-rollout-spec.md` / AGENTS.md-Abschnitt „branding-rules" — Farb-/Theming-Konventionen (komplementär: *welche* Farben; diese Policy: *welche* Komponenten).
