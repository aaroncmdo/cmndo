# CONTEXT — Sidebar-Refactoring + Mitteilungszentrale

## Feature-IDs
- AAR-222: Sidebar-Refactoring (18 → 10 Nav-Items)
- AAR-225: Mitteilungszentrale (Notification Center für alle Rollen)

## Tech-Stack
- Next.js 14+ App Router, TypeScript
- Supabase (Auth + DB + Realtime + Storage)
- Tailwind CSS, shadcn/ui
- Lucide Icons
- Vercel Deployment

## 1. Betroffene Dateien

### Ändern (VORSICHTIG)
| Datei | Größe | Was ändern |
|---|---|---|
| `src/app/gutachter/GutachterShell.tsx` | 13.5KB | Sidebar komplett restructurieren, NotificationBell → MitteilungszentralePanel |
| `src/app/gutachter/layout.tsx` | 4.5KB | showTeam/showCommunity Props anpassen |
| `src/app/admin/_components/NotificationBell.tsx` | ~3KB | Ersetzen durch MitteilungszentralePanel |
| `src/app/gutachter/heute/page.tsx` | ? | Dashboard-KPIs + Route integrieren |
| `src/app/gutachter/faelle/page.tsx` | ? | Tabs: Fälle, Stellungnahmen, Tasks |
| `src/app/gutachter/kalender/page.tsx` | ? | Terminliste als Toggle |

### Neu erstellen
| Datei | Zweck |
|---|---|
| `src/components/mitteilungszentrale/MitteilungszentralePanel.tsx` | Hauptkomponente (Panel mit 3 Tabs) |
| `src/components/mitteilungszentrale/UpdatesTab.tsx` | Tab 1: Updates + verpasste Anrufe |
| `src/components/mitteilungszentrale/TasksTab.tsx` | Tab 2: Offene Tasks |
| `src/components/mitteilungszentrale/NachrichtenTab.tsx` | Tab 3: Ungelesene Nachrichten |
| `src/components/mitteilungszentrale/MitteilungItem.tsx` | Einzelnes Item mit Click-Through |
| `src/components/mitteilungszentrale/useMitteilungen.ts` | Custom Hook: Laden + Realtime |
| `src/lib/mitteilungen/create-mitteilung.ts` | Server-Helper: Mitteilung erstellen |
| `src/lib/mitteilungen/types.ts` | TypeScript Types |

### NICHT anfassen
- `src/app/gutachter/willkommen/` (Onboarding — fertig)
- `src/app/gutachter/fall/[id]/` (Fallakte — eigenes Feature)
- `src/app/admin/sachverstaendige/anlegen/` (SV-Wizard — eigenes Feature)
- `src/app/admin/dispatch/` (Dispatch — eigenes Feature)

## 2. DB-Schema

### Bestehende Tabelle: gutachter_mitteilungen
```sql
-- IST (nur für SVs)
id UUID PK
sv_id UUID FK sachverstaendige
typ TEXT
titel TEXT
inhalt TEXT
gelesen BOOLEAN DEFAULT false
kontext_typ TEXT  -- 'fall', 'auftrag', etc.
kontext_id UUID
created_at TIMESTAMPTZ
```

### SOLL: Neue Tabelle `mitteilungen` (alle Rollen)
```sql
CREATE TABLE mitteilungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empfaenger_id UUID NOT NULL REFERENCES profiles(id),
  empfaenger_rolle TEXT NOT NULL, -- 'admin' | 'sachverstaendiger' | 'kanzlei' | 'kunde'
  
  -- Kategorisierung (= Tab-Zuordnung)
  kategorie TEXT NOT NULL CHECK (kategorie IN ('update', 'task', 'nachricht', 'anruf')),
  
  -- Inhalt
  titel TEXT NOT NULL,
  inhalt TEXT,
  
  -- Routing (Click-Through)
  kontext_typ TEXT, -- 'fall', 'lead', 'auftrag', 'termin', 'abrechnung', 'nachricht'
  kontext_id UUID,
  route_url TEXT, -- Pre-computed URL für Click-Through
  
  -- Status
  gelesen BOOLEAN NOT NULL DEFAULT false,
  gelesen_am TIMESTAMPTZ,
  
  -- Meta
  absender_id UUID REFERENCES profiles(id), -- NULL = System
  absender_name TEXT,
  icon TEXT, -- Lucide icon name oder Emoji
  prioritaet TEXT DEFAULT 'normal' CHECK (prioritaet IN ('normal', 'hoch', 'dringend')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mitteilungen_empfaenger ON mitteilungen(empfaenger_id, gelesen, created_at DESC);
CREATE INDEX idx_mitteilungen_kategorie ON mitteilungen(empfaenger_id, kategorie, gelesen);
```

