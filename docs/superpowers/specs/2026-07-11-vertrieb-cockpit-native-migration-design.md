# Vertrieb-Cockpit — Voll-Native Migration & B2B-Integration (Design)

**Datum:** 2026-07-11 · **Branch:** `kitta/vertrieb-cockpit-refine` · **Session:** 386b3bd8

## Problem
Die Vertrieb-Konsolidierung (#4088) hat die Übersicht vereint, aber die Sub-Funktionen sind nur **Deep-Links** (`// P1: href = Deep-Link auf Bestand`): CSV/Scrapen/Basis-Freigaben/QR-Pool/Makler+Werkstatt-anlegen und der SV-Detail-Klick machen Full-Page-Nav auf re-exportierte Standalone-Seiten. Aaron 11.07.: „du musst die **detail views migrieren**, nicht die route hinterlegen … saubere Konsolidierung + Migration … voll nativ … verifiziere nach dem Bau, auch auf prod (e2e)."

## Ziel
Nichts verlässt mehr das Cockpit. Jede Sub-Funktion öffnet **in** `/admin/vertrieb` — Detail-Views als `@drawer`-Intercept, Tool-/Wizard-Funktionen als **cockpit-native, aus den Monolithen extrahierte** Drawer-Komponenten. Alte redundante Einstiege werden bereinigt. B2B-Firmen-Flotte wird als Cockpit-Eintrag integriert.

## Architektur-Entscheidungen (gelockt)
1. **`@drawer`-Parallel-Route unter `/admin/vertrieb`** (Muster existiert schon 1:1 bei `/admin/sachverstaendige`: `layout.tsx` mit `{children, drawer}`, `@drawer/default.tsx`=null, `@drawer/(.)<sub>/page.tsx` rendert die Ziel-Seite in `DrawerShell`). Non-destruktiv.
2. **Detail-Views (SV, Werkstatt) via `@drawer`-Reuse** — die bestehenden Detail-RSCs (`sachverstaendige/[id]` ~592 LOC, `werkstaetten/[id]`) unverändert in `DrawerShell` gerendert. In-Cockpit-Links (Live-Ops-Liste, Karten-Popup) → `/admin/vertrieb/…/<id>` (Intercept→Drawer). Die **14 externen** Konsumenten bleiben auf `/admin/sachverstaendige/<id>` (Full-Page, korrekt). Kein Consumer-Update.
   - LiveOpsMap-`SvPopup` ist geteilt (3 Portale) → optionaler `svHrefBase`-Prop (backward-compatible), damit der Cockpit-Popup auf den Vertrieb-Pfad zeigt.
3. **Tool-/Wizard-Funktionen VOLL NATIV** (Aaron-Entscheid) — die Monolithen zerlegen:
   - `PartnerLeadsClient` (~1300 LOC) → Liste + CSV-Wizard + Scrape-Wizard (+ Lead-Detail bleibt Cockpit-Drawer).
   - `MaklerAdminClient` → Liste + Anlegen-Form (braucht `versicherungen`+`maklerpools`-Lookup via Server-Action).
   - `WerkstaettenClient` → Liste + Anlegen-Form.
   - `QrPoolClient` → schon self-contained; Liste/Wizard sauber trennen.
   - Jeder Wizard rendert **fokussiert im Cockpit-Drawer** (Muster: `AnlegenTabs` im `primitives.Drawer`, Client-State), NICHT die ganze Seite.
4. **B2B-Firmen-Flotte** (Session 89f501f6, PR #4132) → eigener Cockpit-Eintrag „Firmen-Flotten" nach dem neuen nativen Makler/Werkstatt-Muster. Danach entfernt 89f501f6 ihren interim `PartnerHubTabs`-Eintrag.

## Phasen (jede einzeln baubar + verifizierbar)
- **Phase 0 — Live-Ops-Merge (GEBAUT):** 3. Toggle Live-Ops, LiveOpsMap im Karte-Toggle, operative SV-Liste, Aktionen als Buttons, SV-Karte-Redundanz raus. tsc grün, 4/4 Tests, live verifiziert.
- **Phase A — `@drawer`-Infra + Detail-Views migriert (SV + Werkstatt):** höchster Wert, Reuse-basiert. Löst „detail views migrieren".
- **Phase B — Wizards voll-nativ:** Monolith-Split → CSV · Scrape · QR-Pool · Basis-Freigaben · Makler-anlegen · Werkstatt-anlegen als fokussierte Cockpit-Drawer. Größtes Stück, Wizard-für-Wizard.
- **Phase C — B2B-Firmen-Flotten-Eintrag** im Cockpit; Ping an 89f501f6 → interim-Tab raus.
- **Phase D — Cleanup:** orphaned Re-Exports (z.B. `/admin/vertrieb/sachverstaendige` Karten-Seite), tote Deep-Link-Kommentare, redundante Einstiege; sicherstellen dass **kein** Navigate-Out mehr existiert.

## Verifikation (Aaron: „e2e … auch auf prod")
- **E2E** (`tests/e2e/flows/vertrieb-cockpit-migration.spec.ts`, Playwright): pro Phase — Pills/Toggles da; jede Aktion öffnet einen **Drawer** (URL bleibt `/admin/vertrieb`, kein Full-Page-Weg); Detail-Drawer öffnet/schließt; Wizards funktionieren; B2B-Pill da.
- **Lokal** gegen Prod-DB (dev :3210) nach jeder Phase.
- **Prod-Smoke** nach Merge+Deploy: `app.claimondo.de/admin/vertrieb` — Kern-Flows anklicken (read-only), 0 Runtime-Errors.

## Nicht in Scope
- Rewrite der Detail-RSCs (SV/Werkstatt) — bewusst reuse.
- Anfassen von `src/app/admin/partner/*` (89f501f6-Lane).
- Kein DDL (reine Frontend-/Routing-Migration), außer B2B braucht etwas (dann via 89f501f6).

## Risiken
- Monolith-Split (`PartnerLeadsClient` 1300 LOC) = Regressionsrisiko an geteilter CRM-Seite → TDD + per-Task-Review.
- `@drawer`-Layout-Änderung betrifft alle Vertrieb-Child-Routen (default=null mildert).
- Intercept greift nur bei Soft-Nav **innerhalb** `/admin/vertrieb` — externe Links bleiben Full-Page (gewollt).
- Prod-Deploy-Lag: Prod-Smoke erst nach Release-Merge möglich.
