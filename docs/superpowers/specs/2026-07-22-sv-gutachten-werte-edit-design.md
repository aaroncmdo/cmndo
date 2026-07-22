# SV-Gutachten-Werte-Bearbeitung (S2) — Design

**Datum:** 2026-07-22
**Lane:** b0e963b6 (SV-Claim-Detail-Audit, S2)
**Branch:** `kitta/sv-gutachten-werte-edit`
**Status:** Design freigegeben (Aaron „das passt", 22.07.) — Spec zur Review

## Problem

Der Sachverständige (SV) ist der wertschöpfende Akteur: er ermittelt die Bewertungszahlen eines
Schadens. Heute kann er sie im Portal aber **nicht eingeben oder korrigieren** — die fünf Kernwerte
(Reparaturkosten, Wertminderung/Minderwert, Wiederbeschaffungswert, Restwert, Nutzungsausfall) werden
**ausschließlich per OCR** aus dem hochgeladenen Gutachten-PDF gelesen und dem SV **read-only** in der
`GutachtenCard` angezeigt (Footer: „Falsch? Bitte über die Stellungnahme melden"). Die Stellungnahme ist
ein **PDF-Upload-Workflow, kein Werte-Korrektur-Formular**. Ein OCR-Fehlwert (oder ein fehlender Wert)
ist für den SV also nur über einen schwergewichtigen, unstrukturierten Umweg meldbar.

Eine vollständige manuelle Edit-Maschinerie **existiert bereits — aber nur für Admins**
(`updateGutachtenOcrFelder` + `GutachtenOcrCard`, `rolle==='admin'`-gated; KB/SV explizit ausgeschlossen).

## Ziel

Der SV bekommt in seiner Fallakte eine **eigene, editierbare Werte-Karte**. OCR füllt vor; der SV kann
jeden Wert **eingeben oder korrigieren**; die vom SV bestätigten/geänderten Werte sind **maßgeblich**
(Autorität — Aaron-Entscheid) und werden **sichtbar als „vom Gutachter bestätigt"** markiert (Kunde/KB
sehen, welcher Wert autoritativ ist, nicht nur OCR).

### Nicht-Ziele (YAGNI)
- **Keine** volle Gutachten-Metadaten-Bearbeitung — der SV editiert nur die **Bewertungs-Kernwerte**
  (nicht die ~40 `gutachten_*`-Felder, die die Admin-`GutachtenOcrCard` kann).
- **Keine** neue Audit-History-Tabelle (per-Feld-mit-Actor) — vorhandene Hooks genügen (s.u.).
- **Keine** harten DB-CHECK-Constraints — Validierung bleibt **advisory** (wie im Bestand).
- **Keine** Änderung an der OCR-Pipeline oder der Admin-Karte.
- **Keine** DB-Migration — alle benötigten Spalten existieren.

## Architektur

`GutachtenCard` (SV) vermischt heute zwei Belange: das **PDF** (Download/Version/Rechnung/SV-Honorar)
**und** einen read-only „Aus dem Gutachten erkannt"-Werteblock. Wir **extrahieren die Bewertungs-Kernwerte
in eine neue, editierbare `GutachtenWerteCard`** und **entfernen den read-only-Werteblock aus
`GutachtenCard`** (die behält PDF/Version/Rechnung + Gutachten-Datum + SV-Honorar — alles
Nicht-Bewertungs-Inhalt). Ergebnis: **eine** Heimat für die Werte (keine
Read-only-/Edit-Dopplung), `GutachtenCard` wird schlanker (Single-Responsibility), „separate Karte" wie
gewünscht.

### Komponenten & Datenfluss
- **`GutachtenWerteCard`** (neu, `src/app/gutachter/fall/[id]/_components/`): zeigt die Werte; Modus
  Anzeigen → **Bearbeiten → Speichern** (Zahlen-Inputs). `SectionCard`-basiert (Komponenten-Set-konform).
  Editier-Felder = valuation-Subset (s. Datenmodell). Zeigt bei SV-bestätigten Werten das
  **„vom Gutachter bestätigt"**-Badge.
- **`updateGutachtenWerteSv(claimId, patch)`** (neu, `src/app/gutachter/fall/[id]/actions.ts`):
  SV-Ownership-Gate wie `saveFinVinGutachter` (`faelle_claim_bridge` + `claims.sv_id`) → Whitelist-Filter
  (nur valuation-Subset) → `gutachten_ocr_manuell_ueberschrieben = true` → `createAdminClient()` →
  `rpc('apply_gutachten_ocr', { p_claim_id, p_values })` (**identische Schreib-Maschinerie wie die
  Admin-Action**) → schreibt Provenance in `felder_quelle_jsonb` (`'sv_korrigiert'` je editiertem Feld,
  read-merge-write, um andere Feld-Provenienzen nicht zu clobbern) → `timeline`-Audit-Row →
  `revalidatePath` **SV-Fall + Kunde-Claim** (damit die Kunde-Sicht + Marker aktualisieren). Rückgabe
  `{ ok: boolean; error?: string }` (AGENTS-Pattern).

### Datenmodell (kein Schema-Change)
Alle Werte liegen auf `public.gutachten` (1:1 per `claim_id`), gelesen via RLS-View `v_gutachten_werte`.
Editier-Whitelist (valuation-Subset):

| Feld | Spalte | Typ |
|---|---|---|
| Reparaturkosten netto | `reparaturkosten_netto` | numeric(10,2) |
| Reparaturkosten brutto | `reparaturkosten_brutto` | numeric(10,2) |
| Wertminderung/Minderwert | `minderwert` | numeric(10,2) |
| Wiederbeschaffungswert | `wiederbeschaffungswert` | numeric(10,2) |
| Restwert | `restwert` | numeric(10,2) |
| Nutzungsausfall-Tage | `nutzungsausfall_tage` | integer |
| Nutzungsausfall-Tagessatz | `gutachten_nutzungsausfall_tagessatz_eur` | numeric(8,2) |
| WBW-Dauer (Tage) | `wiederbeschaffungsdauer_tage` | integer |
| Totalschaden | `totalschaden` | boolean |

Provenance-Spalte `felder_quelle_jsonb` (existiert, Kommentar-Intent `'ocr'`/`'ocr_manual_korrigiert'`/
`'manual'` — bisher **kein** Code schreibt sie; wir sind der erste Consumer, Wert `'sv_korrigiert'`).
Schutz-Flag `gutachten_ocr_manuell_ueberschrieben` (bool) verhindert, dass der nächste OCR-Re-Run die
SV-Werte überschreibt.

### Provenance-Marker („vom Gutachter bestätigt")
- **Signal:** ein Bewertungs-Feld gilt als SV-bestätigt, wenn `felder_quelle_jsonb[feld]` mit `'sv'`
  beginnt (von `updateGutachtenWerteSv` gesetzt). Card-Level-Marker = „mindestens ein Kernwert `sv*`".
- **SV-Sicht:** Badge in `GutachtenWerteCard`.
- **Kunde-Sicht:** dezentes Card-Level-Badge in `SaeuleMeinGeld` („vom Gutachter bestätigt"). Dafür
  reicht der Kunde-Loader (`get-kunde-faelle.ts` `gutachtenWerte`-Block) ein abgeleitetes `sv_bestaetigt`
  (bool, aus `felder_quelle_jsonb`) mit durch. **Keine** Brutto-Werte neu exponiert (nur ein Flag).

### Validierung (advisory, nicht blockierend)
Die vorhandenen Regeln aus `src/lib/qc/anomalien.ts` (`berechneGutachtenAnomalien`) inline als **Hinweise**
anzeigen, während der SV editiert: Restwert > WBW → unplausibel; Reparatur > WBW & !Totalschaden →
„wirtschaftlicher Totalschaden?"; Minderwert > WBW → Hinweis; Totalschaden ohne Restwert → Hinweis.
**Nicht blockierend** — der SV kann trotzdem speichern (Bestand-Pattern, „rot blockt nicht").

### Blast-Radius (bewusst begrenzt)
Editieren der Werte ändert **Anzeige/Vorschau**: Kunde-`SaeuleMeinGeld` + `berechneAnspruchVs`
(Anspruchs-Einzelbetrag), Makler-/Finance-Dashboards, Werkstatt-Auftrag-Views, Copilot-Kontext.
**Nicht** die tatsächliche Auszahlung: `auszahlung_kunde_betrag` / `claim_payments` werden **separat**
reguliert und **nicht** aus diesen 5 Werten berechnet. SV-Editieren bewegt also **kein** echtes Geld.

## Betroffene Files & Koordination
- NEU: `.../gutachter/fall/[id]/_components/GutachtenWerteCard.tsx`
- `.../gutachter/fall/[id]/actions.ts` (neue Action)
- `.../gutachter/fall/[id]/_components/GutachtenCard.tsx` (Werteblock raus)
- `.../gutachter/fall/[id]/FallDetailClient.tsx` (neue Karte rendern) — ⚠ **auch von S1 (#4705, meine Lane)
  angefasst** → beim Merge auf disjunkte Regionen achten (S1 = Sidebar-FIN-Card/Imports; S2 = GutachtenCard-Render).
- `.../gutachter/fall/[id]/page.tsx` (Gutachten-Werte + Provenance an die neue Karte durchreichen) —
  ⚠ **aktiv von der `zustandsdoku-sv-galerie`-Lane (63fe43f9) editiert** → koordinieren / Merge-Reihenfolge.
- `.../components/kunde/SaeuleMeinGeld.tsx` + `get-kunde-faelle.ts` (Kunde-Marker + `sv_bestaetigt`-Flag).
- Reuse (kein Change): `anomalien.ts`, `apply_gutachten_ocr`-RPC.

## Error-Handling
Server-Action liefert `{ ok: boolean; error?: string }` (kein throw). Non-critical Sub-Ops
(`timeline`-Insert, `felder_quelle_jsonb`-Write) in try/catch, damit ein Fehlschlag dort den Werte-Save
nicht kippt. Caller (`GutachtenWerteCard`) prüft `res.ok`, zeigt `toast.error(res.error)` + Re-Read via
`router.refresh()`.

## Testing
- **Unit:** Whitelist-Filter (nur valuation-Subset durchgelassen) + die `anomalien.ts`-Regeln (schon
  unit-getestet) — Grenzfälle (Restwert=WBW, Totalschaden-Ableitung).
- **Regel-4 Prod-Smoke** (nach Deploy, `app.claimondo.de`): Wegwerf-SV baut/öffnet einen eigenen Fall mit
  Gutachten → editiert einen Kernwert (z.B. Minderwert) → Save → Wert + „vom Gutachter bestätigt"-Marker
  erscheinen in der SV-Karte; Gegenprüfung Kunde-Sicht (`SaeuleMeinGeld`) zeigt den neuen Wert + Marker.
  Test-Konto `telefon=NULL`. **Kein** echtes Geld bewegt (Blast-Radius s.o.).

## Offene Punkte / Risiken
- `felder_quelle_jsonb` read-merge-write muss atomar genug sein (kurzer Read→Merge→Write mit
  Admin-Client; kein paralleler SV-Save auf denselben Claim erwartet). Alternativ per jsonb-`||`-Merge in
  einem `apply_gutachten_ocr`-Nachbar-RPC — **nur falls** der read-merge-write in der Praxis race-anfällig
  ist (v1: read-merge-write, YAGNI).
- Merge-Koordination `page.tsx`/`FallDetailClient.tsx` (s. Files) mit S1 + 63fe43f9.
