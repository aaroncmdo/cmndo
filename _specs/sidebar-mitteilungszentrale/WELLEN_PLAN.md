# WELLEN_PLAN — Sidebar-Refactoring + Mitteilungszentrale

## Welle 0: Kontext laden (KEIN Code)

```
Lies folgende Dateien und verstehe die Architektur:

1. _specs/sidebar-mitteilungszentrale/CONTEXT.md — komplett lesen
2. _specs/sidebar-mitteilungszentrale/CONTRACT.md — komplett lesen
3. src/app/gutachter/GutachterShell.tsx — aktuelle Sidebar-Struktur verstehen
4. src/app/admin/_components/NotificationBell.tsx — aktuelle Glocke verstehen
5. src/app/gutachter/layout.tsx — wie Shell Props bekommt

Bestätige dass du verstanden hast:
- Die Sidebar hat aktuell 18 flache Nav-Items
- Sie soll auf 10 Items in 4 Gruppen reduziert werden
- Die Glocke wird zur Mitteilungszentrale mit 3 Tabs (Updates, Tasks, Nachrichten)
- Verpasste Anrufe kommen in Updates-Tab
- Jedes Item muss zum relevanten Kontext routen
- Mitteilungen sind rollenbasiert (Admin, SV, Kanzlei)

KEIN Code schreiben. Nur bestätigen.
```

---

## Welle 1: Sidebar-Restructure (F-01)

```
Referenz: CONTRACT.md F-01

Aufgabe: GutachterShell.tsx Sidebar von 18 flachen Items auf 10 Items in 4 Gruppen umbauen.

A) NAV_ITEMS_BASE und den dynamischen NAV_ITEMS-Block ersetzen durch NAV_SECTIONS:

const NAV_SECTIONS = [
  {
    label: 'TAGESGESCHÄFT',
    items: [
      { href: '/gutachter/heute', label: 'Heute', icon: MapPinIcon },
      { href: '/gutachter/auftraege', label: 'Aufträge', icon: ClipboardListIcon },
      { href: '/gutachter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
      { href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon },
    ]
  },
  {
    label: 'KOMMUNIKATION',
    items: [
      { href: '/gutachter/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
    ]
  },
  {
    label: 'FINANZEN',
    items: [
      { href: '/gutachter/abrechnung', label: 'Abrechnung', icon: ReceiptIcon },
      { href: '/gutachter/leadpreise', label: 'Lead-Preise', icon: EuroIcon },
    ]
  },
  {
    label: 'VERWALTUNG',
    collapsible: true,
    items: [
      { href: '/gutachter/gebiet', label: 'Mein Gebiet', icon: MapIcon },
      { href: '/gutachter/vertrag', label: 'Vertrag', icon: FileSignatureIcon },
      { href: '/gutachter/statistiken', label: 'Statistiken', icon: BarChart3Icon },
      { href: '/gutachter/reklamationen', label: 'Reklamationen', icon: AlertCircleIcon },
    ]
  }
]

B) Sidebar-Rendering anpassen: Section-Headers dezent rendern
   Style: text-[10px] uppercase tracking-wider text-[#7BA3CC]/50 px-3 pt-4 pb-1
   VERWALTUNG: collapsible mit useState, default collapsed, Chevron-Icon

C) showTeam + showCommunity Items conditional in VERWALTUNG einfügen

D) WICHTIG: Die alten Routen (Dashboard, Mitteilungen, Termine, Route, Tasks, Stellungnahmen) NICHT löschen. Nur aus der Sidebar entfernen. Die Seiten bleiben erreichbar.

E) NotificationBell: Icon auf weiß + ausgefüllt ändern (nicht grau outline). Import bleibt gleich.

Tests:
- Sidebar zeigt 4 Gruppen mit Section-Headers
- VERWALTUNG ist collapsed, Klick expandiert
- Alle 10 Items navigieren korrekt
- Alte URLs (/gutachter/mitteilungen etc.) geben kein 404
- Mobile Sidebar funktioniert
- Build grün (tsc --noEmit)

Wenn fertig: git add -A && git commit -m "refactor(AAR-222): Sidebar von 18 auf 10 Items in 4 Gruppen" && git push

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 2: DB-Migration + Mitteilungen-Tabelle (F-07)

```
Referenz: CONTRACT.md F-07, CONTEXT.md Abschnitt 2

Aufgabe: Mitteilungen-Tabelle erstellen + Server-Helper + Types.

A) Supabase Migration erstellen und applyen:
   Tabelle `mitteilungen` wie in CONTEXT.md Abschnitt 2 definiert.
   RLS Policies: SELECT/UPDATE nur eigene (auth.uid()), INSERT open (via Service Role).
   Realtime enablen: ALTER PUBLICATION supabase_realtime ADD TABLE mitteilungen;

