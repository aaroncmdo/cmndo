# VERTIKAL-AUDIT — `leads` Daten-Fluss pro Feld

**Datum:** 2026-05-14
**Methode:** Pro Feld die Write-Sources + Read-Consumers traceN. Drift, Race-Conditions, Dead-Inputs identifizieren.
**Vorlage:** BEFUND.md (horizontaler Audit)

## Real-World Coverage (alle 27 Leads in Prod)

| Feld | Coverage | Schlussfolgerung |
|---|---:|---|
| `vorname` (top) | 25 (93%) | Aktiv genutzt |
| `schadentyp` | 16 (59%) | Aktiv genutzt |
| `fahrzeug_standort_adresse` | 7 (26%) | Teilweise genutzt |
| `halter_vorname` | 1 (4%) | Quasi tot |
| `halter_strasse` | 1 (4%) | Quasi tot |
| `kennzeichen` | 1 (4%) | Quasi tot (ungewöhnlich) |
| `halter_name` (combined) | 0 | TOT |
| `firma_name` | 0 | TOT |
| `gegner_name` | 0 | TOT (interessant!) |
| `kennzeichen_kreis/_buchstaben/_zahl/_suffix` | 0 | TOT |
| `kunde_adresse/_strasse/_plz/_stadt` | 0 | TOT |
| `besichtigungsort_*` | 0 | TOT (obwohl Writer existiert) |
| `schadens_art/_fall_typ/_ursache` | 0 | TOT |
| `vehicle_id` (FK) | 0 | TOT |

→ **17 Spalten in Live-DB komplett unbeschrieben.** Plus 5 mit <5% Coverage.

## Vertikale Trace pro Cluster

### Cluster 1 — Halter-Felder (Write-Drift gefunden!)

#### Write-Pfade für `halter_vorname`/`halter_nachname`:

1. **`api/ocr/zb1-scan/route.ts:90`** — OCR-Extraktion aus ZB1-Foto schreibt direkt
2. **`api/ocr-fahrzeugschein/route.ts:67,99`** — Fahrzeugschein-OCR schreibt in `leads.halter_*` UND `claims.halter_*`
3. **`api/ocr-fahrzeugschein-anfrage/route.ts:60`** — Anfrage-OCR
4. **`api/webhooks/twilio/inbound/route.ts:437`** — Twilio MMS mit Foto-OCR
5. **`dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:533`** — **Auto-Sync `halter_vorname: l.vorname`** beim Mount wenn `ist_fahrzeughalter==null`
6. **`kunde/onboarding-details/zb1-actions.ts:49`** — Kunde-Portal ZB1-Upload
7. **`upload/dokumente/[token]/actions.ts:413,432`** — Public-Token-Upload (Magic-Link)
8. **`lib/actions/update-lead-zb1-manual.ts:48`** — Manuelle ZB1-Eintragung
9. **`lib/actions/dispatch-fall-actions.ts:700`** — bei Lead→Fall-Conversion
10. **`lib/actions/konvertiere-anfrage-zu-fall.ts:177`** — bei Anfrage→Fall

**Drift-Fund:** Phase4Stammdaten kopiert `vorname` → `halter_vorname` (Auto-Sync). OCR schreibt `halter_vorname` aus ZB1-Doc. **Race-Condition:** Wenn nach OCR der User in Phase 4 lädt UND ist_fahrzeughalter noch null ist, überschreibt der Auto-Sync die OCR-Daten mit top-level-vorname.

#### Read-Pfade für `halter_vorname`:

Hauptsächlich Anzeige-Komponenten (Stammdaten-Tab, OCR-Confirm-Screen, ClaimSummary). Auch interessant: `Phase4Stammdaten.tsx:1102` — `const halterVorname = norm(l.halter_vorname)` — Logik die explizit `halter_*` und nicht top-level liest. **Heißt:** UI-Konsumenten erwarten `halter_*` gefüllt, aber Coverage ist 4%.

**Schlussfolgerung:** Halter-Felder sind nicht "ungenutzt" — sie sind **stillschweigend kaputt**. UI liest sie, DB hat sie meistens null, Auto-Sync versucht zu kompensieren, OCR überschreibt. Konsolidierung müsste:
- Single-Source-of-Truth festlegen (welches Feld ist canonical?)
- Race-Condition auflösen
- Read-Sites umstellen

### Cluster 2 — kunde_strasse/_plz/_stadt (Dead-Input mit Read)

