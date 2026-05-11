# Terminierungs-Flow mit echten Live-Slots

**Stand:** 2026-05-11
**Status:** Aufgeschoben (bewusst). Aktueller Ansatz reicht für „schnellster Weg ans Ziel".
**Spec-Mock:** `docs/Pages/terminierung-flow.html`

## Aktueller Stand

Der `/gutachter-finden` Funnel nutzt jetzt den `DynamicWizard` aus `onboarding_phasen` + `onboarding_felder` und konvertiert die Anfrage am Ende automatisch in einen Lead/Fall via `finalizeGutachterFinderAnfrage()` → `konvertiereAnfrageZuFall()` (PR #750).

**Flow heute:**
1. Kunde durchläuft Wizard auf `/gutachter-finden`
2. Anfrage landet in `gutachter_finder_anfragen`
3. `konvertiereAnfrageZuFall()` legt Lead + Fall + Kunden-Account an, Magic-Link geht raus
4. Kunde landet nach Magic-Link-Klick in `/kunde/faelle/{id}`
5. **Dispatch sieht den Lead in der Inbox** → weist SV zu → setzt Termin manuell wie gewohnt

Das ist der schnellste Weg von Anfrage zu Termin, weil der bestehende Dispatcher-Workflow + die `gutachter_termine`-State-Machine (AAR-864/865) ohne neue Code-Pfade wiederverwendet werden.

## Was der Spec-Mock zusätzlich wollte

`docs/Pages/terminierung-flow.html` zeigt eine **5-Schritt-Buchungsstrecke mit echtem Kalender-Slot-Picker**:

- **Schritt 1:** Schaden (Schuldfrage, Fahrbereit-Toggle, Kurzbeschreibung)
- **Schritt 2:** Fahrzeug (Kennzeichen, Baujahr, Hersteller/Modell)
- **Schritt 3:** Termin — **Day-Strip + Time-Grid mit Live-Verfügbarkeit aus dem Gutachter-Kalender**
- **Schritt 4:** Kontakt (Vor-/Nachname, Telefon, Email, bevorzugter Kanal)
- **Schritt 5:** Summary mit „Ändern"-Buttons pro Block + DSGVO-Checkbox + „Termin verbindlich buchen"

Zusätzlich Sidebar mit `sv-card` (Avatar, Rating, Distanz, frühster Termin) während des ganzen Flows + Live-Hint „alle 30 Sek. mit Gutachter-Kalender abgeglichen".

## Warum aufgeschoben

- Die Live-Slot-Anzeige braucht echte Verfügbarkeits-Logik: entweder direkt aus `gutachter_termine` + Google-Calendar-Sync (siehe `project_google_oauth_konsolidiert` Memory) oder neue `sv_verfuegbarkeiten`-Tabelle
- SV-Auswahl muss **vor** Schritt 3 passieren — `svMatching` läuft jetzt erst nach Phase mit `slot`-Feld (Geolocation-Trigger). Das müsste umgebaut werden, damit ein konkreter SV bereits in Schritt 1-2 gepickt ist und seine echten Slots in Schritt 3 angezeigt werden.
- DynamicWizard ist DB-getrieben (`onboarding_phasen`) — der Spec-Mock ist hard-coded. Ein Slot-Field-Typ existiert (`SlotField.tsx`), zeigt aber Demo-Slots, nicht echte Kalender-Daten.
- Die heutige Lösung „Wizard + Dispatch-Manual-Terminierung" funktioniert für 100% der Fälle und hat keinen Build-/Maintenance-Aufwand.

## Was nötig wäre, falls später gewünscht

### Backend
- [ ] SV-Pre-Matching auf Phase 1 vorziehen (z.B. via PLZ-Eingabe statt Geolocation) — sonst gibt es keinen SV-spezifischen Kalender zum Anzeigen
- [ ] Neuer Server-Action: `ladeFreieSlotsFuerSv(svId: string, von: Date, bis: Date)` — aggregiert aus `gutachter_termine` (busy) + Google Calendar (busy) + SV-Default-Verfügbarkeiten
- [ ] Slot-Reservierung mit Soft-Lock: Wenn Kunde auf „Slot reservieren" klickt, sollte der Slot 15 Min reserviert sein bis er bestätigt — sonst Race-Condition
- [ ] `gutachter_termine` Insert direkt aus dem Wizard (nicht über Dispatch) — braucht aber `fall_id`, der erst durch `konvertiereAnfrageZuFall` entsteht. Reihenfolge: Anfrage → Fall → Termin im selben Atomic-Block

### Frontend
- [ ] Neuer Field-Typ `live-slot` in `OnboardingFeld['typ']` mit `svId`-Bindung
- [ ] Sidebar-Komponente `SvSidebarCard` aus dem Spec-Mock (Avatar, Rating, Distanz, Sprachen, Live-Status)
- [ ] Summary-Phase als eigener Field-Typ `summary` mit Edit-Sprünge zu vorherigen Phasen
- [ ] DSGVO-Checkbox als Pflichtfeld vor Submit

### DB-Migration
- [ ] Neue `onboarding_phasen`-Zeilen für `flow_key='gutachter-finden-live-slots'` (eigener Flow, damit der heutige Flow als Fallback bleibt)
- [ ] Soft-Lock-Spalte auf `gutachter_termine`: `reserviert_bis TIMESTAMPTZ` + Cron der abgelaufene Reservierungen löscht

### State-Machine
- [ ] `transitionFallStatus`: neuer Status `sv-termin-vom-kunden-gewaehlt` zwischen `sv-zugewiesen` und `sv-termin` damit Dispatch sieht: „Termin direkt vom Kunden gebucht, nicht von uns gesetzt"

## Aufwandsschätzung

- **3-5 Tage** für vollständige Umsetzung mit Soft-Lock + Sidebar + echte Slots
- **Voraussetzung:** Google-Calendar-Sync für alle aktiven SVs läuft sauber (aktuell optional pro SV — siehe `project_google_oauth_mitarbeiter` Memory)

## Trigger für Aktivierung

Diesen Plan reaktivieren wenn:

- Dispatch-Team mehr als ~30 Termin-Settings pro Tag manuell macht (manuelle Arbeit wird zum Bottleneck)
- Kunden in Conversion-Funnel-Analyse abspringen weil sie „Termin sofort" wollen statt „Anruf in 15 Min"
- Google-Calendar-Sync für ≥80% der SVs aktiviert ist (sonst sind die angezeigten Slots nicht zuverlässig)