B) TypeScript Types erstellen in src/lib/mitteilungen/types.ts:
   - MitteilungKategorie = 'update' | 'task' | 'nachricht' | 'anruf'
   - MitteilungPrioritaet = 'normal' | 'hoch' | 'dringend'
   - KontextTyp = 'fall' | 'lead' | 'auftrag' | 'termin' | 'abrechnung' | 'nachricht'
   - Mitteilung Interface (alle DB-Felder)
   - CreateMitteilungInput Interface

C) Server-Helper erstellen in src/lib/mitteilungen/create-mitteilung.ts:
   - createMitteilung(input: CreateMitteilungInput): Promise<Mitteilung>
   - Nutzt Supabase Service Client (createClient aus @supabase/supabase-js mit SERVICE_ROLE_KEY)
   - Auto-generiert route_url wenn nicht übergeben (CONTRACT.md F-08 Routing-Matrix)
   - Auto-setzt icon wenn nicht übergeben (basierend auf kategorie + kontextTyp)

D) Seed-Daten aus TESTDATA.json einfügen (nur für Test, per SQL)

Tests:
- DB: SELECT * FROM mitteilungen zeigt Seed-Daten
- RLS: Als SV eingeloggt sieht nur eigene Mitteilungen
- createMitteilung: Manuell per Script testen
- Build grün

Wenn fertig: git add -A && git commit -m "feat(AAR-225): Mitteilungen DB-Tabelle + Server-Helper + Types" && git push

WICHTIG: Bestehende gutachter_mitteilungen Tabelle NICHT löschen oder ändern. Die neue Tabelle ist additiv.

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 3: MitteilungszentralePanel UI (F-02 bis F-06)

```
Referenz: CONTRACT.md F-02, F-03, F-04, F-05, F-06

Aufgabe: Mitteilungszentrale als Panel-Komponente mit 3 Tabs bauen.

A) useMitteilungen Hook (src/components/mitteilungszentrale/useMitteilungen.ts):
   - CONTRACT.md F-03 komplett umsetzen
   - Initialer Fetch + Counts + Realtime-Subscription
   - markAsRead(id), markAllAsRead()
   - Supabase Client (NICHT Service Client — User-Kontext!)

B) MitteilungItem (src/components/mitteilungszentrale/MitteilungItem.tsx):
   - Compact List-Item: Icon links, Titel+Inhalt Mitte, Zeitstempel rechts
   - Ungelesen: font-semibold + blauer Dot (w-2 h-2 rounded-full bg-blue-500)
   - Relativer Zeitstempel (date-fns formatDistanceToNow oder manuell)
   - onClick: router.push(route_url) + markAsRead

C) UpdatesTab (CONTRACT.md F-04):
   - Gruppierung: Heute/Gestern/Älter
   - Verpasste Anrufe: PhoneMissed Icon + "Zurückrufen" Button

D) TasksTab (CONTRACT.md F-05):
   - Überfällige: rote Border links + roter Badge
   - Sortierung: dringend zuerst

E) NachrichtenTab (CONTRACT.md F-06):
   - Gruppiert nach Absender
   - Preview der letzten Nachricht

F) MitteilungszentralePanel (src/components/mitteilungszentrale/MitteilungszentralePanel.tsx):
   - shadcn Sheet von rechts, w-full sm:w-[420px] sm:max-w-none
   - Header: "Mitteilungen" + "Alle gelesen" Button (CheckCheck Icon)
   - 3 Tabs (shadcn Tabs): Updates | Tasks | Nachrichten
   - Pro Tab: Badge-Counter
   - Glocke: Badge mit Gesamtzahl (nur wenn > 0)

G) Integration in GutachterShell:
   - NotificationBell ersetzen durch MitteilungszentralePanel-Trigger
   - Glocke weiß + ausgefüllt (Bell Icon, fill="currentColor")

H) Integration in AdminShell (src/app/admin/AdminShell.tsx oder equivalent):
   - Gleiche MitteilungszentralePanel-Komponente
   - Andere empfaenger_rolle ('admin')

Tests:
- Glocke zeigt Badge "4" (Seed-Daten: 3 ungelesene SV + 1 admin)
- Klick öffnet Panel mit 3 Tabs
- Updates-Tab zeigt 2 Items (1 gelesen, 1 ungelesen)
- Tasks-Tab zeigt 1 Item (hoch Priorität)
- Nachrichten-Tab zeigt 1 Item
- "Alle gelesen" → Badge verschwindet
- Klick auf Item → Navigation + markiert als gelesen
- Realtime: neuen Seed-Eintrag per SQL INSERT → erscheint sofort
- Build grün

Wenn fertig: git add -A && git commit -m "feat(AAR-225): MitteilungszentralePanel mit 3 Tabs + Realtime" && git push

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 4: createMitteilung Integration an allen Triggerpunkten (F-09)

```
Referenz: CONTRACT.md F-09 — komplette Tabelle