### RLS Policies
```sql
-- Jeder sieht nur seine eigenen Mitteilungen
CREATE POLICY "mitteilungen_select" ON mitteilungen
  FOR SELECT USING (empfaenger_id = auth.uid());

CREATE POLICY "mitteilungen_update" ON mitteilungen
  FOR UPDATE USING (empfaenger_id = auth.uid());

-- Nur Service-Role darf inserieren (Server Actions)
CREATE POLICY "mitteilungen_insert" ON mitteilungen
  FOR INSERT WITH CHECK (true); -- via Service Role
```

## 3. Sidebar-Struktur SOLL

```typescript
// GutachterShell.tsx — neue NAV-Struktur
const NAV_SECTIONS = [
  {
    label: 'TAGESGESCHÄFT',
    items: [
      { href: '/gutachter/heute', label: 'Heute', icon: MapPinIcon },
      { href: '/gutachter/auftraege', label: 'Aufträge', icon: ClipboardListIcon, badge: 'auftraege' },
      { href: '/gutachter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
      { href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon },
    ]
  },
  {
    label: 'KOMMUNIKATION',
    items: [
      { href: '/gutachter/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon, badge: 'nachrichten' },
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
      // conditional:
      // { href: '/gutachter/team', label: 'Team', icon: UsersIcon },
      // { href: '/gutachter/community', label: 'Community', icon: TrophyIcon },
    ]
  }
]
```

## 4. Mitteilungszentrale — Component Tree

```
MitteilungszentralePanel (Sheet/Popover)
├── Header: "Mitteilungen" + "Alle gelesen" Button
├── Tabs: Updates | Tasks | Nachrichten
│   ├── UpdatesTab
│   │   ├── MitteilungItem (typ='update')
│   │   ├── MitteilungItem (typ='anruf', mit "Zurückrufen" Action)
│   │   └── ...
│   ├── TasksTab
│   │   ├── MitteilungItem (typ='task', mit Quick-Action)
│   │   └── ...
│   └── NachrichtenTab
│       ├── MitteilungItem (typ='nachricht', mit Preview)
│       └── ...
└── Footer: "Alle anzeigen" Link → /mitteilungen (Fallback-Route)
```

## 5. Konventionen

### Mitteilung erstellen (Server-seitig)
```typescript
// Überall wo ein Status-Wechsel passiert:
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'

await createMitteilung({
  empfaengerId: svProfileId,
  empfaengerRolle: 'sachverstaendiger',
  kategorie: 'update',
  titel: 'Neuer Auftrag zugewiesen',
  inhalt: 'Fall SF-2026-120: Max Mustermann, VW Golf',
  kontextTyp: 'auftrag',
  kontextId: auftragId,
  routeUrl: `/gutachter/auftrag/${auftragId}`,
  icon: 'ClipboardList',
})
```

### Design-System
- Panel: Sheet (shadcn) von rechts, max-w-md
- Tabs: 3 Tabs mit Badge-Counters
- Items: Compact-List, hover:bg-gray-50, ungelesen=font-semibold + blauer Dot links
- Zeitstempel: relative ("vor 5 Min", "gestern")
- Section-Headers in Sidebar: `text-[10px] uppercase tracking-wider text-[#7BA3CC]/50 px-3 pt-4 pb-1`