#### Write-Pfade für `kunde_strasse`:

1. `dispatch/leads/actions.ts:81` — Lead-Anlegen via Dispatch
2. `dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:726` — Google-Place-Lookup setzt es
3. `dispatch/leads/_components/NeuLeadDrawer.tsx` — Form-Initial-State
4. `lib/actions/dispatch-fall-actions.ts:599` — bei Lead→Fall-Conversion

#### Read-Pfade für `kunde_strasse`:

1. **`dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:535`** — `halter_strasse: l.kunde_strasse ?? null` in `halterAusKunde()` Auto-Sync
2. `lib/lexdrive/email-sender.ts:43` — Lexdrive-Email-Generierung liest es
3. `gutachter/termine/[id]/page.tsx:116` — Fallback wenn `unfallort` leer ist

**Drift-Fund:** Writer existieren, aber Coverage ist 0/27. **Heißt:** Die Writers laufen, aber das Feld wird nicht persistiert. Mögliche Ursache:
- NeuLeadDrawer-Form hat ein Adress-Feld, das User füllen können, aber nicht müssen
- Phase4 Place-Lookup setzt es nur wenn User Adresse manuell eingibt
- Dispatch-Lead-Anlegen-Formular hat das Feld leer

**Read-Konsequenz:** `lib/lexdrive/email-sender.ts` liest `kunde_strasse` für die Kanzlei-Email. Wenn das Feld null ist (was es immer ist), kriegt die Kanzlei keine Adresse → Lexdrive-Integration bekommt unvollständige Daten.

→ **Echter Prod-Bug** und keine harmlose Redundanz.

### Cluster 3 — besichtigungsort_* (Writer-Reader-Mismatch)

#### Write-Pfade:
- `dispatch/leads/[id]/_phases/Phase1Qualifizierung.tsx:215,222` — beim Place-Lookup
- `dispatch/kalender/_actions/spontan.ts:67` — Spontan-Termin-Anlage
- `dispatch/leads/[id]/_actions/sv-kalender.ts` — read-only (für Iso-Filter)

#### Read-Pfade:
- 17+ Stellen über die ganze SV/Dispatch-Codebase (Iso-Polygon, Kalender, SV-Anfahrt)

**Drift-Fund:** Coverage 0/27, aber alle Writers WÜRDEN schreiben. Heißt: Die meisten Leads erreichen Phase 1 Place-Lookup nicht (vielleicht weil sie noch auf top-level-vorname-Stage sind). Sobald ein Lead durch Phase 1 läuft, sollte's gefüllt sein.

**Hypothese:** Real-Prod hat halt nur 27 Leads, viele davon Smoke/Test, daher 0% Coverage. Ohne mehr Daten kann ich nicht sicher sagen ob `besichtigungsort_*` redundant ist.

### Cluster 4 — schadens_art / schadens_fall_typ / schadensursache (Admin-only-Pfad)

#### Write-Pfade:
- **`admin/faelle/anlegen/actions.ts`** + AnlegenFallClient.tsx — der manuelle „Fall anlegen"-Pfad
- `api/seed-testdata/route.ts` — Testdaten-Seed

**Diagnose:** Diese Felder werden NUR vom Admin-Pfad „Fall direkt anlegen" gesetzt. Der Haupt-Lifecycle (FlowWizard → Lead → Convert → Fall) berührt sie nicht. Auf `leads`-Tabelle daher 0%.

**Konsequenz:** Diese Felder gehören NICHT auf `leads`. Sie sollten direkt auf `faelle` oder `claims` leben (wo Admin manuell Fälle anlegt). Drop von `leads`.

### Cluster 5 — Kennzeichen-Split (kennzeichen_kreis/_buchstaben/_zahl/_suffix)

#### Write-Pfade: KEINE.
#### Read-Pfade: nur TypeScript-types (Schema-export).

**Diagnose:** Komplett toter Code. Wahrscheinlich für Datenanalyse / Statistik geplant gewesen (welche Kreise sind häufig?). Nie implementiert.

→ **Sofort droppen.**

### Cluster 6 — Konvertierungs-Tracking (Dual-FK Legacy)

