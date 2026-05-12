# Dead-Code & Redundanz-Audit

**Datum:** 2026-05-12
**Scope:** Knip-basierter Audit aller `src/` Files + Verifikation der Top-Verdachtsfälle
**Methodik:** `npx knip --reporter json` (165 KB Output) + `scripts/analyze-knip.mjs` Klassifikator + 1 Verifikations-Subagent gegen grep-Realität

---

## TL;DR

Knip liefert **207 vermeintlich unused Files**. Nach Filterung von Scripts/Public/Supabase/Tests + Verifikation gegen grep:

| Bucket | Files | Aktion |
|---|---:|---|
| **A — Sicher löschbar** (0 externe Imports verifiziert) | **38** | Bulk-Delete |
| **B — False-Positive** (Native-Pattern, Shadcn, Barrels, Server-Actions) | **43** | NICHT anfassen |
| **C — Unklar** (manuelle Prüfung) | **11** | Aaron-Entscheidung |
| Scripts/Public/Supabase (legitim) | 56 | Behalten |
| Next.js-Conventions | 0 | – |
| **Total** | **151 true-positive + 56 infra = 207** | |

**Plus:** 6 Dependencies in `package.json` löschbar, 3 unlisted devDeps fehlen.

**Geschätzter Aufwand:** Bulk-Delete + Dep-Cleanup **~30 Min** für sofort umsetzbare Wins.

---

## Sicher löschbar (Bucket A — 38 Files)

