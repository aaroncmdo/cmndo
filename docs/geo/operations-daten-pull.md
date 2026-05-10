# Operations-Daten-Pull für Schadensreport-Auswertung

**Stand:** 10.05.2026
**Status:** Vorbereitet — Ausführung wenn Datenvolumen >100 abgeschlossene Fälle
**Ziel:** Aus der Supabase-Production die anonymisierten Auswertungs-Zahlen ziehen die heute im Schadensreport als Platzhalter stehen.

---

## Aktueller Stand

Volumen ist heute noch zu klein für statistisch belastbare Aussagen — wir laufen gerade erst an. Sobald wir **mindestens 100 abgeschlossene Fälle** haben (Status `abgeschlossen` oder `auszahlung_eingegangen`) ist eine Veröffentlichung sinnvoll. Vorher wären Zahlen volatil und angreifbar.

Bis dahin: **Schadensreport zeigt Wettbewerber-Markt-Daten + BGH + BVSK** (alles öffentlich belegbar) und einen klaren „Auswertung Q3 2026"-Platzhalter mit der Liste der geplanten Datenpunkte. Glaubwürdiger als Fake-Zahlen.

---

## Datenpunkte die wir ziehen wollen

### A — Erfolgsquoten pro Kürzungsposition

Aus `auszahlungen` + `kuerzungen` (oder den entsprechenden Audit-Feldern):

```sql
-- Kürzungs-Position: wie viel hat Versicherer im Erstangebot gekürzt vs.
-- wie viel haben wir am Ende durchgesetzt?
SELECT
  k.position,                         -- 'upe', 'verbringung', 'wertminderung', ...
  COUNT(*) AS faelle_betroffen,
  AVG(k.geforderter_betrag - k.gekuerzter_betrag) AS avg_kuerzung_eur,
  AVG(k.zurueckgeholter_betrag::numeric / NULLIF(k.gekuerzter_betrag, 0))
    AS rueckhol_quote
FROM kuerzungen k
JOIN faelle f ON f.id = k.fall_id
WHERE f.status IN ('abgeschlossen', 'auszahlung_eingegangen')
  AND f.created_at >= '2024-01-01'
GROUP BY k.position
ORDER BY faelle_betroffen DESC;
```

**Hinweis:** das Schema `kuerzungen` müsste ggf. erst aufgesetzt werden — aktuell ist Kürzung-Tracking in `claims` + `auszahlungen` verteilt. Eigene Migration sinnvoll.

### B — Versicherer-Ranking (Top-5)

```sql
-- Pro Versicherer: durchschnittliche Kürzungs-% (gekürzter / gefordert)
-- + Reaktionszeit (Tage zwischen schaden_gemeldet_am und erst_reaktion_am)
SELECT
  v.name AS versicherer,
  COUNT(*) AS anzahl_faelle,
  AVG((g.gekuerzter_betrag::numeric / NULLIF(g.geforderter_betrag, 0))) AS avg_kuerzung_quote,
  AVG(EXTRACT(EPOCH FROM (e.erst_reaktion_am - f.gemeldet_am)) / 86400)
    AS avg_reaktionstage,
  COUNT(*) FILTER (WHERE g.zahlung_phase = 'klage') * 100.0 / COUNT(*)
    AS klage_quote_prozent
FROM faelle f
JOIN versicherer v ON v.id = f.gegner_versicherung_id
LEFT JOIN gegner_eskalationen e ON e.fall_id = f.id
LEFT JOIN gutachten g ON g.fall_id = f.id
WHERE f.status IN ('abgeschlossen', 'auszahlung_eingegangen')
  AND f.gemeldet_am >= '2024-01-01'
GROUP BY v.name
HAVING COUNT(*) >= 10
ORDER BY anzahl_faelle DESC
LIMIT 5;
```

**Datenschutz:** Versicherer-Namen sind im Report ok — wir prangern keinen einzelnen Bürger an, sondern öffentliche Konzerne mit publik nachvollziehbarem Verhalten. Rechtlich: Meinungsfreiheit + faktenbelegte Berichterstattung.

### C — Schadens-Typ-Verteilung

```sql
SELECT
  c.unfall_konstellation AS schadenstyp,
  COUNT(*) AS anzahl,
  AVG(c.brutto_schaden) AS avg_schaden_eur,
  AVG((g.gekuerzter_betrag::numeric / NULLIF(g.geforderter_betrag, 0)))
    AS avg_kuerzung_quote
FROM claims c
JOIN faelle f ON f.claim_id = c.id
LEFT JOIN gutachten g ON g.fall_id = f.id
WHERE f.status IN ('abgeschlossen', 'auszahlung_eingegangen')
GROUP BY c.unfall_konstellation
ORDER BY anzahl DESC;
```

### D — Top-5 NRW-Städte nach Fallvolumen

