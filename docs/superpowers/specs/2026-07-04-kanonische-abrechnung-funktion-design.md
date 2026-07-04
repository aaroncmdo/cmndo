# Kanonische Abrechnungs-Funktion (P2) — Design

**Datum:** 2026-07-04
**Status:** Design / Spec (brainstorming — wartet auf Aaron-Review vor writing-plans)
**Branch:** `kitta/kanonische-abrechnung-funktion`
**Vorgänger:** P1 (PR #3625, READ-Cockpit) — dieselbe Billing-Domäne, WRITE-Seite.

## 1. Kontext & Ziel

Die Rechnungs-**Generierung** ist über 5 App-Code-Generatoren dupliziert (verifiziert 2026-07-04 via Explore). Jeder re-implementiert dasselbe Skelett: Netto summieren → MwSt → Nummer → Header-Insert → Positionen → Mark-as-billed. Geteilt sind heute nur zwei orthogonale Primitives (der Nummern-Counter `nextRechnungsNrRaw`, AAR-948; die Rate-Konstanten `FINANCE.*`, a72fb7c88). Das **Compute-und-Insert-Skelett ist NICHT geteilt**.

**Konkreter Schaden — die MwSt ist inkonsistent + z.T. falsch:** 4/5 Generatoren rechnen inline-Float (`Math.round(netto*19/100*100)/100`), das um bis zu 1 Cent von der korrekten Cent-Rechnung driftet; `abrechnungen-generator.ts` hardcodet sogar `19` statt `FINANCE.MWST_PROZENT` für den Header-UStBetrag (die a72fb7c88-Konsolidierung hat diese 2 Literale verpasst). Nur `create-onboarding-rechnung.ts` nutzt den korrekten Cent-Pfad `calculateUst`.

**Ziel:** Eine kanonische **`createAbrechnung()`**, durch die ALLE Rechnungs-Erzeugung läuft (Aaron: „einzelne Rechnungen, aber in einer Funktion"). Descriptor-getrieben, damit sie klein bleibt statt Monster-Switch. Vereinheitlicht das geld-kritische Skelett + fixt die MwSt auf den Cent-Pfad.

## 2. Scope

**In-Scope:** Eine `createAbrechnung(db, descriptor, input)` für das geld-kritische Skelett (Netto→MwSt-Cent-Pfad→Nummer→Header-Insert→Positionen-Insert→Mark). Per-Rolle-Descriptors für die 5 Generatoren. Inkrementelle Migration aller 5 mit Golden-Tests. **Kein DDL** (reiner Code-Refactor, bestehende Tabellen).

**Out-of-Scope (bewusst per-Caller / separat):**
- **Eligibility + Rate + Positionen-Bauen** — genuin rollen-spezifisch (SV liest andere Quellen als Kanzlei); bleibt im Caller, der fertige `positionen` übergibt.
- **Send** (PDF/Email/Magic-Link, in-band vs deferred) — am divergentesten, nicht geld-kritisch-geteilt; bleibt im Caller (Aaron-Entscheidung). `createAbrechnung` gibt den Datensatz zurück, der Caller versendet.
- **System-A-Retirement:** `abrechnungen-generator.ts` (Kanzlei System A, `monats-abrechnungen`) und `erstelle-abrechnung.ts` (Kanzlei System B, `abrechnung-kanzlei-erstellen`) generieren BEIDE live Kanzlei-Rechnungen in verschiedene Tabellen. P2 migriert beide auf `createAbrechnung` (eigene Descriptors); OB System A stillgelegt wird = separate Entscheidung (flaggen, nicht erzwingen).
- **DB-Trigger-Provisionen** (Makler/Werkstatt) + `process-case-billing.ts` (Preisberechnung, keine Rechnung) — kein Teil der 5 Generatoren.

## 3. Architektur (freigegeben)

Eine Funktion trägt das geteilte Skelett einmal; die Divergenzen werden zu **Daten** (ein `descriptor` pro Rolle). Eligibility/Rate/Positionen + Send bleiben im Caller.

```
Caller (rollen-spezifisch):  Eligibility → Rate → positionen[] bauen  ─┐
                                                                        ├→ createAbrechnung(db, descriptor, {positionen, kontext})
descriptor (deklarativ pro Rolle): Tabelle/Format/Dedup/Mark ──────────┘        │
                                                                                 ├→ dedup → Netto(Cent) → calculateUst → Nummer
                                                                                 │   → Header-Insert → Positionen-Insert → Mark
                                                                                 ▼
Caller:  Send (PDF/Email/Magic-Link)  ◀── { id, nummer, betraege }
```

## 4. Contract (Descriptor + Signatur)

```ts
// Positionen trägt der Caller bei — Netto in CENT (via eurToCent) + rollen-spezifische Felder.
interface AbrechnungInput {
  positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>
  kontext: Record<string, unknown>   // jahr/monat/empfaenger/... — an die Descriptor-Callbacks gereicht
}
interface BerechneteBetraege {
  nettoCent: number; ustCent: number; bruttoCent: number; ustSatz: number; nummer: string
}
interface AbrechnungDescriptor {
  zielTabelle: string                 // 'abrechnungen' | 'kanzlei_abrechnungen' | 'sv_onboarding_rechnungen'
  positionenTabelle: string | null    // Audit-Tabelle oder null (dann Positionen nur als Header-JSONB)
  positionsFkSpalte: string | null    // FK der Positionen auf den Header (z.B. 'abrechnung_id')
  ustSatz?: number                    // default 19
  nummer: (kontext) => { serie: string; jahr: number; format: (jahr: number, lfdNr: number) => string }
  buildHeaderRow: (b: BerechneteBetraege, positionen, kontext) => Record<string, unknown>  // Cent→Tabellen-Einheit-Mapping
  buildPositionRow?: (position, headerId: string, kontext) => Record<string, unknown>       // null-Tabelle → nicht aufgerufen
  pruefeBestehend?: (db, kontext) => Promise<string | null>   // existierende id oder null (Dedup)
  markiere?: (db, headerId: string, positionen, kontext) => Promise<{ ok: boolean; error?: string }>
}
async function createAbrechnung(db, descriptor: AbrechnungDescriptor, input: AbrechnungInput): Promise<
  | { ok: true; erstellt: true; id: string; nummer: string; betraege: BerechneteBetraege; markiertOk: boolean }
  | { ok: true; erstellt: false; bestehendeId: string }   // Dedup-Treffer
  | { ok: false; error: string }
>
```

**Ablauf in `createAbrechnung`:**
1. `descriptor.pruefeBestehend?` → bei Treffer `{ ok:true, erstellt:false, bestehendeId }`.
2. `nettoCent = Σ positionen.betrag_netto_cent` (Integer-Summe, **kein Float-Akku**).
3. `{ ustCent, bruttoCent, ustSatz } = calculateUst(nettoCent, descriptor.ustSatz ?? 19)`.
4. Nummer: `nextRechnungsNrRaw(serie, jahr)` → `format(jahr, lfdNr)`.
5. `buildHeaderRow(betraege, positionen, kontext)` → Insert in `zielTabelle` → `id`.
6. Falls `positionenTabelle`: `buildPositionRow` je Position (FK=id) → Insert.
7. `descriptor.markiere?` → `markiertOk` (Fehler wird geloggt, nicht geworfen; Dedup-Guard fängt Re-Run — Lehre aus #3586).
8. Rückgabe `{ ok:true, erstellt:true, id, nummer, betraege, markiertOk }`. Bei jedem DB-Fehler `{ ok:false, error }`.

## 5. MwSt-Cent-Pfad (Korrektheits-Kern)

Alle Rollen rechnen über `calculateUst(nettoCent, ustSatz)` aus `src/lib/billing/calculate-ust.ts` (Integer-Cent: `ust = Math.round(netto*satz/100)`, `brutto = netto+ust`). Das ersetzt die 4 inline-Float-Pfade + das hardcodete `19`.

**⚠️ Geld-Verhaltensänderung (bewusst):** Für Summen-Nettos mit fraktionalen Cent ändert sich der berechnete Brutto um **≤1 Cent** (in die *korrekte* Richtung). Bei ganz-Euro-Nettos (150/200/70 …) ist die Rechnung identisch. Golden-Tests dokumentieren jede Differenz explizit als beabsichtigte Korrektur.

## 6. Per-Generator-Descriptors (verifiziert)

| Generator | zielTabelle | Nummer-Format | positionenTabelle | Dedup | markiere |
|---|---|---|---|---|---|
| **1 SV-Monat** `abrechnung-erstellen` | `abrechnungen` (typ=sv) | `CMNDO-{jahr}-{MM}-{pad4}` (serie `CMNDO-{MM}`) | `abrechnung_positionen` + Header-JSONB | LIKE `CMNDO-{jahr}-{MM}-%` + empfaenger_id + ≠storniert (Orphan-Relink) | `claims.abrechnung_id` |
| **2 Embed** `embed-abrechnung-erstellen` | `abrechnungen` (typ=sv) | `CMNDO-EMB-{jahr}-{MM}-{pad3}` | `embed_abrechnung_positionen` (UNIQUE anfrage_id) | LIKE `CMNDO-EMB-{jahr}-{MM}-%` + view abrechnung_id null | `gutachter_finder_anfragen.abrechnung_id/abgerechnet_am` |
| **3 Kanzlei-B** `erstelle-abrechnung.ts` | `kanzlei_abrechnungen` | `CMNDO-K-{jahr}-{MM}-{pad3}` | `kanzlei_abrechnung_positionen` | kanzlei_id+abrechnungsmonat+jahr | `claims.kanzlei_abrechnung_id`+`kanzlei_provision_status` |
| **4 Marketing/Kanzlei-A** `abrechnungen-generator.ts` | `abrechnungen` (typ=marketing/kanzlei) | `CL-{jahr-MM}-{TYP}-{pad3}` | **null** (Positionen nur Header-JSONB) | empfaenger_typ + zeitraum_start/ende + ≠storniert | keine (status=entwurf) |
| **5 Onboarding** `create-onboarding-rechnung.ts` | `sv_onboarding_rechnungen` (**CENT**-Spalten) | `CM-ONB-{jahr}-{pad5}` | null | upstream (stripe_session UNIQUE) | keine |

**Einheiten-Wrinkle:** #5 speichert Cent-Spalten (`netto_cent`), #1-4 Euro-Spalten (`summe_netto`). `createAbrechnung` rechnet intern in Cent; `buildHeaderRow` mappt auf die Tabellen-Einheit (Cent für #5, `centToEur` für #1-4).

## 7. Inkrementelle Migration + Golden-Test-Protokoll

**Reihenfolge nach Risiko** (jede = ein Task, ein Commit, eigener Golden-Test):
1. **Onboarding** — nutzt schon den Cent-Pfad → reiner Struktur-Umbau, **0 Betrags-Änderung** = sicherster Erst-Beweis, dass der Descriptor-Mechanismus stimmt.
2. **Embed** — einfachster Float-Generator (1 Rate, 1 Sub-Pfad).
3. **SV-Monat** — individual + Org-Sammelrechnung (2 Sub-Pfade, gleicher Descriptor).
4. **Kanzlei-B** — eigene Tabelle, PDF-Send (bleibt im Caller).
5. **Marketing/Kanzlei-A** — das hardcodete `19` (die eigentliche Bug-Korrektur) + JSONB-only-Positionen.

**Golden-Test je Migration:** fixer Input → (a) Output des ALTEN Codes, (b) Output über `createAbrechnung`; assert Gleichheit **außer** dem dokumentierten MwSt-Cent-Fix. Ganz-Euro-Fälle byte-gleich; fraktionale Fälle dokumentieren den ≤1-Cent-Shift. So ist jede Migration verhaltens-erhaltend modulo der einen beabsichtigten Korrektur.

## 8. Tests
- **vitest `createAbrechnung`** (Fake-DB): Dedup-Skip, Netto-Cent-Summe, `calculateUst`-Integration, Nummer-Allokation, Header+Positionen-Insert-Calls, `markiere`-Hook + `markiertOk`, DB-Fehler→`{ok:false}`.
- **Golden-Tests** je Generator (§7).
- **MwSt-Drift-Tests:** repräsentative Nettos (ganz-Euro = identisch; fraktional = ≤1-Cent-Fix belegt).
- **Gates:** tsc · build (Routen: die 4 Cron-Routes + monats-abrechnungen) · knip · token-audit · component-set · vitest.

## 9. Files
- **Neu:** `src/lib/abrechnung/create-abrechnung.ts` (Funktion + Descriptor-Typ), `src/lib/abrechnung/descriptors.ts` (5 Descriptors) — oder Descriptor je Generator lokal.
- **Modifiziert:** die 5 Generatoren (je Migration auf `createAbrechnung`), evtl. deren Cron-Routes (Positionen-Bauen bleibt, Skelett-Call ersetzt).
- **Reuse:** `calculate-ust.ts` (`calculateUst`/`eurToCent`/`centToEur`), `generate-rechnungs-nr.ts` (`nextRechnungsNrRaw`), `constants.ts` (`FINANCE`).

## 10. Risiken / offene Punkte
- **Geld-Pfad live:** jede Migration verhaltens-erhaltend (Golden-Test) außer dem MwSt-Fix; inkrementell, ein Generator pro Commit, einzeln reviewbar/rollback-bar.
- **Multi-Session:** Billing-Files sind heiß (mehrere Sessions). Vor jeder Generator-Migration Branch-Aktualität prüfen; additive/isolierte Änderungen.
- **System-A-vs-B-Kanzlei:** beide live migrieren; Retirement separat entscheiden.
- **`markiertOk`-Semantik:** Mark-Fehler nicht fatal (Dedup fängt Re-Run) aber geloggt — bewahrt die #3586-Lehre (ungeprüfte Markierung → Doppel-Rechnung).

## 11. Terminaler Schritt
Nach Aaron-Review → `writing-plans` für den Task-Plan (ein Task je Migration + der `createAbrechnung`-Kern zuerst).
