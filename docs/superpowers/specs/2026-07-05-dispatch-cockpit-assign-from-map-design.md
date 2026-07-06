# Dispatch-Cockpit V1: Assign-from-Map — Design-Spec

**Datum:** 2026-07-05
**Branch:** `kitta/dispatch-cockpit-assign-map` (off staging)
**Feature:** Dispatcher weist einem offenen Lead direkt aus der `/dispatch/karte`-Ansicht den räumlich-besten SV zu — ohne die Karte zu verlassen.

## Ziel

Die SV-Live-Ops-Karte (`LiveOpsMap`) vom Schaukasten zum Werkzeug machen: Klick auf einen **offenen, unzugewiesenen Lead-Pin** → Drawer mit den Top-SVs (Distanz + ETA + Kontingent + Score-Gründe) → SV + Slot wählen → Zuweisung schreiben. Der Dispatcher sieht die Kandidaten **räumlich** und weist den sichtbar-besten zu.

## Leitprinzip: Kanonik wiederverwenden, nur die räumliche UX ist neu

Die komplette Dispatch-Matching- und Reservierungs-Logik existiert bereits und ist erprobt (Nutzung heute in `SvDispatchPanel` auf `/dispatch/leads/[id]`). **Dieses Feature baut KEINE Matching- oder Schreib-Logik neu** — es bringt die bestehende auf die Karte.

Wiederverwendet (unverändert):
- `getSvSuggestionsWithSlots(leadId)` → Top-3 SV-Kandidaten + freie Slots. Quelle der Drawer-Daten.
- `findBestSV(input)` (indirekt via oben) → liefert je Kandidat: `svId`, `name`, `paket`, `distanzKm`, `etaFromBueroMin`, `offeneFaelle`, `kontingentFrei`, `score`, `reasons`, `verfuegbarAmWunschtermin`.
- `reserveSvTerminForLead(leadId, svId, startIso, durationMin?)` → **der Assign-WRITE**: storniert alte reservierte Termine, Reachability-Hard-Check (Mapbox), Insert `gutachter_termine` (`assignee_id`, `status='reserviert'`), Fire-and-forget SV-Benachrichtigung. Rückgabe `{ success, terminId?, error? }`. Ruft `revalidatePath('/dispatch/leads/${leadId}')`.
- ETA je Kandidat kommt aus `findBestSV.etaFromBueroMin` (server-seitig vorberechnet, via `getSvSuggestionsWithSlots`) — **kein Client-Mapbox-Call nötig**. Die echte Fahrweg-Geometrie via `fetchDrivingRoute` ist V2; V1 zeigt eine gerade Verbindungslinie Kandidat→Lead.

## Architektur / Datenfluss

