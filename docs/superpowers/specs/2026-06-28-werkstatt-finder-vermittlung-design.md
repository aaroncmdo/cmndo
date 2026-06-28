# Werkstatt-Vermittlung & -Finder — Design

**Datum:** 2026-06-28
**Status:** Validiert (Aaron-Freigabe Phase-1-Schnitt) — bereit fuer Implementierungs-Plan
**Branch:** `kitta/werkstatt-finder-vermittlung` (off staging)

## Ziel

Claimondo vermittelt Kunden, die einen Schaden, aber **keine Reparatur-Werkstatt** haben, eine passende Partner-Werkstatt — zuerst Dispatcher-getrieben, spaeter Kunde-Self-Service und oeffentlicher Embed. **Ein geteilter Geo-Matching-Kern, drei Flaechen, nach Werkstatt-Supply gestaffelt.**

## Kontext: zweiseitiger Marktplatz

- **Heute (gebaut, #3084 ff.):** Werkstaetten **werben** Kunden via QR → Claim, Werkstatt erhaelt 150 € Vermittler-Provision. `claims.werkstatt_id` = die *vermittelnde* Werkstatt. *Inbound.*
- **Neu (dieses Design):** Claimondo **vermittelt** einem Kunden ohne Werkstatt eine Partner-Werkstatt fuer die Reparatur. *Outbound.* Dieselbe `werkstaetten`-Entitaet, zweite Rolle.

Wiederverwendbare Bausteine:
- `werkstaetten` hat bereits **Geo** (`lat, lng, isochrone`) + `status` + Admin-Anlage (`createWerkstatt`) + ein Werkstatt-Portal.
- **Gutachter-Finder** (FinderWizard, Geo-Distanz, Karte) = Vorlage, die wir **vereinfachen**.
- **Dispatch-Portal + Claim-Detail** = Einstiegspunkt fuers Dispatcher-Tool.

## Locked Decisions (Brainstorming-Ergebnis)

1. **Flow:** Dispatcher-getrieben (Phase 1). Endziel Hybrid (Flow-Signal + Dispatcher-proaktiv); das Flow-Signal kommt in **Phase 2**.
2. **Zweck:** Service jetzt, **Monetarisierung spaeter** — die Zuweisung wird getrackt (Quelle + Timestamp) als Provisions-Hook.
3. **Supply:** ausschliesslich **admin-angelegte Partner-Werkstaetten** (die mit Portal). Kein Import, kein Self-Onboarding. „Listung" = Verzeichnis dieser Partner fuer den Finder.
4. **Reihenfolge:** Dispatcher zuerst; Kunde-im-Flow + Embed nach genug Supply.
5. **Datenmodell:** neues Feld `claims.reparatur_werkstatt_id` — **NICHT** `werkstatt_id` (= Vermittler) wiederverwenden.

## Architektur: geteilter Kern + 3 Flaechen

**Geteilter Kern (einmal bauen, alle Phasen nutzen ihn):**

- **`findWerkstaetten(input)`** — `src/lib/werkstatt/finder.ts`. Input = Geo (lat/lng oder PLZ aus Claim-Schadenort/Kundenadresse) + Limit. Query: aktive `werkstaetten`, **Distanz-Ranking** (Haversine aus lat/lng; PLZ-Geo-Fallback). Output: rangierte Liste `{id, name, adresse, distanz_km, telefon, …}`. Filter: `status` aktiv + nicht gesperrt. **KEIN** Isochrone-Wizard (das ist der „einfacher als Gutachter"-Punkt).
- **`WerkstattFinder`** — `src/components/werkstatt/finder/WerkstattFinder.tsx`. Distanz-Liste (Name · Adresse · Entfernung · Kontakt) + `onSelect(werkstattId)`. Optional Mini-Karte (spaeter). Stateless + surface-agnostisch → Dispatcher/Kunde/Embed wrappen ihn.

**Flaechen:** Phase 1 Dispatcher · Phase 2 Kunde im /flow · Phase 3 Embed.

## Phase 1 — Dispatcher vermittelt (das MVP)

### Datenmodell (1 additive Migration auf `claims`)
- `reparatur_werkstatt_id uuid NULL REFERENCES werkstaetten(id)` — zugewiesene Reparatur-Werkstatt.
- `reparatur_werkstatt_zugewiesen_am timestamptz NULL`.
- `reparatur_werkstatt_zugewiesen_von uuid NULL` — der zuweisende User (Dispatcher).
- `reparatur_werkstatt_quelle text NULL CHECK (reparatur_werkstatt_quelle IN ('dispatcher','kunde','embed'))` — Attribution + Monetarisierungs-Hook.

Migration **ausschliesslich via Supabase-Plugin** (`apply_migration`, Regel 2). Types-Regen mit cfefdf75 abgestimmt (s. Koordination).

### Matching-Kern
`findWerkstaetten` wie oben. Claim-Standort-Aufloesung: Schadenort-PLZ/Geo aus `v_claim_full` → Koordinate → Distanz zu `werkstaetten.lat/lng`. (Geo-Distanz-Helper aus dem Gutachter-Finder/Dispatch wiederverwenden — exakte Quelle im Plan festnageln.)

### Dispatcher-Action + UI
- **Server-Action `vermittleWerkstatt(claimId, werkstattId)`** (Result-Object `{ ok; error? }`, Regel-konform): setzt die 4 Felder (`quelle='dispatcher'`, `von=auth.uid()`, `am=now()`), schreibt ein Timeline-Event, triggert Benachrichtigungen (try/catch, non-critical), `revalidatePath` der betroffenen Routen.
- **UI:** Button „Werkstatt vermitteln" in der Dispatch-Claim-Ansicht → Drawer/Modal mit `WerkstattFinder` (vorgefiltert nahe Kunde) → auswaehlen → Action. Zeigt die zugewiesene Werkstatt + „aendern".
- **Auth:** nur dispatch/admin (bestehende Guards; passt zur neuen Write-Path-Haertung #3264).

### Benachrichtigung
- **Kunde:** `createMitteilung` + WhatsApp/Email („Deine Werkstatt: {name}, {adresse}, {telefon}").
- **Werkstatt:** WhatsApp/Email an den Werkstatt-Kontakt („Neuer Reparaturauftrag: Claim {nr}"). **Portal-,,zugewiesene Auftraege"-View = koordinierter Follow-up** (cfefdf75-Domain) → haelt Phase 1 disjunkt.
- Beide non-critical (try/catch) → brechen den Status-Update nicht.

### Trigger Phase 1
**Dispatcher-proaktiv** auf jedem Claim. Keine Queue-Signal-Logik noetig (Dispatcher initiiert). Das Flow-Signal „Hast du eine Werkstatt?" + die gefilterte Queue = Phase 2.

## Phase 2 — Kunde im /flow (Roadmap)
- Flow-Frage „Hast du schon eine Werkstatt?" (additiv im Schaden-/Onboarding-Flow). „Nein" → `braucht_werkstatt`-Signal → Claim in der Dispatcher-Queue **und** Kunde kann selbst finden.
- Kunden-Wrapper um `WerkstattFinder` im /flow → Kunde waehlt → `quelle='kunde'`.
- ⚠ beruehrt den heissen Flow (aar-956) → Koordination, rein additiver Step.

## Phase 3 — Embed (Roadmap)
- Standalone embeddbarer Finder (wie `embed/gutachter-finder`) → oeffentlich, Lead-Gen. Submit → Lead/Anfrage. `quelle='embed'`.
- Eigener Top-Level-Build; erst nach genug Supply.

## Koordination (cfefdf75 = Werkstatt-Owner, aktiv)
- Eigener Branch `kitta/werkstatt-finder-vermittlung`, eigener Worktree.
- **NEUE Files:** `lib/werkstatt/finder.ts`, `components/werkstatt/finder/*`, Dispatcher-Action + UI.
- **SHARED (additiv/koordiniert):** `lib/werkstatt/queries.ts` (nur neue Funktionen, keine Umbauten), `database.types.ts` (Regen nach Migration — Merge-Konflikt-Risiko, mit cfefdf75 abstimmen), Werkstatt-Portal (Phase-1b-View spaeter).
- **Neues Feld statt `werkstatt_id`-Repurpose** → keine Kollision mit der Vermittler-Logik.
- Marker: `COORDINATION-werkstatt-finder-vermittlung.md`.

## Risiken / offen
- **Supply:** nur Partner-Werkstaetten (aktuell 3). Phase 1 supply-tolerant; Phasen 2/3 erst bei genug Partnern → kein leerer Kunden-Finder.
- **Claim-Standort-Anker:** Schadenort vs Kundenadresse fuer die Distanz — im Plan festnageln (welches Feld zuverlaessig geo'd ist).
- **Total-Schaden:** keine Reparatur → Werkstatt evtl. irrelevant; Phase 1 kein Auto-Filter (Dispatcher entscheidet), Phase 2 evtl. ausblenden.
- **`werkstaetten.status`-Werte:** exakte aktiv/gesperrt-Semantik im Plan verifizieren (Spalten: `status, aktiviert_am, gesperrt_am`).

## Testing
- **vitest:** `findWerkstaetten` (Ranking/Filter), `vermittleWerkstatt` (Feld-Set + Quelle + Idempotenz).
- **Migration-Smoke (READ):** Spalten + FK + CHECK.
- **Manuell/E2E (spaeter):** Dispatcher weist zu → Felder gesetzt → Benachrichtigung; Live-DB-Verifikation wie im Makler-Capstone (Testdaten anlegen + restlos abraeumen).