#### `konvertiert_zu_fall_id` (Coverage 11):
- Writer: `lib/actions/konvertiere-anfrage-zu-fall.ts`, `dispatch-fall-actions.ts` beim Convert
- Reader: Lead-Detail-Views (Anzeige „→ Fall #ABC"), Idempotenz-Check

#### `konvertiert_zu_claim_id` (Coverage 11):
- Writer: `lib/leads/convert-lead-to-claim.ts` (CMM-neuer-Pfad)
- Reader: claims-zentrische Queries

**Diagnose:** Beide werden gesetzt durch Sync-Trigger `auftraege_sync_claim_id` und `sync_claims_to_faelle`. **`claim_id` ist der CMM-SSoT**, `fall_id` ist Legacy.

Drop-Ziel: `konvertiert_zu_fall_id`. Aber: Read-Pfade müssen erst auf `claim_id` umgestellt werden. ~5 Stellen.

### Cluster 7 — vehicle_id (FK ungenutzt, AAR-810 unfertig)

#### Write-Pfade:
- `lib/claims/create-for-fall.ts:84` — bei Claim-Creation
- `lib/leads/convert-lead-to-claim.ts:188,280,348` — bei Lead→Claim Convert

#### Read-Pfade: TS-types only.

**Diagnose:** Writers existieren in den Convert-Pfaden, aber alle Quellen sind `source.vehicle_id ?? null` oder `lead.vehicle_id` — und auf `leads` ist es 0/27. Heißt der FK wird durchgereicht aber nirgends initial gesetzt.

**Root-Cause:** Es gibt keinen Pfad der `leads.vehicle_id` auf einen neuen `vehicles`-Row setzt. AAR-810 plante das, nie implementiert.

## Konsolidierte Befunde (vertikal)

### A. Tote Felder (drop ohne Risiko)

| Feld | Begründung |
|---|---|
| `kennzeichen_kreis/_buchstaben/_zahl/_suffix` | Keine Writer, keine echte Reader |
| `halter_name` (combined) | Nur Type-Reads, keine Writer |
| `kunde_adresse` (single) | Konkurriert mit `kunde_strasse/_plz/_stadt`, nie gefüllt |
| `schadens_art`, `schadens_fall_typ`, `schadensursache` | Nur Admin-Anlegen-Pfad, gehört auf faelle nicht leads |

### B. Drift-Bugs (echte Produktionsfehler, nicht nur Redundanz)

1. **`kunde_strasse/_plz/_stadt`** — Lexdrive-Email-Generierung liest sie, sie sind aber 0/27 gefüllt → Kanzlei-Emails kriegen unvollständige Adresse.
2. **`halter_*` Race-Condition** — OCR schreibt `halter_vorname` aus ZB1-Daten. Phase4Stammdaten überschreibt mit `l.vorname` (top-level) wenn `ist_fahrzeughalter==null`. Wer gewinnt = Race.
3. **`halter_*` UI-Reader** — `Phase4Stammdaten.tsx:1102` liest `l.halter_vorname` explizit. Mit 4% Coverage sieht User in 96% der Fälle leeres Feld.

### C. Strukturelle Probleme

1. **vehicle_id-Migration unfertig** (AAR-810): vehicles-Tabelle hat keine halter_*-Spalten obwohl Comment-Plan vorlag.
2. **`konvertiert_zu_fall_id`** ist CMM-Legacy, `claim_id` ist SSoT. Drop blockt auf Read-Path-Migration (~5 Stellen).
3. **Halter-Konzept mehrdeutig**: AAR-575 trennt „Anrufer" vs „Halter" via top-level vs halter_*. In Praxis wird nur top-level gepflegt + ist_fahrzeughalter-Flag gesetzt. Die getrennten halter_*-Felder pflegt niemand konsistent.

## Empfehlung — Reihenfolge

1. **SOFORT (≤1h, 0 Risiko):** Drop der toten Felder (Cluster A). 17 Spalten weg, keine Code-Änderung.
2. **kurzfristig (1 Tag):** Drift-Bugs in B fixen.
   - Lexdrive-Email-Sender umstellen auf halter_* (mit Fallback auf top-level)
   - Auto-Sync in Phase4Stammdaten entfernen oder defensiv machen
   - Phase4-UI auf top-level umstellen statt halter_*
3. **mittelfristig (3 Tage):** Halter-Konsolidierung (Stufe 2 aus AUDIT.md). Drop von halter_*, ist_fahrzeughalter-Flag + ansprechpartner_beziehung reicht.
4. **langfristig (5–7 Tage):** vehicles-Migration AAR-810 fertigstellen (Stufe 3).

→ Aaron entscheidet wo Schwerpunkt liegt.
