# DB-MIGRATION — Sicherheitsplan

## Prinzip: ADDITIV, NIE DESTRUKTIV

Alte Tabellen werden NIE gelöscht oder verändert. Wir bauen neu daneben, migrieren Daten, und stellen den Code schrittweise um.

---

## Phase 1: Neue Tabelle erstellen (bricht NICHTS)

```sql
-- Neue zentrale Mitteilungen-Tabelle
CREATE TABLE IF NOT EXISTS mitteilungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empfaenger_id UUID NOT NULL REFERENCES profiles(id),
  empfaenger_rolle TEXT NOT NULL,
  kategorie TEXT NOT NULL CHECK (kategorie IN ('update', 'task', 'nachricht', 'anruf')),
  titel TEXT NOT NULL,
  inhalt TEXT,
  kontext_typ TEXT,
  kontext_id UUID,
  route_url TEXT,
  gelesen BOOLEAN NOT NULL DEFAULT false,
  gelesen_am TIMESTAMPTZ,
  absender_id UUID REFERENCES profiles(id),
  absender_name TEXT,
  icon TEXT,
  prioritaet TEXT DEFAULT 'normal' CHECK (prioritaet IN ('normal', 'hoch', 'dringend')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mitteilungen_empfaenger ON mitteilungen(empfaenger_id, gelesen, created_at DESC);
CREATE INDEX idx_mitteilungen_kategorie ON mitteilungen(empfaenger_id, kategorie, gelesen);

-- RLS
ALTER TABLE mitteilungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mitteilungen_select" ON mitteilungen
  FOR SELECT USING (empfaenger_id = auth.uid());

CREATE POLICY "mitteilungen_update" ON mitteilungen
  FOR UPDATE USING (empfaenger_id = auth.uid());

CREATE POLICY "mitteilungen_insert" ON mitteilungen
  FOR INSERT WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE mitteilungen;
```

**Test:** `SELECT * FROM mitteilungen` → leere Tabelle, kein Fehler.
**Risiko:** NULL — rein additiv.

---

## Phase 2: Daten KOPIEREN (alte Tabellen bleiben unverändert)

```sql
-- gutachter_mitteilungen → mitteilungen (KOPIE)
INSERT INTO mitteilungen (empfaenger_id, empfaenger_rolle, kategorie, titel, inhalt, kontext_typ, kontext_id, route_url, gelesen, created_at)
SELECT 
  s.profile_id,
  'sachverstaendiger',
  CASE WHEN gm.typ = 'task' THEN 'task' ELSE 'update' END,
  gm.titel,
  gm.nachricht,
  CASE WHEN gm.fall_id IS NOT NULL THEN 'fall' END,
  gm.fall_id,
  gm.link,
  gm.gelesen,
  gm.created_at
FROM gutachter_mitteilungen gm
JOIN sachverstaendige s ON s.id = gm.sv_id
WHERE s.profile_id IS NOT NULL;

-- benachrichtigungen → mitteilungen (KOPIE)
INSERT INTO mitteilungen (empfaenger_id, empfaenger_rolle, kategorie, titel, inhalt, route_url, gelesen, created_at)
SELECT 
  b.user_id,
  COALESCE(p.rolle::text, 'admin'),
  COALESCE(b.typ, 'update'),
  b.titel,
  COALESCE(b.nachricht, b.beschreibung),
  b.link,
  b.gelesen,
  COALESCE(b.erstellt_am, b.created_at)
FROM benachrichtigungen b
LEFT JOIN profiles p ON p.id = b.user_id;
```

**Test:** `SELECT count(*) FROM mitteilungen` → Summe der beiden alten Tabellen.
**Risiko:** NULL — nur INSERT in neue Tabelle, alte unberührt.

---

## Phase 3: Code umstellen (schrittweise)

### Schritt A: LESEN umstellen
MitteilungszentralePanel liest aus `mitteilungen` (NEU).
Alte Komponenten (NotificationBell, Mitteilungen-Seite) lesen weiter aus alten Tabellen.

### Schritt B: SCHREIBEN umstellen
`createMitteilung()` schreibt NUR in `mitteilungen` (NEU).
Alte Write-Pfade (die in gutachter_mitteilungen/benachrichtigungen schreiben) werden ZUSÄTZLICH auch in `mitteilungen` schreiben (Dual-Write).

### Schritt C: Alte Reads abschalten
Sobald MitteilungszentralePanel funktioniert, alte NotificationBell durch neue Komponente ersetzen.
Alte Mitteilungen-Seite wird nicht mehr verlinkt (aber Route bleibt).

### Schritt D: Dual-Write beenden (optional, später)
Wenn alles stabil: alte Write-Pfade entfernen.
Alte Tabellen bleiben als Archiv stehen.

---

## leadbearbeiter Enum

```sql
-- NICHT entfernen (Postgres ALTER TYPE DROP VALUE ist riskant)
-- Stattdessen: Dokumentieren als deprecated
COMMENT ON TYPE user_role IS 'Aktive Rollen: admin, dispatch, kundenbetreuer, sachverstaendiger, kanzlei, kunde. DEPRECATED: leadbearbeiter (kein User hat diese Rolle, identisch mit dispatch).';
```

**Risiko:** NULL — nur ein Kommentar.

---

## email_log.empfaenger_typ Inkonsistenz

```sql
-- NICHT ändern — historische Daten in Log-Tabelle
-- Neuer Code soll 'sachverstaendiger' verwenden, nicht 'sv'
-- Aber bestehende Einträge bleiben
COMMENT ON COLUMN email_log.empfaenger_typ IS 'Legacy: verwendet "sv" statt "sachverstaendiger". Neue Einträge sollen "sachverstaendiger" nutzen.';
```

**Risiko:** NULL — nur ein Kommentar.

---

## Checkliste

- [ ] Phase 1: mitteilungen Tabelle erstellt
- [ ] Phase 1: RLS Policies angelegt
- [ ] Phase 1: Realtime enabled
- [ ] Phase 2: Daten aus gutachter_mitteilungen kopiert
- [ ] Phase 2: Daten aus benachrichtigungen kopiert
- [ ] Phase 2: Alte Tabellen UNVERÄNDERT (verifizieren!)
- [ ] Phase 3A: MitteilungszentralePanel liest aus mitteilungen
- [ ] Phase 3B: createMitteilung schreibt in mitteilungen
- [ ] Phase 3C: Alte NotificationBell ersetzt
- [ ] leadbearbeiter als deprecated kommentiert
- [ ] email_log Inkonsistenz kommentiert
- [ ] KEINE alte Tabelle gelöscht
- [ ] KEIN Enum-Wert entfernt
