# Assistierte QC-Review (Filmcheck #7) — Design

**Datum:** 2026-06-29
**Herkunft:** Filmcheck-Audit 29.06. (Tier-3-#7). Ziel: der KB soll beim Filmcheck nicht „blind abnicken" — die QC-Checks werden, wo aus vorhandenen Daten ableitbar, **auto-vorbefüllt**, und die **Evidenz** (Gutachten-PDF, später OCR-Werte) kommt in die QC-Karte.

## Kernbefund (Brainstorm 29.06.)

Das OCR-Feld ist ein **verwirrtes, in Prod ungenutztes Doppelsystem**:
- **Alt** (`GutachtenOcrCard.tsx`): Felder `reparaturkosten_netto`/`gutachten_fin`/`gutachten_vorschaeden_text`/…; Kommentar „OCR läuft nach QC-Freigabe".
- **Neu AAR-838** (`src/lib/gutachten/ocr-actions.ts`): `uploadGutachtenPdf` triggert die Edge-Function `gutachten-ocr` **`auto_after_upload`** (beim Upload); Felder `bericht_pdf_url`/`felder_quelle_jsonb`/`ocr_runs`/`gutachten_positionen`/`gesamt_schadensbetrag`.
- **Prod (29.06.):** 3 Gutachten, **0 OCR je gelaufen**, 0 `bericht_pdf_url`, 0 `gesamt_schadensbetrag`. Komplett pre-launch.

→ „OCR vorziehen" ist teils schon gebaut (AAR-838), aber unklar welches System kanonisch ist. **Auf diesem Fundament OCR-gestützt zu bauen wäre nicht sauber.** Entscheidung Aaron 29.06.: **(1) Core ohne OCR jetzt bauen; (2) das OCR-Doppelsystem danach UNBEDINGT sauber konsolidieren (feste Phase 2), DANN die OCR-Schicht.**

## Architektur

Drei Schichten, klar getrennt:

### Phase 1 — OCR-unabhängiger Core (DIESE Strecke)
Reine Auto-Ableitungs-Funktion + QC-Karten-Integration. Keine OCR-Abhängigkeit.

**1a — `src/lib/qc/auto-checks.ts` (rein, TDD):**
```ts
export type QcAutoInput = {
  gutachtenUrlVorhanden: boolean          // auftraege.gutachten_url gesetzt
  vorschaedenGeprueft: boolean | null     // claims.vorschaden_geprueft
  saVorhanden: boolean                    // pflichtItems: sa_vollmacht | sv_sicherungsabtretung vorhanden
  vollmachtVorhanden: boolean             // pflichtItems: halter_vollmacht | gf_vollmacht | sa_vollmacht vorhanden
}
// -> nur die SICHER ableitbaren Checks; Rest bleibt undefined (= KB-Urteil).
export function berechneQcAutoChecks(input: QcAutoInput): Partial<Record<QcFieldKey, boolean>>
```
Ableitbare Checks (Phase 1a): `gutachten_vorhanden`, `vorschaeden_beruecksichtigt`, `sa_vorhanden`, `vollmacht_vorhanden` (= **4 von 9**).

**Bewusst NICHT in Phase 1a** (Quelle unklar → nicht raten, sonst falsches Auto-Häkchen):
- `fin_17_zeichen` — `claims.fin` existiert nicht (post-CMM-49 Vehicle-Entity). → Phase 1b wenn FIN-Quelle bestätigt.
- `kundendaten_vollstaendig` — „komplett"-Kriterium undefiniert. → Phase 1b.
- `gutachten_vollstaendig`, `fotos_ausreichend` — echtes KB-Urteil, bleibt manuell.
- `schadenspositionen_erfasst` — OCR-abhängig → Phase 3.

**1c — QC-Karte (`QcChecklisteBlock.tsx`):**
- Init der Check-States aus **gespeichert ODER auto** (`saved ?? auto ?? null`) — KB-Eingabe gewinnt immer über Auto.
- Auto-vorbefüllte Felder tragen ein **„auto"-Badge** (transparent, kein verstecktes Häkchen). KB kann jederzeit überschreiben (Tri-State bleibt editierbar).
- **PDF-Evidenz**: prominenter „Gutachten öffnen"-Link/Vorschau in der Karte (Quelle: erstgutachten `gutachten_url`).
- Der Pflicht-Check-Gate aus #3326 (`qcChecklisteVollstaendig`) bleibt: Auto-Häkchen füllen die meisten Pflichtfelder, KB setzt die manuellen, dann ist „bestanden" frei.

**1d — Datenfluss:** `page.tsx` (hat `pflichtdokumente` + claims + erstgutachten) berechnet `QcAutoInput` → `berechneQcAutoChecks` → reicht `autoChecks` + `gutachtenUrl` über `DokumenteTab` an `QcChecklisteBlock`.

### Phase 2 — OCR-System konsolidieren (UNBEDINGT, vor der OCR-Schicht)
Eigener Audit + Entscheidung (analog zur QC-System-Konsolidierung):
1. Audit: welches der zwei OCR-Systeme ist kanonisch? Was triggert wann, welche Felder schreibt jedes, welche Reader hängen dran (`GutachtenOcrCard` liest das ALTE Set).
2. EIN System festlegen (Empfehlung: AAR-838 `ocr_runs`/`gutachten_positionen` = neuer, upload-getriggert, run-versioniert) + den anderen Reader (`GutachtenOcrCard`) darauf umstellen oder retiren.
3. Sicherstellen: OCR triggert beim **Gutachten-Abgeben** (idempotent, Re-Run bei Nachbesserung), nicht pro File-Upload (Kosten) — knüpft an die `gutachtenAbgeben`-Strecke (#3326).
4. Migration/Backfill falls nötig (pre-launch 0 Rows → risikoarm).

### Phase 3 — OCR-Schicht auf #7 (nach Phase 2)
- OCR-Werte (Schadenssumme/Reparaturkosten/Restwert/WBW/Totalschaden) als **read-only Evidenz-Panel** in der QC-Karte (kuratierter Subset, nicht der Admin-OCR-Editor) — für KB sichtbar machen (heute `GutachtenOcrCard` admin-only via `getClaimForRole`-Stripping).
- `schadenspositionen_erfasst` aus OCR auto-ableiten; ggf. `gutachten_vollstaendig` per Seitenzahl-Heuristik hinten.

## Error-Handling / Edge-Cases
- Auto-Ableitung ist **best-effort + read-only**: ein false-Auto (z.B. Vollmacht fehlt) zeigt „Nein" (rot) → der Pflicht-Gate blockt „bestanden" bis KB es adressiert/überschreibt. Korrektes Verhalten (kein Durchwinken eines unvollständigen Falls).
- Kein Auto überschreibt je einen gespeicherten KB-Wert.
- Fehlt `pflichtItems` (Edge), sind sa/vollmacht-Auto schlicht `false` → KB setzt manuell.

## Testing
- `auto-checks.test.ts` (Phase 1a): jede Ableitung + „nur sichere Felder, Rest undefined" + Mapping-Tabelle (sa/vollmacht aus den richtigen Slots).
- QC-Karten-Init (saved ?? auto) — Komponenten-Logik, per reiner Helper-Funktion testbar gehalten.
- tsc + token-audit/component-set Ratchets (QcChecklisteBlock ist `.tsx`).

## Scope-Grenze
Phase 1 = diese Strecke. Phase 2 (OCR-Konsolidierung) = **fest eingeplant**, eigener Spec/Branch. Phase 3 hängt an Phase 2.