1. Dispatch/Admin klickt einen **offenen** Lead-Pin → das bestehende `LeadPopup` zeigt (nur für `role ∈ {dispatch, admin}`) einen neuen Button **„SV zuweisen"**.
2. Button öffnet `AssignFromMapDrawer` mit `{ leadId, leadLat, leadLng, leadLabel }`.
3. Drawer ruft beim Öffnen `getSvSuggestionsWithSlots(leadId)` → Ladezustand → Top-3 Kandidaten + Slots.
4. Solange der Drawer offen ist, **hebt die Karte die Kandidaten-SV-Pins hervor** (Halo-Layer) und zeichnet bei Auswahl/Hover eines Kandidaten eine **gerade Verbindungslinie** von dessen `standort_lat/lng` zum Lead (räumlicher Bezug; echte Fahrweg-Route = V2). Die ETA-Zahl (`etaFromBueroMin`) steht im Drawer je Kandidat.
5. Dispatcher wählt Kandidat + Slot → **Bestätigen** („Zuweisen") → `reserveSvTerminForLead(leadId, svId, slotStartIso)`.
6. `result.success` → Toast „SV zugewiesen, Termin reserviert" + Drawer schließen + `router.refresh()` (Lead ist jetzt zugewiesen). `!success` → Toast mit `result.error` (z.B. Reachability-Ablehnung).

## Dateien

**Neu:**
- `src/components/live-ops/AssignFromMapDrawer.tsx` — Client-Drawer. Lädt `getSvSuggestionsWithSlots`, rendert Kandidaten-Karten (Name, Paket-Badge, `distanzKm`, `etaFromBueroMin` als „~X Min", `offeneFaelle`/`kontingentFrei`, `reasons`, Verfügbarkeits-Hinweis) + Slot-Buttons. Callback `onHighlightCandidates(svIds)` + `onPreviewRoute(svId|null)` an die Karte; `onAssigned()` nach Erfolg. Baut auf `primitives/*` + `shared/*` (Drawer/Card/Button/Badge), keine handgerollten Atoms.

**Geändert:**
- `src/components/live-ops/LiveOpsMap.tsx` — (a) Lead-Klick öffnet für dispatch/admin den Assign-Pfad; (b) neuer State `assignLeadId`/`candidateSvIds`/`previewRouteSvId`; (c) Halo-Layer für Kandidaten (aus neuem geo-Builder); (d) Verbindungslinien-Layer (Kandidat→Lead, gerade Linie, client-seitig aus 2 Punkten); sauberes Teardown der neuen Layer + Sources.
- `src/components/live-ops/LeadPopup.tsx` — „SV zuweisen"-Button (nur dispatch/admin, nur wenn Lead unzugewiesen) neben dem bestehenden Detail-Link.
- `src/components/live-ops/geo.ts` — neuer reiner Builder `candidateHaloFC(svs, candidateIds)` → GeoJSON der hervorzuhebenden SV-Punkte (analog zu den bestehenden `*FC`-Buildern, `[lng,lat]`, `properties.__id`).
- `src/lib/live-ops/get-leads.ts` + `src/lib/live-ops/types.ts` — `LeadPin` um `hasActiveTermin: boolean` erweitern (damit nur unzugewiesene Leads den Assign-Button zeigen). Aus `gutachter_termine` (aktiver reserviert/bestätigt-Termin je Lead) ableiten.

## Scope-Entscheidungen & Defaults

- **Nur unzugewiesene Leads** sind assignbar (kein aktiver `reserviert`/`gegenvorschlag`/`bestätigt`-Termin). Zugewiesene Leads: Popup zeigt nur den Detail-Link (Reassign = V2).
- **Nur `role ∈ {dispatch, admin}`** sehen den Assign-Einstieg. KB nie (KB dispatcht nicht).
- **`arbeitszeiten`: Verhalten wie heute.** Der bestehende Slot-Picker (`getNextFreeSlotsForSv`) wertet `sachverstaendige.arbeitszeiten`/`blockierte_wochentage` NICHT aus (prüft nur Termin-Konflikte + Reachability) — dieses Feature übernimmt exakt dieses Verhalten (Konsistenz mit dem heutigen Panel). Das Schließen der Lücke ist ein separater Follow-up, kein Teil von V1.
- **Bestätigungs-Schritt Pflicht:** `reserveSvTerminForLead` löst SV-Benachrichtigungen (WhatsApp/Mitteilung) aus → Zuweisung nur per expliziten „Zuweisen"-Button, kein Ein-Klick-Versehen.
- **SV-Position für Highlight/Route = `standort_lat/lng`** (nicht Live-Position), weil die Matching-Kanonik (`findBestSV`) auf dem Büro-Standort rankt — Konsistenz zwischen Score und Darstellung.

## Fehlerbehandlung

- `getSvSuggestionsWithSlots`-Fehler → Drawer zeigt Fehlerzustand („Keine Vorschläge ladbar") + Retry.
- `reserveSvTerminForLead` liefert `{ success, error? }` (kein throw) → `!success` → Toast `error ?? 'Zuweisung fehlgeschlagen'`. Der interne Reachability-Hard-Check kann einen Slot ablehnen → dessen Fehlermeldung wird 1:1 durchgereicht.
- Kein `try/catch` um die Server-Action im Client (Result-Object-Pattern), nur Result-Check.

## Test-Strategie (TDD)

- **Rein/TDD:** `candidateHaloFC(svs, candidateIds)` in `geo.test.ts` (Punkte gefiltert auf candidateIds, korrektes `[lng,lat]` + `__id`).
- **Rein/TDD:** falls der Drawer einen Transform der `getSvSuggestionsWithSlots`-Ausgabe in ein View-Model macht (z.B. Sortierung/Label-Formatierung) → als reine Funktion extrahieren + testen. Sonst entfällt.
- **`hasActiveTermin`-Ableitung** in `get-leads.ts` → falls als reiner Helper formuliert, Unit-Test.
- **Nicht neu getestet:** `getSvSuggestionsWithSlots`, `reserveSvTerminForLead`, `findBestSV` — bestehend + über den heutigen `SvDispatchPanel`-Pfad abgedeckt.
- **Integration:** Post-Deploy-Smoke auf Prod (dispatch-Login → Karte → offener Lead → Zuweisen → `gutachter_termine`-Insert per DB-READ verifizieren, Test-Lead).

## Nicht-Ziele (V1) → V2-Kandidaten

- Abdeckungslücken-Overlay (Leads ohne erreichbaren SV im Umkreis).
- ETA-Badges an allen Termin-Pins / Unterwegs-Autos (nur die Kandidaten-ETA im Drawer ist V1).
- Reassign bereits zugewiesener Leads aus der Karte.
- Echte Fahrweg-Geometrie (`fetchDrivingRoute` via Server-Action) für die Kandidaten-Vorschau statt gerader Linie.
- `arbeitszeiten`-Durchsetzung im Slot-Picker (bestehende, feature-übergreifende Lücke).
- Wiederverwendung/Extraktion der `SvDispatchPanel`-UI (V1 baut einen schlanken eigenen Drawer auf denselben Actions; eine spätere Konsolidierung ist Follow-up).

## Offene Implementierungs-Frage (für die Plan-Phase)

Ob der Drawer die Slot-/Kandidaten-Darstellung von `SvDispatchPanel` als extrahierte Sub-Komponente teilt oder schlank neu aufbaut — im Plan entscheiden, sobald geprüft ist, wie stark `SvDispatchPanel` an die Lead-Detailseite gekoppelt ist. Default: schlank neu (entkoppelt), Konsolidierung später.
