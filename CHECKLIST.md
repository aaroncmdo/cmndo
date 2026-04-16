# CHECKLIST — Sidebar + Mitteilungszentrale

## Welle 1: Sidebar-Restructure
- [ ] Sidebar zeigt 4 Gruppen mit Section-Headers
- [ ] Section-Headers: dezent, uppercase, 10px, text-[#7BA3CC]/50
- [ ] TAGESGESCHÄFT: Heute, Aufträge, Meine Fälle, Kalender
- [ ] KOMMUNIKATION: Nachrichten
- [ ] FINANZEN: Abrechnung, Lead-Preise
- [ ] VERWALTUNG: collapsible, default collapsed
- [ ] VERWALTUNG enthält: Mein Gebiet, Vertrag, Statistiken, Reklamationen
- [ ] Team + Community conditional in VERWALTUNG
- [ ] Alte Nav-Items entfernt: Dashboard, Mitteilungen, Stellungnahmen, Termine, Route, Tasks
- [ ] Alle entfernten Routen sind noch direkt erreichbar (kein 404)
- [ ] Active-State funktioniert korrekt für alle Items
- [ ] Mobile: Sidebar öffnet/schließt korrekt
- [ ] Build grün (tsc --noEmit)

## Welle 2: DB-Migration + mitteilungen Tabelle
- [ ] Migration erstellt und applied
- [ ] Tabelle `mitteilungen` existiert mit allen Spalten
- [ ] RLS Policies: SELECT/UPDATE nur eigene, INSERT via Service Role
- [ ] Index auf (empfaenger_id, gelesen, created_at DESC)
- [ ] Index auf (empfaenger_id, kategorie, gelesen)
- [ ] Realtime enabled auf mitteilungen
- [ ] Seed-Daten aus TESTDATA.json eingefügt
- [ ] Query: SV sieht nur seine Mitteilungen ✓
- [ ] Query: Admin sieht nur seine Mitteilungen ✓

## Welle 3: MitteilungszentralePanel + useMitteilungen Hook
- [ ] Glocke öffnet Sheet von rechts
- [ ] Panel zeigt 3 Tabs: Updates | Tasks | Nachrichten
- [ ] Badge auf Glocke zeigt Gesamtzahl ungelesener Items
- [ ] Badge pro Tab zeigt Tab-spezifische Anzahl
- [ ] Items laden korrekt aus DB
- [ ] Ungelesene Items: font-semibold + blauer Dot links
- [ ] Gelesene Items: normal font, kein Dot
- [ ] "Alle gelesen" Button markiert alle als gelesen
- [ ] Klick auf Item: navigiert zu route_url
- [ ] Klick auf Item: markiert als gelesen
- [ ] Relativer Zeitstempel: "vor 5 Min", "gestern", etc.
- [ ] Gruppierung in UpdatesTab: Heute/Gestern/Älter
- [ ] Verpasste Anrufe: Telefon-Icon + "Zurückrufen" Button
- [ ] Realtime: neues Item erscheint sofort ohne Reload
- [ ] Realtime: Badge-Counter aktualisiert sich live
- [ ] Panel in GutachterShell integriert
- [ ] Panel in AdminShell integriert (gleiche Komponente!)

## Welle 4: createMitteilung Integration
- [ ] SV-Zuweisung → Mitteilung an SV
- [ ] SV akzeptiert → Mitteilung an Admin
- [ ] SV lehnt ab → Mitteilung an Admin
- [ ] Kunde öffnet FlowLink → Mitteilung an Admin + SV
- [ ] Kunde unterschreibt SA → Mitteilung an Admin + SV
- [ ] Vollmacht → Mitteilung an Kanzlei
- [ ] Gutachten fertig → Mitteilung an Admin + Kanzlei
- [ ] Verpasster Anruf (AirCall Webhook) → Mitteilung an Admin/KB
- [ ] Task erstellt → Mitteilung an Betroffenen
- [ ] Abrechnung erstellt → Mitteilung an SV
- [ ] Jede Mitteilung hat korrekten route_url
- [ ] Jede Mitteilung hat passendes Icon

## Welle 5: Seiten-Merges + Polish
- [ ] Heute-Seite: Dashboard-KPIs integriert
- [ ] Heute-Seite: Tagesroute integriert
- [ ] Meine Fälle: 3 Tabs (Fälle | Stellungnahmen | Tasks)
- [ ] Kalender: Listen-Toggle
- [ ] Notification-Bell: weiß + ausgefüllt auf Navy (AAR-212)
- [ ] CSS Transition: all 1.5s ease auf brand-abhängigen Elementen (AAR-220 Vorbereitung)
- [ ] Build grün
- [ ] E2E: Lead anlegen → SV-Zuweisung → SV sieht Mitteilung → Klick → Auftrag
