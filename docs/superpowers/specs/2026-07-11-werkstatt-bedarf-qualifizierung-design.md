# Werkstatt-Bedarfs-Qualifizierung (Evidenz-basiert) — Design

**Datum:** 2026-07-11
**Ziel:** Der Werkstatt-Finder soll nur Werkstätten als „passend" behandeln, die den tatsächlich benötigten Reparatur-Bedarf abdecken (Karosserie / Lackierung / Mechanik / Glas / Smart-Repair). Der Bedarf wird **aus Evidenz abgeleitet** (Schadenbild, ggf. Gutachten) statt vom Kunden erraten.
**Herkunft:** Aaron 2026-07-11 — „nicht jede Werkstatt macht Lackierung / Karosserie … das muss durch das Schadenbild erfasst werden oder ggfs durchs Gutachten."

---

## 1. Problem

Der öffentliche Embed-Finder (`sucheEchteWerkstaetten`) übergibt **keine** Schadenskategorie an `findWerkstaetten` → `computePasst` gibt immer `true` → **jede** aktive Werkstatt wird dem Kunden gezeigt, unabhängig davon, ob sie die gebrauchte Arbeit überhaupt anbietet. Die Claim-basierten Finder (Dispatch, Kunde-Portal) reichen zwar `schadenskategorie` durch, aber diese stammt aus einem **manuellen Onboarding-Toggle** — Kunden wissen oft selbst nicht, ob eine Delle „Smart-Repair" oder „Karosserie + Lackierung" braucht.

Zusätzlich behandelt `computePasst` heute **leere Fähigkeiten als „kann alles"** (`faehigkeiten=[] → passt=true`) — es verwechselt **„unbekannt" mit „ja".**

## 2. Ist-Zustand (verifiziert)

**Taxonomie ist bereits einheitlich** (kein Mapping nötig): Werkstatt-Fähigkeit (`FAEHIGKEITEN_VALUES`, `src/app/admin/werkstaetten/actions.ts:32`) und Kunden-Bedarf (`leads/claims.schadenskategorie`-CHECK) nutzen dasselbe Vokabular `karosserie | lackierung | mechanik | glas | smart_repair` (+ `unbekannt`).

**Vorhandene Daten & Muster (Glücksfall — fast alles da):**
- **Schadenfotos:** `fall_dokumente` (`dokument_typ='schadensfoto'`) + Cache `leads.schadensfoto_urls` (jsonb). Erfasst u.a. im Selbstzahler-Flow (`src/app/kunde/faelle/[id]/schadensfoto-actions.ts:21`).
- **Vision-Muster (wiederverwendbar):** `src/lib/ai/vision/analyze-unfallfotos.ts:34` (Fotos → Claude → Schadenbeschreibung) + `getAnthropicVisionClient()` / `buildImageBlocks()` (`src/lib/ai/vision/client.ts:21,27`).
- **Gutachten strukturiert ge-OCR't** in claims-Spalten (`src/lib/ai/gutachten-ocr.ts:117-155`): `gutachten_zeit_kar_std`, `gutachten_zeit_lack_std`, `gutachten_zeit_ak_std` (Stunden je Gewerk), `gutachten_karosseriezustand`, `kalkulationssystem`. Fertig-Flag: `auftraege.gutachten_final_freigegeben`.
- **schadenskategorie:** heute NUR manuell (Onboarding-Toggle), keine programmatische Ableitung.

**Finder-Aufrufer (Bedarf durchgereicht?):**
| Aufrufer | Datei | kategorie? |
|---|---|---|
| `sucheEchteWerkstaetten` / `sucheWerkstaettenNachOrt` (Embed) | `src/app/embed/werkstatt-finder/actions.ts:92,107` | **NEIN** |
| `findReparaturWerkstaettenForTarget` (Dispatch, Kunde-Portal) | `src/lib/werkstatt/vermittlung-server.ts:82` | JA (liest `schadenskategorie`) |

## 3. Architektur — ein Resolver + ein Qualifizierer

```
Evidenz ──► ermittleReparaturbedarf() ──► Reparaturbedarf ──► qualifiziereWerkstaetten() ──► Finder-UI
(Gutachten/Foto/…)   (Resolver, SSoT)     {kategorien,quelle,          (3-Zustand,
                                            confidence}              confidence-gated)
```

