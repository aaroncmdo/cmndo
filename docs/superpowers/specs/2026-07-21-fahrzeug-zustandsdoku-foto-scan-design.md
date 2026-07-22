# Fahrzeug-Zustandsdoku / Foto-Scan (Sub-Projekt B, v1)

Stand: 2026-07-21
Status: Design (approved Aaron: „das passt" — FM in-app · v1 inkl. KI · sync am Ende der Strecke · Human-in-the-loop · Perspektiven-Set bestätigt). Noch nicht implementiert.
Branch/Worktree: `kitta/fahrzeug-zustandsdoku` (aus `origin/staging` @ `444add636`, enthält bereits A/#4657 Vehicle-FIN-Unifikation).
Roadmap-Herkunft: [[coordination-vehicle-fin-unifikation-und-zustandsdoku-roadmap]] (Sub-Projekt B). Baut auf C/#4663 (Schadenkarte) NICHT auf — eigener Faden, aber File-Kollision im Fahrzeug-Detail (s. Koordination).

## Problem / Kontext

Flotten brauchen einen **beweisbaren Ist-Zustand** ihrer Fahrzeuge: kommt später ein Schaden, will die Versicherung wissen, was **Vorschaden** war und was neu ist. Heute gibt es keine proaktive Zustandsdoku — Vorschäden entstehen nur reaktiv beim Claim-Close (`markClaimDamagesAsVorschaden`). B schließt die Lücke: der Flottenmanager dokumentiert den Zustand **periodisch mit Fotos**, eine KI erkennt Schäden, und die Funde landen als **`vehicle_vorschaeden`-Belege** — handfeste, zeitgestempelte Beweise.

## Zielbild (Aaron 21.07., wörtlich sinngemäß)

- Im **Fahrzeug-Detail** kann ein **„Scan"** gemacht werden (+ Badge in der Flotten-View).
- Flottenmanager fotografiert das Auto aus **verschiedenen Perspektiven, alle 3 Monate (+ 1× initial)** → Ist-Zustand frisch.
- Fotos werden **am Fahrzeug festgehalten + abrufbar**.
- **KI erkennt Schäden** → hilft der Versicherung, **Vorschäden zu kennzeichnen** oder zu belegen dass **keine** da waren.
- **Geführte Fotostrecke** (Perspektiven in einem Rutsch); bei erkanntem Schaden zusätzliche **Nahaufnahme**.

## Entscheidungen (Brainstorm 21.07.)

1. **Einstieg = FM in-app** (Fahrzeug-Detail „Scan"). Kein Fahrer-/Magic-Link-Weg in v1 (spätere Option).
2. **v1-Scope = Capture + Storage + Abruf/Badge + KI-Erkennung.** 3-Monats-Reminder-**Cron = Phase 3** (später).
3. **KI-Timing = synchron am Ende der Standard-Strecke** → erlaubt die Nahaufnahme-Anforderung „in einem Rutsch".
4. **KI-Autorität = Human-in-the-loop:** KI-Funde sind Vorschlag; der FM bestätigt/verwirft/editiert **vor** dem Anlegen der `vehicle_vorschaeden`-Rows.
5. **Perspektiven-Set (v1):** Front, Heck, Seite links, Seite rechts, 4 Ecken (VL/VR/HL/HR) + optional Tacho (Kilometerstand). Nahaufnahmen dynamisch bei KI-Funden.

## Architektur / Flow

```
Fahrzeug-Detail → [Zustand dokumentieren]
  → ZustandsScanWizard (mobil):
      Standard-Perspektiven nacheinander (Kamera) → Upload je Foto
  → [Fertig]
  → analysiereZustandsFotos (Server-Action, SYNCHRON):
      Claude-Vision über den Foto-Batch → strukturierte Fund-Liste
  → Human-in-the-loop-Review:
      je Fund: bestätigen/verwerfen/editieren + [Nahaufnahme aufnehmen]
  → finalisiereScan (Server-Action):
      bestätigte Funde → recordVehicleDamage(quelle='zustandsdoku', state='vorschaden')
      Scan.status='abgeschlossen' + revalidate
  → zurück im Detail: neuer Scan sichtbar, Badge aktualisiert
```

## Komponenten / Units

### 1. Datenmodell (DDL via Supabase-Plugin, Regel 2)
- **`vehicle_scans`** — ein Scan-Event: `id uuid pk`, `vehicle_id uuid → vehicles`, `erstellt_am timestamptz`, `erstellt_von uuid`, `kilometerstand int null`, `status text` (`'offen' | 'abgeschlossen'`), `notiz text null`.
- **`vehicle_scan_fotos`** — `id uuid pk`, `scan_id uuid → vehicle_scans (on delete cascade)`, `storage_path text`, `perspektive text` (`front|heck|seite_links|seite_rechts|ecke_vl|ecke_vr|ecke_hl|ecke_hr|tacho|nahaufnahme`), `ist_nahaufnahme bool default false`, `vorschaden_id uuid → vehicle_vorschaeden null` (Nahaufnahme→Fund), `reihenfolge int`, `erstellt_am timestamptz`.
- **`vehicle_vorschaeden`** (Bestand, wiederverwenden): erkannte Schäden via `recordVehicleDamage` (`quelle='zustandsdoku'`, `state='vorschaden'`, `claim_id=null`, `art/schwere/beschreibung` aus dem bestätigten Fund, `rohdaten` = KI-Rohoutput). **+ nullable FK-Spalte `scan_id uuid → vehicle_scans`** (ALTER) für „welcher Scan hat den Vorschaden erzeugt" (sauberes Query statt rohdaten-Graben).
- **Storage:** privater Bucket **`fahrzeug-zustand`**, Pfad `{vehicle_id}/{scan_id}/{foto_id}.jpg`. RLS: FM der besitzenden Firma darf `SELECT` (via `flotten_fahrzeuge → firmen_flotten_konten`); Writes nur Service-Role (Server-Actions). Locked-Bucket-Muster ([[kickoff-storage-rls-locked-bucket-audit]]).
- Neue Tabellen sind **nicht** in `database.types.ts` → `AnyDb`-Casts (wie `schadenkarten`).

### 2. KI-Analyse — `src/lib/vehicles/zustand-scan-ki.ts`
- Nutzt den bestehenden **`support/anthropic-client.ts`** (Claude Vision) nach dem Muster von **`werkstatt/bedarf/schadenbild-gewerke.ts`** (Foto→strukturierter Output).
- Input: die Standard-Fotos (als Storage-URL/Base64) + Perspektiven-Labels.
- Prompt-Ziel: **nur eindeutig sichtbare** Schäden (Delle/Kratzer/Riss/Rost/Bruch). Output je Fund (strukturiert, tolerant geparst): `{ perspektive, bereich, art, schwere: 'leicht'|'mittel'|'schwer', confidence: number, beschreibung }`.
- **Pure Parse-Funktion** (KI-JSON → typisierte Fund-Liste, tolerant gegen Malformed) = unit-testbar.
- Kein Auto-Write: die Liste geht zurück an den Client für den Human-Review.

### 3. Server-Actions — `src/app/flotte/(shell)/fahrzeug/[id]/zustand-actions.ts` (`'use server'`)
- `starteScan(vehicleId)` → `vehicle_scans`-Row (`status='offen'`), FM-firma-scoped (Ownership via `flotten_fahrzeuge`).
- `ladeFotoHoch(scanId, perspektive, file)` → Storage + `vehicle_scan_fotos`-Row. (Ownership-Check.)
- `analysiereZustandsFotos(scanId)` → sammelt die Standard-Fotos, ruft die KI, gibt die Fund-Liste zurück. Result-Object.
- `finalisiereScan(scanId, bestaetigteFunde[])` → je Fund `recordVehicleDamage(...)` + Nahaufnahme-Foto verknüpfen (`vehicle_scan_fotos.vorschaden_id`), `status='abgeschlossen'`, `revalidatePath('/flotte/fahrzeug/${vehicleId}')` + Flotten-Liste. Result-Object.
- Alle firma-scoped; NIE Kundendaten fremder Firmen.

### 4. UI
- **`src/components/flotte/ZustandsScanWizard.tsx`** (Client, mobil): Schritt-für-Schritt Perspektiven mit `capture="environment"`-Kamera-Input (Muster aus `SchadensfotoUploadCard`), Fortschritt, „Fertig"→Analyse-Ladezustand, dann Review-Liste (je Fund bestätigen/verwerfen/editieren + Nahaufnahme), Abschluss.
  - **Nahaufnahme je bestätigtem Fund = empfohlen, aber fail-soft** (nicht blockierend — auch ohne Nahaufnahme ist der Fund + das Standard-Foto ein Beleg).
  - **Kilometerstand = manuelle Eingabe** (optional) + Tacho-Foto als visueller Beleg — kein OCR in v1.
- **Fahrzeug-Detail** (`.../fahrzeug/[id]/page.tsx`): neue Sektion **„Zustandsdoku"** — letzter Scan (Datum, Thumbnails, erkannte Vorschäden) + „Neuer Scan"-Button. **⚠ dieselbe Datei wie C/#4663** (Bind-Widget/Storno) → Merge-Reihenfolge beachten.
- **Flotten-Liste**: **Badge je Fahrzeug** „zuletzt dokumentiert vor X" — grün <3 Mon., amber 3–6, rot >6/nie. Reine Anzeige (Staleness-Berechnung, kein Cron in v1).

## Error-Handling / Konsistenz
- Server-Actions: Result-Object (`{ ok, error? }`), kein `throw`; `revalidatePath` je Write.
- Non-kritische Sub-Ops (einzelner Foto-Upload-Fail, KI-Timeout) fail-soft: der Scan bleibt `offen`+nachholbar, kein harter Abbruch.
- KI-Fehler/Timeout → Review-Schritt zeigt „keine automatische Erkennung, bitte manuell prüfen"; Fotos sind trotzdem gespeichert (Beweis steht auch ohne KI).
- RLS + explizite Ownership-Gates (Admin-Client ohne RLS → Firma-Scope im Code).

## Testing
- **Unit (vitest):** Perspektiven-Set + Vollständigkeits-Check (alle Pflicht-Perspektiven vor Analyse), KI-Output-Parser (JSON→Funde, tolerant), Badge-Staleness (`monateSeit → grün/amber/rot`), Fund→`VehicleDamageInput`-Mapping (pure).
- **Bestand:** `recordVehicleDamage`/`markClaimDamagesAsVorschaden` sind schon getestet.
- **Regel 4 (Prod-Smoke, Test-Fahrzeug, nach Deploy):** FM macht Scan → KI findet/findet-nichts → bestätigen → `vehicle_vorschaeden`-Row (`quelle=zustandsdoku`) erscheint → Badge aktualisiert → bei einem späteren Test-Claim am selben Fahrzeug ist der Vorschaden sichtbar. Wegwerf-Test-Fahrzeug, keine echten Kundendaten.

## Phasing
- **v1** = alles oben (Capture + Storage + Abruf/Badge + sync KI + Human-Confirm + Vorschaden-Link).
- **Phase 3** = 3-Monats-Reminder-Cron (nudged stale Fahrzeuge; VPS-Cron `Etc/UTC`, s. Cron-Konventionen).
- **Phase 4 (nach/​mit dem Cron)** = **NFC-Read in der Karten-Identify-Funktion** (Aaron 21.07.): eingeloggter FM tippt eine Karte an → in-app `NDEFReader.scan()` (Web NFC, **Android-Chrome-only**) liest den Token → springt direkt zur **Fahrzeug-Detail** (wo die Zustandsdoku lebt). QR-Scan (`SchadenkarteScanner` + `identifiziereKarte`) bleibt der **geräteunabhängige Fallback**. **Ergänzt — ersetzt nicht — C's Tap→`/schaden/[token]`-Pfad** (der für **gebundene** Karten das Fahrzeug schon als leichtes Panel zeigt, iOS+Android; Phase 4 = voller In-App-Sprung zur Detail-Seite + schnellerer Weg ohne QR). Betrifft `/flotte/(shell)/karten` (Identify-Sektion) + `SchadenkarteScanner`.
- **Später/optional** = Fahrer-via-Schadenkarte-Einstieg, Tamper-Hashing, Scan-über-Zeit-Vergleich (Diff).

## Risiken / Abgrenzung
- **Keine File-Kollision (Update):** C/#4663 (`4ee16b698`) UND A/#4657 (`444add636`) sind **bereits auf staging** — die B-Basis enthält beide. B baut direkt auf C's Fahrzeug-Detail (Bind-Widget/Storno) auf und hängt die Zustandsdoku-Sektion **daneben**; die Flotten-Liste bekommt den Badge additiv. Kein Merge-Reihenfolgen-Zwang mehr.
- **KI Kosten/Latenz:** sync Batch von ~6–8 Fotos = ein Multi-Image-Claude-Call, wenige Sek + Token-Kosten. Guard: Bildzahl/Auflösung begrenzen (Downscale vor Upload).
- **False Positives:** durch Human-Confirm entschärft (kein Auto-Vorschaden).
- **Mobile Kamera:** `capture="environment"`; iOS/Android-Unterschiede; FileChooser-Regel für Smoke ([[handoff-dedizierte-smoke-session-alle-rollen]]).
- **Kein DB-vor-Code-Bruch:** neue Tabellen sind additiv; Migration vor Consumer-Code applizieren, File nach getrackter Version benennen (Regel 2 Schritt 3+4).
