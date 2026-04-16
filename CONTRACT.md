# CONTRACT — Sidebar-Refactoring + Mitteilungszentrale

## F-01: Sidebar restructurieren (GutachterShell)

**INPUT:** NAV_SECTIONS Array mit 4 Gruppen (Tagesgeschäft, Kommunikation, Finanzen, Verwaltung)
**AKTION:**
1. NAV_ITEMS_BASE ersetzen durch NAV_SECTIONS (gruppiert)
2. Section-Headers rendern: `text-[10px] uppercase tracking-wider text-[#7BA3CC]/50 px-3 pt-4 pb-1`
3. VERWALTUNG-Section: collapsible mit Chevron-Toggle, default collapsed
4. Badge-Counters auf Aufträge + Nachrichten (live aus DB)
5. Conditional Items (Team, Community) in VERWALTUNG
6. Alte Nav-Items entfernen: Dashboard, Mitteilungen, Stellungnahmen, Termine, Route, Tasks
**ERGEBNIS:** Sidebar zeigt 10 Items in 4 Gruppen statt 18 flache Items

## F-02: NotificationBell → MitteilungszentralePanel

**INPUT:** Klick auf Glocke
**AKTION:**
1. Sheet (shadcn) von rechts öffnen, max-w-md
2. Header: "Mitteilungen" + "Alle gelesen" Button
3. 3 Tabs rendern: Updates | Tasks | Nachrichten
4. Pro Tab: Badge mit Anzahl ungelesener Items
5. Gesamt-Badge auf der Glocke (Summe aller ungelesenen)
**ERGEBNIS:** Panel mit 3 Tabs, live Badge-Counter, responsive

## F-03: useMitteilungen Hook

**INPUT:** empfaengerId, kategorie (optional)
**AKTION:**
1. Initialer Fetch: `SELECT * FROM mitteilungen WHERE empfaenger_id = $1 ORDER BY created_at DESC LIMIT 50`
2. Optional Filter: `AND kategorie = $2`
3. Ungelesen-Count: `SELECT kategorie, COUNT(*) FROM mitteilungen WHERE empfaenger_id = $1 AND gelesen = false GROUP BY kategorie`
4. Supabase Realtime: `postgres_changes` auf `mitteilungen` Table, Filter `empfaenger_id=eq.{id}`
5. Bei INSERT Event: Item vorne in Liste einfügen, Badge-Counter incrementieren
6. Bei UPDATE Event (gelesen): Badge-Counter decrementieren
**ERGEBNIS:** `{ items, counts: { update, task, nachricht, anruf }, markAsRead, markAllAsRead, loading }`

## F-04: UpdatesTab

**INPUT:** Mitteilungen mit kategorie IN ('update', 'anruf')
**AKTION:**
1. Sortiert nach created_at DESC
2. Gruppiert: "Heute", "Gestern", "Älter"
3. Pro Item: Icon + Titel + Inhalt-Preview (max 80 Zeichen) + relativer Zeitstempel
4. Ungelesen: font-semibold + blauer Dot links
5. Verpasste Anrufe (kategorie='anruf'): Telefon-Icon + "Zurückrufen" Quick-Action Button
6. Klick auf Item: `router.push(item.route_url)` + `markAsRead(item.id)`
**ERGEBNIS:** Chronologische Liste aller Updates + verpassten Anrufe mit Click-Through

## F-05: TasksTab

**INPUT:** Mitteilungen mit kategorie = 'task'
**AKTION:**
1. Sortiert: überfällige zuerst (prioritaet='dringend'), dann nach created_at
2. Überfällige: rote linke Border + roter Badge
3. Quick-Actions: je nach kontext_typ verschiedene Buttons (z.B. "Gutachten öffnen", "Fall prüfen")
4. Klick auf Item: `router.push(item.route_url)`
**ERGEBNIS:** Task-Liste mit Priorisierung und Quick-Actions

## F-06: NachrichtenTab

**INPUT:** Mitteilungen mit kategorie = 'nachricht'
**AKTION:**
1. Gruppiert nach Absender (absender_id)
2. Pro Absender: Name + letzte Nachricht-Preview + Zeitstempel + Ungelesen-Count
3. Klick: `router.push(item.route_url)` → Nachrichten-Ansicht
**ERGEBNIS:** Chat-artige Nachrichten-Übersicht

## F-07: createMitteilung (Server-Helper)