Der Finder konsumiert **nur** `Reparaturbedarf` — quellen-agnostisch. Eine Ableitungs-Stelle, ein Konsument.

## 4. Der Resolver — `ermittleReparaturbedarf`

**Neu:** `src/lib/werkstatt/bedarf/types.ts`
```ts
export type Gewerk = 'karosserie' | 'lackierung' | 'mechanik' | 'glas' | 'smart_repair'
export type BedarfQuelle = 'gutachten' | 'schadenbild' | 'kva' | 'manuell' | 'unbekannt'
export type Reparaturbedarf = {
  kategorien: Gewerk[]   // benötigte Gewerke; [] = unbekannt
  quelle: BedarfQuelle
  confidence: number     // 0..100 (Gutachten=100, Foto=Modell-conf, manuell≈40, unbekannt=0)
}
```

**Neu:** `src/lib/werkstatt/bedarf/ermittle-bedarf.ts`
```ts
export async function ermittleReparaturbedarf(
  sb: Sb, ctx: { claimId?: string; leadId?: string },
): Promise<Reparaturbedarf>
```

**Eskalation nach Evidenzstärke (erste Quelle mit Ergebnis gewinnt):**
1. **Gutachten** — wenn `auftraege.gutachten_final_freigegeben` für den Claim → `deriveGewerkeAusGutachten(claimRow)` (reine Logik). `quelle='gutachten'`, `confidence=100`.
2. **Schadenbild** — sonst wenn Schadenfotos vorhanden → `klassifiziereSchadenbild(urls)` (Vision). `quelle='schadenbild'`, `confidence=` Modell-Wert.
3. **KVA** — (Inc-3/später) Kostenvoranschlag-PDF → OCR-Positionen.
4. **Manuell** — sonst wenn `schadenskategorie` gesetzt → diese. `quelle='manuell'`, `confidence≈40` (bewusst < Hart-Schwelle → nur weiches Signal, nie Hart-Filter; respektiert „Kunden-Rätselraten nicht vertrauen").
5. **Unbekannt** — sonst `{ kategorien: [], quelle: 'unbekannt', confidence: 0 }`.

**Caching:** Ergebnis wird auf claim/lead persistiert (§7) und bei neuer Evidenz neu berechnet (idempotent via `bedarf_ermittelt_am`-Guard, Muster wie `gutachten_ocr_processed_at`). Gutachten-Pfad ist billig (reine Logik) → darf live gerechnet werden; Vision-Pfad ist teuer → Cache verbindlich.

### 4a. Gutachten-Ableitung (rein, TDD)
`src/lib/werkstatt/bedarf/gutachten-gewerke.ts`
```ts
export function deriveGewerkeAusGutachten(g: {
  zeit_kar_std: number | null; zeit_lack_std: number | null; zeit_ak_std: number | null
}): Gewerk[] {
  const out: Gewerk[] = []
  if (num(g.zeit_kar_std) > 0) out.push('karosserie')
  if (num(g.zeit_lack_std) > 0) out.push('lackierung')
  if (num(g.zeit_ak_std) > 0) out.push('mechanik')
  return out
}
```
**Verifizieren bei Implementierung:** Semantik von `gutachten_zeit_ak_std` (AK = Arbeit/Mechanik?) gegen `gutachten-ocr.ts` System-Prompt. **Bekannte Grenze:** `glas` und `smart_repair` stehen NICHT direkt in den Stunden-Spalten → bei reinem Gutachten-Pfad werden sie nicht abgeleitet; solche Bedarfe kommen über den Foto-Pfad oder bleiben unbekannt. Akzeptiert (der 3-Zustand fängt es ab).

### 4b. Schadenbild-Ableitung (Vision)
`src/lib/werkstatt/bedarf/schadenbild-gewerke.ts`
```ts
export async function klassifiziereSchadenbild(urls: string[]): Promise<{ kategorien: Gewerk[]; confidence: number }>
```
Wiederverwendet `getAnthropicVisionClient()` + `buildImageBlocks(urls)`. Strukturierter JSON-Output: `{ kategorien: Gewerk[], confidence: 0..100, begruendung: string }`. **Fail-safe:** Client=null / Parse-Fehler / leer → `{ kategorien: [], confidence: 0 }` (→ unbekannt-Zustand, nie falsch-positiv filtern).

## 5. Der Qualifizierer — 3-Zustand, confidence-gated

**Rein (TDD):** `src/lib/werkstatt/bedarf/fit.ts`
```ts
export type Fit = 'passt' | 'passt_nicht' | 'unbekannt'
export function computeFit(faehigkeiten: Gewerk[] | null | undefined, bedarf: Gewerk[]): Fit {
  if (bedarf.length === 0) return 'unbekannt'                 // Bedarf unbekannt
  if (!faehigkeiten || faehigkeiten.length === 0) return 'unbekannt'  // Fähigkeiten unbekannt (≠ „kann alles")
  return bedarf.every((b) => faehigkeiten.includes(b)) ? 'passt' : 'passt_nicht'
}
```
Bedarf = **Menge**; Werkstatt qualifiziert nur, wenn sie **alle** Gewerke abdeckt (`every`).

**Hybrid-Anwendung (confidence-gated):** `qualifiziereWerkstaetten(rows, bedarf, opts)`
- Annotiert jede Zeile mit `fit`.
- **Confidence ≥ HART_SCHWELLE (60)** UND Bedarf bekannt:
  - `sichtbar = rows.filter(fit !== 'passt_nicht')` (also `passt` + `unbekannt`).
  - `sichtbar.length ≥ MIN_TREFFER (1)` → nur `sichtbar`, sortiert: `passt` vor `unbekannt`, dann Distanz.
  - sonst → **graceful Fallback**: ALLE zeigen, Flag `keineSpezialisierte=true` (UI: „Keine spezialisierte Werkstatt in der Nähe — hier die nächsten").
- **Confidence < HART_SCHWELLE** ODER Bedarf unbekannt → **weich**: ALLE zeigen, `fit` nur als Anzeige-Signal, Distanz-sortiert (keine Werkstatt wegen wackliger KI verstecken).
- `unbekannt`-Werkstätten werden **nie** hart gefiltert.

Konstanten (`HART_SCHWELLE=60`, `MIN_TREFFER=1`) zentral + überschreibbar. Gutachten (conf 100) filtert immer hart; Foto-KI nur bei ≥60.

## 6. Fit-Anzeige (UI)

In der Finder-Card (`src/components/werkstatt/finder/WerkstattFinder.tsx`, am Namen — Inc 1 Claim-Finder, Inc 2 Embed):
- `passt` → grüner Chip „✓ Macht [Gewerke]".
- `unbekannt` → neutraler Chip „Leistungen auf Anfrage".
- `passt_nicht` → im Hart-Modus ausgeblendet; im Weich-Modus grauer Chip „bietet [X] nicht an".
- `keineSpezialisierte` → Hinweis-Banner über der Liste.

## 7. Datenmodell (DDL via Supabase-Plugin, Regel 2)

Persistiere abgeleiteten Bedarf auf **claims** und **leads** (leads für pre-claim/Embed):
```sql
ALTER TABLE claims ADD COLUMN bedarf_kategorien text[],  -- abgeleitete Gewerke
  ADD COLUMN bedarf_quelle text,                          -- BedarfQuelle
  ADD COLUMN bedarf_confidence int2,                      -- 0..100
  ADD COLUMN bedarf_ermittelt_am timestamptz;             -- Idempotenz/Staleness
-- analog leads.*
```
Kein CHECK auf `bedarf_kategorien`-Werte (Type-Lag-Idiom wie `faehigkeiten`), Validierung im TS-Layer.
**Schreib-Trigger:** (a) nach Gutachten-OCR (`extractGutachtenAndSaveToClaim` erweitern) → optional persistieren; (b) nach Foto-Analyse (`appendUnfallfotoAndAnalyze` erweitern) → Vision-Ergebnis persistieren.

## 8. Integration

- `findWerkstaetten` / `findReparaturWerkstaettenForTarget`: Signatur `kategorie?: string` → **zusätzlich** `bedarf?: Reparaturbedarf`; intern `qualifiziereWerkstaetten` statt nur `computePasst`-Sort. `kategorie` bleibt für Rückwärtskompatibilität (mappt auf `{kategorien:[kategorie], quelle:'manuell', confidence:40}`).
- **Claim-Finder** (Inc 1): `getWerkstaettenNah` (Dispatch), `ladeWerkstaettenFuerClaim` (Kunde-Portal) → `ermittleReparaturbedarf(claimId)` → durchreichen.
- **Embed** (Inc 2): `sucheEchteWerkstaetten` bleibt in Inc 1 unverändert (unbekannt-Zustand = kein Regress). Inc 2 baut den Foto-Nudge-Funnel.

## 9. Staffelung

- **Inc 1 (Kern-Engine + Claim-Finder):** `bedarf/types` + Resolver (Gutachten-Logik + Schadenbild-KI + Fallback) + `computeFit` + `qualifiziereWerkstaetten` + DDL-Spalten + Verdrahtung Claim-Finder + Fit-Anzeige (Kunde-Portal/Dispatch) + Tests. Embed unverändert (kein Regress). **Liefert:** scharfe Werkstatt-Listen überall dort, wo Evidenz existiert.
- **Inc 2 (Embed-Funnel):** Foto-Nudge im Embed → Vision → Qualifizierung. Adressiert Aarons Ursprungs-Fall (Standalone-Finder). Braucht Inc-1-Engine.
- **Inc 3 (Datenbasis, Fork 2):** Werkstatt-Selbstauskunft (Onboarding/Portal) + „verifiziert"-Marker. ⚠ berührt Werkstatt-Portal → Koordination (aktuell frei, 6c630247 ist auf i18n gewechselt).

## 10. Test-Strategie

- **Rein/TDD:** `deriveGewerkeAusGutachten` (Stunden→Gewerke, null/0-Kanten), `computeFit` (3-Zustand-Matrix inkl. leer-Fähigkeiten=unbekannt), `qualifiziereWerkstaetten` (Hart bei conf≥60 & Treffer; Fallback bei 0 Treffern; Weich bei conf<60; unbekannt nie gefiltert), Confidence-Schwellen.
- **Vision (gemockt):** JSON-Parse + Fail-safe (Client-null/Parse-Fehler/leer → unbekannt).
- **Resolver:** Eskalations-Reihenfolge (gutachten > foto > manuell > unbekannt), Idempotenz-Cache.

## 11. Gelockte Entscheidungen & offene Punkte

**Gelockt:**
- 3-Zustand-Hybrid, confidence-gated (Aaron Fork 1).
- Bedarf = Menge, Werkstatt muss ALLE Gewerke abdecken (`every`).
- Manueller Toggle = nur weiches Signal (conf≈40 < Hart-Schwelle), kein Hart-Filter.
- `smart_repair`/`glas` nicht aus Gutachten-Stunden ableitbar → Foto/unbekannt. MVP: 5 Kategorien als flache Menge, exakter Match; Subsumption (`smart_repair`-Fähigkeit deckt leichte `karosserie`) später.
- DDL via Supabase-Plugin (Regel 2). Feature-Branch off staging.
- Selbstauskunft/Verifizierung = Inc 3 (nach Finder).

**Offen (Implementierung/Aaron):**
- `HART_SCHWELLE`-Wert (Vorschlag 60) — nach Foto-KI-Validierung feinjustieren.
- Semantik `gutachten_zeit_ak_std` (verifizieren) + welches Vision-Modell (Vorschlag: bestehendes `AI_MODELS.vision_schadenbeschreibung`).
- Gutachten-Bedarf live rechnen vs. persistieren (Vorschlag: Gutachten live, Foto cachen).

---

## Koordination

Resolver + Finder-Logik + Claim-Finder-Verdrahtung = eigene Lane, aktuell kollisionsfrei (6c630247 von werkstatt-hp auf i18n gewechselt). Inc 3 (Werkstatt-Portal-Selbstauskunft) braucht später Portal-Koordination. Marker: `[[coordination-partner-tier-badge]]` (Nachbar-Lane: der Tier-Rang-Badge, der im selben Finder nach der Qualifizierung reiht).