```sql
SELECT
  c.schadenort_ort AS stadt,
  COUNT(*) AS faelle,
  AVG(c.brutto_schaden) AS avg_schadenshoehe
FROM claims c
JOIN faelle f ON f.claim_id = c.id
WHERE c.schadenort_plz LIKE '4%' OR c.schadenort_plz LIKE '5%'  -- NRW
GROUP BY c.schadenort_ort
ORDER BY faelle DESC
LIMIT 5;
```

### E — Mittlere Bearbeitungszeit

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (a.zahlung_eingegangen_am - f.gemeldet_am)) / 86400)
    AS avg_tage_meldung_bis_auszahlung,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (a.zahlung_eingegangen_am - f.gemeldet_am))
    AS median_tage,
  MIN(a.zahlung_eingegangen_am - f.gemeldet_am) AS min_tage,
  MAX(a.zahlung_eingegangen_am - f.gemeldet_am) AS max_tage
FROM faelle f
JOIN auszahlungen a ON a.fall_id = f.id
WHERE f.status = 'auszahlung_eingegangen'
  AND f.gemeldet_am >= '2024-01-01';
```

### F — Vorschaden-Realität

```sql
-- % Fälle mit Vorschäden + ø Wertminderungs-Differenz mit/ohne Doku
SELECT
  COUNT(*) FILTER (WHERE c.hat_vorschaeden) * 100.0 / COUNT(*) AS vorschaden_quote_prozent,
  AVG(c.wertminderung) FILTER (WHERE c.hat_vorschaeden AND v.vorschaden_geprueft) AS avg_wm_mit_doku,
  AVG(c.wertminderung) FILTER (WHERE c.hat_vorschaeden AND NOT v.vorschaden_geprueft) AS avg_wm_ohne_doku
FROM claims c
JOIN faelle f ON f.claim_id = c.id
LEFT JOIN vehicles v ON v.id = c.vehicle_id
WHERE f.status IN ('abgeschlossen', 'auszahlung_eingegangen');
```

### G — NPS / Customer-Satisfaction

Aktuell **nicht** systematisch erhoben. Müsste eingeführt werden:
- Post-Abschluss-Umfrage via WhatsApp (1 Klick: Bewertung 0-10 + Kommentar)
- Speicherung in `kunde_feedback` Table mit `fall_id` FK
- Aggregation als monatlicher NPS

Eigener Migration + Workflow nötig — separat.

---

## Wann ausführen?

| Voraussetzung | Status heute | Fertig? |
|---|---|---|
| ≥ 100 abgeschlossene Fälle | ~? (zu prüfen) | ❓ |
| Kürzungs-Tracking-Schema sauber | nein | ❌ |
| Versicherer-FK durchgängig gesetzt | teilweise | ⚠️ |
| Auszahlungs-Daten konsistent | ja | ✓ |
| Schadenort-Daten in claims | ja | ✓ |
| NPS-Tracking | nein | ❌ |

**Empfehlung:** vor der ersten Schadensreport-Auswertung
1. Kürzungs-Tracking-Migration (1 Tag) — Schema klärt was wir tracken
2. NPS-Workflow (1-2 Tage) — kommt mit jedem zukünftigen Fall dazu
3. Bei 100+ abgeschlossenen Fällen: SQL-Pull aus den Queries oben
4. Anonymisierter CSV-Export → in Schadensreport-Page als statische Daten

Bei Volumen-Erreichen: 1 Tag Auswertungs-Session, dann Update-PR auf den Schadensreport.

---

## Wo die Werte einsetzen

In `src/app/schadensreport-2026/page.tsx` ist bereits ein **„Auswertung Claimondo 2024–2026"**-Block angelegt mit Bullet-Liste der geplanten Datenpunkte. Der wird beim Update durch echte Tabellen ersetzt:

```
Tabelle 5: Erfolgsquoten pro Kürzungsposition
Tabelle 6: Versicherer-Ranking (Top-5)
Tabelle 7: Schadens-Typ-Verteilung
Tabelle 8: Bearbeitungszeit-Statistik
Tabelle 9: Vorschaden-Realität
+ Customer-Satisfaction-Block falls NPS aufgesetzt
```

Plus das `datasetSchema` im Page-Header bekommt zusätzliche `variableMeasured`-Einträge für die neuen Daten — AI-Crawler erkennen das als erweiterten Dataset.

---

## DSGVO

Alle Auswertungen sind **aggregiert über >5 Fälle pro Bucket** und **anonymisiert**. Kein einzelner Mandant ist identifizierbar. Versicherer-Namen sind ok (öffentliche Konzerne). Bei Top-5-Städten: nur Stadt-Name, keine PLZ-Ebene.

Methodik-Section im Report dokumentiert die Anonymisierung explizit für Glaubwürdigkeit + DSGVO-Compliance.