Aufgabe: An ALLEN Status-Änderungen im System createMitteilung aufrufen.

WICHTIG: Lies CONTRACT.md F-09 Tabelle komplett. Dort steht jeder Trigger mit Empfänger, Kategorie und Titel.

Dateien die geändert werden (NUR diese):
1. src/app/api/sv-zuweisung/route.ts — nach erfolgreicher Zuweisung
2. src/app/gutachter/auftrag/[id]/actions.ts — acceptAuftrag, declineAuftrag, gegenvorschlag
3. src/app/api/stripe/webhook/route.ts — nach Zahlung
4. src/app/dispatch/leads/[id]/actions/ — nach FlowLink-Öffnung, SA-Unterschrift
5. src/app/api/webhooks/aircall/route.ts — verpasste Anrufe (wenn vorhanden, sonst erstellen)
6. src/lib/tasks/create-task.ts — wenn Tasks erstellt werden

Pro Trigger:
1. Import createMitteilung
2. Nach dem bestehenden DB-Update: await createMitteilung({...})
3. Empfänger-ID aus dem jeweiligen Kontext (SV profile_id, Admin profile_id, etc.)
4. FEHLER bei createMitteilung dürfen den Hauptprozess NICHT blockieren — try/catch + console.error

Tests:
- SV-Zuweisung API aufrufen → SV bekommt Mitteilung (in Panel sichtbar)
- Auftrag akzeptieren → Admin bekommt Mitteilung
- Für jeden Trigger aus der Tabelle prüfen
- Hauptprozesse funktionieren weiter auch wenn createMitteilung fehlschlägt
- Build grün

Wenn fertig: git add -A && git commit -m "feat(AAR-225): createMitteilung an allen Triggerpunkten integriert" && git push

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 5: Seiten-Merges + Polish (F-10, F-11, F-12)

```
Referenz: CONTRACT.md F-10, F-11, F-12

Aufgabe: Die merged Seiten anpassen + UI Polish.

A) Heute-Seite erweitern (F-10):
   - Dashboard-KPIs oben: Offene Fälle, Heutige Termine, Monatsumsatz, Kontingent-Rest
   - Bestehende Tagesansicht darunter
   - Tagesroute-Karte (von /gutachter/route übernehmen oder importieren)

B) Meine Fälle: 3 Tabs (F-11):
   - Tab-Bar mit shadcn Tabs: Fälle | Stellungnahmen | Tasks
   - Fälle-Tab: bestehende Liste (NICHT ändern, nur wrappen)
   - Stellungnahmen-Tab: Fälle filtern die Stellungnahme brauchen
   - Tasks-Tab: Alle offenen Tasks des SVs

C) Kalender + Termine merge (F-12):
   - Toggle-Button oben rechts: "Kalender" ↔ "Liste"
   - Kalender: bestehende Kalender-Ansicht
   - Liste: chronologische Termine mit Status-Filter

D) Polish:
   - Notification-Bell Icon: weiß + ausgefüllt (AAR-212 Final-Fix)
   - CSS Transition auf allen brand-Elementen: transition-colors duration-[1500ms] ease-in-out
   - Logo Alt-Text: SV-Firmenname statt "Claimondo Logo"

Tests:
- Heute zeigt KPIs + Tageskalender + Route
- Meine Fälle hat 3 funktionierende Tabs
- Kalender hat Listen-Toggle
- Glocke ist weiß + ausgefüllt
- Sidebar hat 10 Items in 4 Gruppen
- E2E: Lead anlegen → SV zuweisen → SV sieht Mitteilung in Glocke → Klick → Auftrag-Seite
- Build grün

Wenn fertig: git add -A && git commit -m "feat(AAR-222+225): Seiten-Merges + Polish + E2E-ready" && git push

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Notfall-Prompts

### Wenn der Hund zu viel ändert:
```
STOPP. Du hast Dateien geändert die nicht in CONTEXT.md Abschnitt 1 stehen.
Mach alle Änderungen rückgängig außer den erlaubten Dateien.
```

### Wenn die Sidebar kaputt ist:
```
Die Sidebar rendert nicht. Zeig mir die letzten 3 Änderungen in GutachterShell.tsx.
Mach die letzte rückgängig und teste erneut.
```

### Wenn Realtime nicht funktioniert:
```
Prüfe: 
1. ALTER PUBLICATION supabase_realtime ADD TABLE mitteilungen; — wurde das ausgeführt?
2. RLS Policies — SELECT Policy für authenticated vorhanden?
3. Channel-Name unique? Kein Konflikt mit bestehenden Channels?
```

### Wenn Mitteilungen nicht erscheinen:
```
Prüfe:
1. empfaenger_id stimmt mit dem eingeloggten User überein?
2. RLS Policy greift? SELECT als User testen.
3. createMitteilung nutzt Service Client, nicht User Client?
```