**INPUT:** `{ empfaengerId, empfaengerRolle, kategorie, titel, inhalt?, kontextTyp?, kontextId?, routeUrl?, absenderId?, absenderName?, icon?, prioritaet? }`
**AKTION:**
1. Supabase Service Client INSERT in `mitteilungen`
2. route_url auto-generieren wenn nicht übergeben (basierend auf kontextTyp + kontextId + empfaengerRolle)
3. icon auto-setzen wenn nicht übergeben (basierend auf kategorie + kontextTyp)
**ERGEBNIS:** Neue Mitteilung in DB, Realtime-Event feuert, Empfänger sieht sofort

## F-08: route_url Auto-Generation

**INPUT:** kontextTyp, kontextId, empfaengerRolle
**AKTION:**
```
Routing-Matrix:
- fall + sachverstaendiger → /gutachter/fall/{id}
- fall + admin → /admin/faelle/{id}
- fall + kanzlei → /kanzlei/fall/{id}
- lead + admin → /admin/dispatch/leads/{id}
- auftrag + sachverstaendiger → /gutachter/auftrag/{id}
- termin + sachverstaendiger → /gutachter/kalender
- abrechnung + sachverstaendiger → /gutachter/abrechnung
- nachricht + any → /{rolle}/nachrichten
```
**ERGEBNIS:** Korrekte URL für die jeweilige Rolle

## F-09: Mitteilungen bei Status-Änderungen erzeugen

**INPUT:** Jeder Status-Wechsel im System
**AKTION:** An folgenden Stellen `createMitteilung` aufrufen:

| Trigger | Empfänger | Kategorie | Titel |
|---|---|---|---|
| SV-Zuweisung (sv-zuweisung API) | SV | update | "Neuer Auftrag zugewiesen" |
| SV akzeptiert Auftrag | Admin | update | "SV hat Auftrag angenommen" |
| SV lehnt Auftrag ab | Admin | update | "SV hat Auftrag abgelehnt" |
| SV macht Gegenvorschlag | Admin | update | "SV schlägt anderen Termin vor" |
| Kunde öffnet FlowLink | Admin + SV | update | "Kunde hat FlowLink geöffnet" |
| Kunde unterschreibt SA | Admin + SV | update | "Schadensaufnahme unterschrieben" |
| Vollmacht eingegangen | Kanzlei | update | "Neue Vollmacht eingegangen" |
| Gutachten fertig | Admin + Kanzlei | update | "Gutachten fertiggestellt" |
| Verpasster Anruf (AirCall) | Admin/KB | anruf | "Verpasster Anruf: {nummer}" |
| Task erstellt | Betroffener | task | "{task_titel}" |
| Task überfällig | Betroffener | task | "Task überfällig: {titel}" |
| Neue Chat-Nachricht | Empfänger | nachricht | "{absender}: {preview}" |
| Abrechnung erstellt | SV | update | "Neue Abrechnung verfügbar" |
| Termin in 1h | SV | update | "Termin in 1 Stunde: {kunde}" |

**ERGEBNIS:** Alle relevanten Events erzeugen Mitteilungen

## F-10: "Heute"-Seite erweitern

**INPUT:** Bestehende Heute-Seite
**AKTION:**
1. Dashboard-KPIs oben: Offene Fälle, Heutige Termine, Monatsumsatz, Kontingent-Rest
2. Tageskalender: Heutige Termine mit Kunden-Info + Adresse
3. Tagesroute: Karte mit heutigen Termin-Orten + optimale Reihenfolge
4. Quick-Actions: "Nächsten Termin starten", "Route öffnen"
**ERGEBNIS:** Heute = Startseite mit allem was der SV für den Tag braucht

## F-11: "Meine Fälle" Tabs

**INPUT:** Bestehende Fälle-Seite
**AKTION:**
1. Tab-Bar oben: Fälle | Stellungnahmen | Tasks
2. Tab "Fälle": bestehende Fälle-Liste (unverändert)
3. Tab "Stellungnahmen": Filterte Ansicht der Fälle die Stellungnahme brauchen
4. Tab "Tasks": Alle offenen Tasks des SVs
**ERGEBNIS:** Ein Ort für alles fallbezogene

## F-12: Kalender + Termine merge

**INPUT:** Bestehende Kalender + Termine Seiten
**AKTION:**
1. Toggle oben: Kalender-Ansicht ↔ Listen-Ansicht
2. Kalender: Monats/Wochen-View (bestehend)
3. Liste: Chronologische Terminliste mit Status-Filter
**ERGEBNIS:** Ein Ort für alle Termine