### Landing-Page-Reste (5)
```
src/components/landing/LandingDatTeaser.tsx
src/components/landing/LandingSeoContent.tsx
src/components/landing/LandingSteps.tsx
src/components/landing/LandingTrust.tsx
src/components/landing/LandingHero.tsx
```
**Begründung:** Landing-Page wurde via `hauptseite-v2` (PR #646) komplett neu gebaut. Alte Komponenten orphaned.

### Kunde-Components nach Funnel v3 / CMM-32 (11)
```
src/components/kunde/ClaimSummary.tsx
src/components/kunde/GoogleReviewPrompt.tsx
src/components/kunde/KanzleiPfadCard.tsx
src/components/kunde/KundeAbschlussCard.tsx
src/components/kunde/KundeAktivStatusHero.tsx
src/components/kunde/KundeAusfallEntschaedigungCard.tsx
src/components/kunde/KundeBetreuerStrip.tsx
src/components/kunde/OffeneDatenBanner.tsx
src/components/kunde/PflichtdokumenteBanner.tsx
src/components/kunde/SmokeKanzleiButton.tsx
src/components/kunde/EigeneKanzleiPaketCard.tsx  (Achtung: 1 Import in KundeTermineClient.tsx — vor Delete prüfen)
```
**Begründung:** Kunde-Portal wurde durch CMM-32 + Funnel v3 (PRs #786-797) umgebaut. Diese Cards sind ersetzt.

### Gutachter Fall-Cards nach CMM-32 (11)
```
src/app/gutachter/fall/[id]/_components/AbrechnungsartCard.tsx
src/app/gutachter/fall/[id]/_components/AbrechnungsCard.tsx
src/app/gutachter/fall/[id]/_components/AktuellePhaseCard.tsx
src/app/gutachter/fall/[id]/_components/DokumenteUebersichtCard.tsx
src/app/gutachter/fall/[id]/_components/KanzleiRegulierungsStepperCard.tsx
src/app/gutachter/fall/[id]/_components/KanzleiStatusCard.tsx
src/app/gutachter/fall/[id]/_components/NachbesichtigungCard.tsx
src/app/gutachter/fall/[id]/_components/ReklamationsCard.tsx
src/app/gutachter/fall/[id]/_components/StellungnahmeCard.tsx
src/app/gutachter/fall/[id]/_components/TimelineVorschauCard.tsx
src/app/gutachter/fall/[id]/_components/TerminCard.tsx  (Re-Export — Aaron-Check)
```
**Begründung:** SV-Fallakte nutzt nach CMM-32 stattdessen `MeinFallStatusCard` + `SvToolsCard` + `StammdatenCard`. Alte Cards referenziert nur in Kommentaren.

### Veraltete Komponenten (4 — verifiziert 0 grep-Treffer)
```
src/components/ChatChannel.tsx
src/components/WeatherWidget.tsx
src/components/Footer.tsx
src/components/claims/InvitationStatusBadge.tsx
src/components/claims/InviteGegnerModal.tsx
src/components/faelle/FallActivityFeed.tsx
src/components/fall/DokumentenListe.tsx
```

### Alte Scripts / Configs (7)
```
.claude/hooks/check-umlauts.mjs           ← ⚠️ Aaron-Check: AGENTS.md sagt der existiert "blockiert Commits mit ASCII-Ersatz". Wenn unused, eventuell nicht eingehängt?
services/baileys/ecosystem.config.cjs
services/baileys/src/index.js              ← unklar — Baileys ist live auf /opt/claimondo-baileys
src/scripts/password-reset-link.ts
src/scripts/resync-google-calendar.ts
src/scripts/seed-test-data.ts
src/scripts/set-temp-password.ts
src/lib/claimondo-colors.ts
src/lib/markNachrichtenGelesen.ts
src/app/gutachter-partner/WaitlistApply.tsx           ← Komponente
src/app/gutachter-partner/WaitlistApplyLoader.tsx     ← Loader
```

⚠️ **Vor Bulk-Delete prüfen:**
- `.claude/hooks/check-umlauts.mjs` — AGENTS.md erwähnt ihn als aktiven Pre-Commit-Hook. Wenn knip ihn als unused markiert, ist er ggf. nicht eingehängt in `.claude/settings.json` → echter Bug, nicht löschen sondern fixen
- `services/baileys/*` — der Service läuft live auf VPS (`/opt/claimondo-baileys`). Vermutlich liegt der echte Code dort, lokales `services/baileys/` ist Legacy-Kopie
- `gutachter-partner/WaitlistApply.tsx` + `Loader.tsx` — wurden offenbar gegen inline-Code im `GutachterPartnerClient` ersetzt. Vor Delete: lädt der Loader noch dynamisch?

---

## False-Positives (Bucket B — 43 Files, NICHT ANFASSEN)

### Native-Primitives (12)
```
src/components/primitives/{Badge,Box,Card,CloseButton,Button,DropletBadge,
  Icon,Modal,Row,Drawer,Stack,Text}.native.tsx
```
**Begründung:** Dual-File-Pattern (Web + Native) für Capacitor-Mobile-App. AGENTS.md / Memory `project_design_system` bestätigt: intentional im Repo, Mobile-App nicht live aber Files-Anlage vorbereitet.

### Shadcn UI-Components (8)
```
src/components/ui/{avatar,badge,card,dropdown-menu,separator,sonner,table,tabs}.tsx
```
**Begründung:** Werden via dynamische Imports / Tailwind-Klassen / shadcn-CLI-Konventionen genutzt. `sonner.tsx` nutzt aktiv `next-themes`. **Knip ist hier zu aggressiv.**

### UI-Barrel-Files mit selektiven Re-Exports (3)
```
src/components/ui/dialog.tsx   (5 unused Re-Exports: DialogClose/Footer/Overlay/Portal/Trigger)
src/components/ui/select.tsx   (5: SelectGroup/Label/Scroll*/Separator)
src/components/ui/sheet.tsx    (5: SheetTrigger/Close/Header/Footer/Description)
```
**Begründung:** Sub-Komponenten werden vom Konsumenten optional importiert. Das ist shadcn-Konvention.

### Server-Actions (4)
```
src/lib/actions/analytics-actions.ts        — 3 fns, alle in Admin-Dashboards genutzt
src/lib/actions/call-actions.ts             — 4 fns, alle aktiv
src/lib/actions/push-subscribe.ts           — 2 fns, Notifications aktiv
src/lib/actions/stellungnahme-upload.ts     — 1 fn, genutzt
```
**Begründung:** Knip findet Server-Action-Imports manchmal nicht (dynamisches Form-Action-Binding).

### Mapbox-Stubs (1)
```
src/lib/mapbox/__stubs__/three-stub.ts
```
**Begründung:** Build-Stub für three.js (siehe AGENTS.md / PR #767 "three-stub 24 Exports"). Bleibt bis @react-three-Code aktiviert oder entfernt wird.

### Barrel-Index-Files (False-Positive bei Knip-Top-Liste)
- `src/app/faelle/[id]/_actions/index.ts` (30 unused Exports) — AAR-684 Phase 2: Barrel bewusst angelegt, Caller importieren teils aus Submodulen direkt. **Nicht löschen**, aber **prüfen ob Barrel überhaupt sinnvoll** (siehe Bucket C)
- `src/lib/mapbox/index.ts` (15 unused Exports) — analog
- `src/components/shared/claims/index.ts` (15 unused Exports) — analog
- `src/lib/design-tokens.ts` (9 unused Exports) — via Tailwind-Config + CSS-Vars konsumiert, nicht via JS-Import. **By-design.**
- `src/lib/statusLabels.ts` (9 unused Status-Maps) — Constants für UI-Klassen, manche reactnative-Vorbereitung

---

## Unklar (Bucket C — Aaron-Entscheidung)

### TerminCard-Duplikation
- `src/components/shared/TerminCard.tsx` (shared read-only)
- `src/app/gutachter/fall/[id]/_components/TerminCard.tsx` (Re-Export, im Bucket A für Delete)
- `src/app/gutachter/heute/TerminCard.tsx` (separate Implementierung, lebendig)
- Inline-Card in `src/app/kunde/termine/KundeTermineClient.tsx`

→ **Konsolidierungs-Spec lohnt:** 1 shared Component mit Variant-Props statt 3 Implementierungen.

### Barrel-Sinnhaftigkeit
30 + 15 + 15 unused Exports in 3 Barrels (`_actions/index.ts`, `mapbox/index.ts`, `shared/claims/index.ts`). Wenn Caller direkt aus Submodulen importieren, sind die Barrels effektiv tot — sollten dann entweder konsequent genutzt werden oder gelöscht.

### Top-Unused-Exports-Files
| Datei | Unused Exports | Bewertung |
|---|---:|---|
| `src/app/faelle/[id]/_actions/index.ts` | 30 | Barrel — sinnvoll? |
| `src/components/shared/claims/index.ts` | 15 | Barrel — sinnvoll? |
| `src/lib/mapbox/index.ts` | 15 | Barrel — sinnvoll? |
| `src/lib/statusLabels.ts` | 9 | Constants — via CSS-Class genutzt? |
| `src/lib/design-tokens.ts` | 9 | by-design (Tailwind) |
| `src/lib/analytics/index.ts` | 8 | Admin-Dashboard-Queries, könnte genutzt sein |
| `src/lib/aircall/client.ts` | 6 | Aircall-Integration, mehrere unused fns |
| `src/lib/lead-fall-mapping.ts` | 6 | Map-Constants — ggf. via Spread eingebunden |
| `src/lib/sv/queries.ts` | 4 | SV-Filter-Helper |
| `src/lib/fall/queries.ts` | 4 | Fall-Loader-Helper |

→ Stichproben empfohlen, ob die Exports wirklich tot sind oder via Destructuring/Re-Export indirekt genutzt.

### Library-Files mit kompletter Datei-Toten-Vermutung
- `src/lib/abrechnung/calculate-lead-price.ts`
- `src/lib/abrechnung/process-case-billing.ts`
- `src/lib/aircall/bridge.ts`
- `src/lib/airdrop/server-actions.ts`, `token.ts`
- `src/lib/auftrag/side-quest.ts`
- `src/lib/branding/resolve-theme.ts` ⚠️ ist eigentlich Branding-Resolver (siehe Branding-Audit heute) — wenn knip ihn als unused markiert, ist das ein **Drift mit dem Branding-Rollout-Spec**: er soll genutzt werden, wird aber von keinem produktiven Code aufgerufen
- `src/lib/claims/anspruch.ts`
- `src/lib/faelle/mark-read-action.ts`, `unread-counts.ts`
- `src/lib/faq-bot/{analyse,ask,off-topic-guard}.ts`
- `src/lib/finance/fall-finanzen.ts`
- `src/lib/format/anrede.ts`
- `src/lib/geo/distance.ts`
- `src/lib/gps/track-position.ts`
- `src/lib/gutachten/ocr-actions.ts`
- `src/lib/onboarding/findSvsForLocation.ts` ← Achtung, war Hauptfeature des Funnel-PRs #788
- `src/lib/sv/qualifikationen-gate.ts`
- `src/lib/tasks/{index,kundeTypen}.ts`
- `src/lib/termine/{loader,notify-kunde-angekommen}.ts`
- `src/lib/vs-korrespondenz/actions.ts`
- `src/lib/kanzlei-wunsch/actions.ts` (10 fns, 747 Lines — siehe Server-Actions-Audit Outlier)

**Bemerkenswert:** `branding/resolve-theme.ts` und `onboarding/findSvsForLocation.ts` sind beide kürzlich gemerged worden (laut PR-Liste / Branding-Audit). Wenn sie wirklich tot sind, ist das ein **Inkonsistenz-Befund**: Code ist da, aber nirgendwo eingehängt. → **Cross-Check mit Branding-Audit** (Lücke: `resolveBrandTheme` wird in `gutachter/layout.tsx:92-100` aufgerufen — sollte ein Treffer sein. Knip-False-Positive durch Server-Component-Async-Import?).

---

## Unused Dependencies in `package.json`

### Sicher löschen (6)
```bash
npm uninstall @react-three/drei @react-three/fiber @react-three/postprocessing \
              @types/mapbox-gl @vis.gl/react-google-maps colorthief
```

| Paket | Begründung |
|---|---|
| `@react-three/drei` | 0 Imports; nur `three-stub.ts` Placeholder vorhanden |
| `@react-three/fiber` | dito |
| `@react-three/postprocessing` | dito |
| `@types/mapbox-gl` | Mapbox-Code nutzt `mapbox-gl` direkt, Types kommen built-in |
| `@vis.gl/react-google-maps` | Google-Maps wurde durch Mapbox ersetzt |
| `colorthief` | Branding nutzt `node-vibrant` (siehe `extract-colors.ts`), nicht ColorThief |

### Sicher löschen (devDep)
```bash
npm uninstall --save-dev @types/pdf-parse
```
Nur falls `pdf-parse` selbst auch raus — sonst behalten.

### BEHALTEN (False-Positive)
- `next-themes` — wird in `src/components/ui/sonner.tsx` aktiv genutzt
- `[dev] supabase` — Das ist die Supabase-CLI für `npx supabase migration new` (AGENTS.md Regel 2). **Behalten.**

### Unlisted (potenziell fehlende devDeps)
```
@react-email/preview-server (package.json)
playwright (scripts/screenshot-portals.mjs, scripts/smoke/marketing-i18n-smoke.mjs)
server-only (src/lib/legal/get-doc.ts)
google-auth-library (src/lib/google/oauth-client.ts)
three (src/lib/mapbox/sv-car-3d-three.ts, hero-pin-3d.ts, weather-fx.ts)
```
**Bewertung:**
- `playwright` — sollte `--save-dev` deklariert sein, läuft aber vermutlich global. Niedrige Prio.
- `three` — 3 Mapbox-Files importieren explizit `three`. Wenn nicht aufgelöst, brechen die Files zur Build-Zeit. Vermutlich indirekt über `@react-three/*` (die jetzt gelöscht werden) → **VORSICHT bei Dep-Cleanup**: erst three explizit deklarieren, dann @react-three rausnehmen
- `google-auth-library` — wird aktiv genutzt. Sollte als Dep. **Prüfen.**
- `server-only` — Next.js-Internal-Package, kein expliziter Eintrag nötig (kommt via `next`)

---

## Duplikate (2)

```
src/lib/branding/theme.ts                            — Funktion doppelt definiert
src/lib/email/google/templates/ProvisionReleased.tsx — Funktion doppelt definiert
```
→ Manueller Cross-Check: welche Definition ist die genutzte, andere löschen.

---

## Empfohlene Reihenfolge

### Sofort (30 Min, low-risk)
1. **6 Dependencies löschen** (`npm uninstall @react-three/* @types/mapbox-gl @vis.gl/react-google-maps colorthief`)
2. **Bucket-A-Files in 2-3 Commits löschen:**
   - Commit 1: 5 Landing-Files
   - Commit 2: 11 Kunde-Cards
   - Commit 3: 11 Gutachter-Fall-Cards
3. `npm run build` nach jedem Commit smoken

### Diese Woche (1-2 h)
4. **`three` explizit als Dep deklarieren** vor @react-three-Cleanup
5. **Bucket-C Library-Files** stichprobenweise verifizieren (10 grep-Checks)
6. **`branding/resolve-theme.ts`** und **`onboarding/findSvsForLocation.ts`** mit Branding-Audit und Funnel-Code cross-checken — sind das echte Lücken oder Knip-Bugs?
7. **2 Duplikate** in `branding/theme.ts` + `ProvisionReleased.tsx` fixen

### Backlog
8. **TerminCard-Konsolidierung** (3 Implementierungen → 1 mit Variants)
9. **Barrel-Sinnhaftigkeit** entscheiden: Caller vereinheitlichen oder Barrels löschen
10. **150 unused Types** in 110 Files — Hygiene-Sweep, keine Akut-Bugs

---

## Nicht in diesem Audit

- **Functional Dead-Code in lebenden Files** (z.B. `if (false) {...}`-Blocks, ungenutzte if-Zweige) — knip findet nur File/Export-Level
- **Test-Files-Coverage** — Knip läuft mit `--no-tests` (vermutlich), echter Test-Audit eigenes Ticket
- **CSS-Class-Dead-Code** — Tailwind purged automatisch, `globals.css` Custom-CSS aber nicht gescannt
- **DB-Migrations-Cleanup** — alte Migration-Files nicht löschbar (Reproduzierbarkeit)

---

## Anhang

- `scripts/audit-server-actions-output.json` (Static-Scan)
- `scripts/knip-output.json` (Knip-Raw, 165 KB)
- `scripts/knip-classified.json` (Klassifiziert)
- `scripts/analyze-knip.mjs` (Klassifikator)

**Stand:** 1 Verifikations-Subagent-Run gegen die 151 Knip-True-Positives. Klassifikation: 38 Bucket A (sicher), 43 Bucket B (False-Positive), 11 Bucket C (manuelle Prüfung). True-Positive-Rate Knip ~30 % — konsistent mit Knip-Aggressive-Mode bei Barrel + Native-Pattern.
