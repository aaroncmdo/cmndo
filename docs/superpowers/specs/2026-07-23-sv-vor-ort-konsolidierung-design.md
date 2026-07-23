# SV Vor-Ort-Flow-Konsolidierung (S3) — Design

**Datum:** 2026-07-23
**Lane:** b0e963b6 (SV-Claim-Detail-Audit, S3)
**Branch:** `kitta/sv-vor-ort-konsolidierung`
**Status:** Design freigegeben (Aaron „weiter", 23.07.) — Approach A. Kleiner Change → Plan in diese Spec gefaltet.

## Problem
Zwei parallele SV-Vor-Ort-Flows. Der **natürliche In-App-Weg (Kalender → Fallakte)** führt auf den **schwachen Flow A** (`VorOrtTriggerCard` → `VorOrtPanel`): 4 Fotos direct-to-storage, **kein OCR**, schreibt FIN/km + Timeline — **schließt die Begutachtung NICHT ab** (kein `durchgefuehrt_am`, **keine Phasen-Transition**, keine Kunde-Notify). Der **kanonische Flow B** (`/gutachter/termine/[id]/vor-ort` → `VorOrtClient`: Fahrzeugschein v/r + OCR + Schaden-Position + `completeBegutachtung` → Fall→`gutachten-eingegangen` + Kunde-WhatsApp) ist **verwaist** — nur über den Dispatch-Deep-Link erreichbar, **null Link von der Fallakte**.

**Stuck-Risk:** der SV kann in-app „Vor-Ort" machen (Flow A) und der Claim bewegt sich nie. Das „Bin angekommen"-Label ist zudem irreführend (setzt keine Ankunft — nur `setShowPanel(true)`).

## Ziel (Approach A, Aaron-Wahl)
Die Fallakte auf den **kanonischen Flow B** routen; den schwachen Flow A stilllegen. Ein Vor-Ort-Flow, vom natürlichen Weg erreichbar.

## Design
- **`VorOrtTriggerCard`** (SV-Fallakte): der Vor-Ort-Button wird ein **`<Link>` auf `/gutachter/termine/${aktiverTerminId}/vor-ort`** (Flow B). Label **„Vor-Ort-Erfassung öffnen"** (statt irreführend „Bin angekommen"). „Navigieren" (Google Maps) bleibt. `VorOrtPanel`-Overlay + `showPanel`-State + `router` entfallen. Props reduziert auf `{ aktiverTerminId: string | null; adresse: string | null }` (fallId/kundeName/kennzeichen/compact fielen nur in den Panel bzw. sind ungenutzt). **Kein `aktiverTerminId` → Vor-Ort-Link ausgeblendet** (defensiv; das Gate `zeigeVorOrt` verlangt `sv_termin`, ein aktiver Termin liegt i.d.R. vor).
- **`page.tsx`**: `<VorOrtTriggerCard aktiverTerminId={aktiverTermin?.id ?? null} adresse={besichtigungsAdresse} />` (`aktiverTermin.id` schon in Scope, :317-341). Alte Props (fallId/kundeName/kennzeichen) entfernt.
- **Retire (löschen)**: `src/components/VorOrtPanel.tsx` + `src/lib/actions/vor-ort-besichtigung-actions.ts` — beide **nur** von VorOrtPanel/VorOrtTriggerCard konsumiert (grep-verifiziert). **Kein Capability-Verlust**: Flow B ist Superset (Fahrzeugschein v/r + OCR + Fotos + km/vin-Slots); manuelle FIN→vehicles deckt die `FinNachtragenCard` (S1) ab.
- **Kein** `FallDetailClient`-Change (vorOrtCard-Prop wird in page.tsx gebaut). **Kein** DB-Change, **kein** i18n (SV-Portal inline-Deutsch).

## Datenfluss danach
Fallakte → „Vor-Ort-Erfassung öffnen" → Flow B → `completeBegutachtung` → Fall→`gutachten-eingegangen` + Kunde-WhatsApp. Der Vor-Ort-Button verschwindet nach Abschluss automatisch (Gate `!hatGutachten && status in [sv-termin, sv-zugewiesen]` greift nicht mehr). Stuck-Risk zu.

## Betroffene Files & Koordination
- `_components/VorOrtTriggerCard.tsx` (rewrite), `page.tsx` (1 Element), DELETE `VorOrtPanel.tsx` + `vor-ort-besichtigung-actions.ts`.
- ⚠ `page.tsx` auch von zustandsdoku-Lane (63fe43f9, VehicleScanGalerie) + S1(#4705)/S2(#4715) angefasst — meine Änderung liegt in der `vorOrtCard`-Prop-Region (:757-762), disjunkt. Merge-Reihenfolge über die Merge-Session.

## Implementation-Steps (proportional)
1. `VorOrtTriggerCard` rewriten (Link statt Panel, Props reduziert). tsc.
2. `page.tsx`-Element anpassen. tsc.
3. `VorOrtPanel.tsx` + `vor-ort-besichtigung-actions.ts` löschen; `check:knip -- --ratchet` (ggf. Baseline mit Begründung).
4. Full build (SV-Route). Gates (token-audit/component-set/knip). Commit + PR nach staging.
5. **Regel-4-Prod-Smoke**: SV-Fallakte → „Vor-Ort-Erfassung öffnen" → landet auf Flow B; Flow B abschließen → Fall→`gutachten-eingegangen` + Kunde-Notify (Test-Konto `telefon=NULL`); Panel-Overlay ist weg. Handoff an Deploy-Session.

## Testing
tsc/build + Regel-4-Prod-Smoke (throwaway-SV). **Kein Unit-Test** — reine Navigations-/UI-Verdrahtung, keine neue Pure-Logik.
