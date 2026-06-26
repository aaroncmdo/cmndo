# Pflichtdokument-Kanonisierung — Design (2026-06-26)

## Problem

Es existieren **vier divergierende Definitionen**, welche Pflichtdokumente ein Claim
erwartet (Audit + Smoke-Paket PR #3202):

1. `src/lib/claims/data-requirements.ts` `DOC_DEFINITIONS` (8 hardcodierte Slots) →
   `getOffeneDokumentAnforderungen` = **operative Anzeige** (Kunde-Onboarding-Wizard,
   SV/KB-Fallakte, Banner).
2. `src/lib/dokumente/erwartung.ts` `berechneErwartung` (Lead-Flags → Slots) =
   dokumentierte „SSoT", genutzt von Dispatch-`DokumenteAnfordernCard`.
3. `dokument_katalog` (DB, Rule-DSL `freigeschaltet_wenn`/`pflicht_wenn`) →
   `katalog.ts` Helper → Flow-Anlage + Kunde-Step-4 „freie Slots".
4. `src/lib/dokumente/create-pflicht.ts` `createPflichtdokumenteFromKatalog` —
   Katalog-Loop entfernt, legt nur 5 Supplementär-Slots an.

Folge (verifizierte Drifts): Leasing→`freigabe_bank` fehlt in operativer Anzeige;
Fahrerflucht→`polizeibericht` unsichtbar; `diagnosebericht`-Pflicht widersprüchlich;
Zeugen-Slot-ID-Mismatch (`zeugenaussage` vs `zeugenbericht`); Vorschäden-Docs fehlen;
`convertLeadToClaim`-Claims bekommen gar keine Pflichtdokumente.

## Ziel

**`dokument_katalog` (DB) wird die einzige Quelle der Wahrheit.** Operative Anzeige,
Pflichtzeilen-Anlage und Dispatch-Erwartung leiten alle daraus ab. Die 8 Hardcodes
verschwinden. Drift wird strukturell unmöglich.

Produktentscheid (Aaron): `diagnosebericht` bei Personenschaden = **Pflicht** (der
Live-Katalog hat das bereits so → Ableitung erfüllt es automatisch).

## Architektur

```
dokument_katalog (DB, SSoT: freigeschaltet_wenn / pflicht_wenn / uploadbar_von / sichtbar_fuer)
  │  getAlleSlots (cache 5 min)  +  ruleEvaluator
  ├─ buildDokumentKontext(claim, lead)  ← EINE kanonische Kontext-Funktion
  │     mappt Claim-SSoT-Felder auf die lead.*/fall.*-Keys der Katalog-Regeln
  ├─ getOffeneDokumentAnforderungen(claim, pflichtDocs, katalogRows, ctx)  [rein]
  │     operative Anzeige je Rolle (filtert uploadbar_von/sichtbar_fuer)
  ├─ createPflichtdokumenteFromKatalog  → Rows aus getPflichtSlotsFuerFall
  └─ berechneErwartung  → dünner Katalog-Wrapper (Dispatch-Card)
```

### Komponenten

**1. Katalog vervollständigen (DDL via `apply_migration`, Regel 2):**

| Slot | Aktion | freigeschaltet_wenn / pflicht_wenn | uploadbar_von |
|---|---|---|---|
| `gewerbenachweis` | ADD | `{or:[{eq,lead.gewerbe_flag,true},{eq,lead.vorsteuerabzugsberechtigt,true}]}` | `[kunde]` |
| `gf_vollmacht` | ADD | wie gewerbenachweis | `[kunde]` |
| `halter_vollmacht` | ADD | `{eq, lead.halter_ungleich_fahrer_flag, true}` | `[kunde]` |
| `halter_ausweis` | ADD | wie halter_vollmacht | `[kunde]` |
| `polizeibericht` | UPDATE | `{or:[{eq,lead.polizei_vor_ort,true},{eq,lead.fahrerflucht,true}]}` | (unverändert) |

Bereits korrekt im Katalog (kein Change): `diagnosebericht` (Pflicht bei
personenschaden_flag), `freigabe_bank` (leasing/finanzierung), `zeugenbericht`
(zeugen_vorhanden), Vorschäden-Slots, fahrzeugschein, schadensfotos, unfallfotos,
aerztliches_attest, sachschaden_*. Diese werden durch die Ableitung automatisch
korrekt sichtbar.

Migration-File-Name == getrackte Version (Twin-Drift vermeiden, Regel 2 Schritt 3+4).

**2. `buildDokumentKontext(claim, lead?)` — kanonische Kontext-Funktion** (neu,
`src/lib/dokumente/`): erzeugt den `EvalContext` (lead.*/fall.*) aus dem Claim
(SSoT) + optional Lead. Mappt: `claim.hat_personenschaden→lead.personenschaden_flag`,
`claim.hat_sachschaden→lead.sachschaden_flag`, `claim.halter_ungleich_fahrer→
lead.halter_ungleich_fahrer_flag`, `claim.polizei_vor_ort`, `claim.fahrerflucht`,
`claim.gewerbe_flag`, `claim.vorsteuerabzugsberechtigt`, `claim.finanzierung_leasing`,
`claim.zeugen_vorhanden→lead./fall.zeugen_vorhanden`, `lead.zb1_status`,
`fall.vorschaden_erkannt`, `fall.technische_stellungnahme_status`,
`fall.nachbesichtigung_status`. Ersetzt das ad-hoc Kontext-Bauen in
`erwartung.getDokumentenStand` + `onboarding/actions.getFreieSlotsFuerKunde`.

**3. `getOffeneDokumentAnforderungen` Rewrite** (`data-requirements.ts`): bleibt
**rein** (testbar/client-safe), Signatur nimmt `katalogRows: DokumentKatalogRow[]` +
`ctx: EvalContext`. Für jeden Slot mit `uploadbar_von.includes(rolle)` und
`freigeschaltet_wenn(ctx)` → Anforderung; `pflicht = pflicht_wenn(ctx)`; Status aus
`pflichtDocs`. `DOC_DEFINITIONS` + `SLOT_REIHENFOLGE` gelöscht (Reihenfolge aus
`katalog.sort_order`).

**4. `createPflichtdokumenteFromKatalog` Rewrite** (`create-pflicht.ts`): Rows aus
`getPflichtSlotsFuerFall(supabase, ctx)` anlegen (idempotent pro Slot, bestehend).
Supplementär-Hardcodes raus.

**5. `berechneErwartung`** (`erwartung.ts`): wird Katalog-Wrapper (oder
`DokumenteAnfordernCard` ruft direkt `getSlotsFuerFall`). Slot-ID `zeugenaussage`
entfällt zugunsten Katalog-`zeugenbericht`.

### Call-Sites (Threading der Katalog-Rows)

- `pflicht-for-fall.ts:117` (server) — `getAlleSlots` + `buildDokumentKontext` lokal.
- `kunde/onboarding/actions.ts` (server) — schon Katalog-nah; Kontext kanonisieren.
- `OnboardingWizard.tsx:249` (client) — Katalog-Rows + ctx als **Prop vom
  Server-Parent** (`kunde/onboarding/page.tsx`) reinreichen.
- `OffeneDatenBanner.tsx:47` + `AuftragDokumenteBanner.tsx:110` (client) — dito via
  Server-Parent.
- `DokumenteAnfordernCard.tsx` (Dispatch) — über berechneErwartung-Wrapper / direkter
  Katalog-Read.

## Halter-Wrinkle (Auflösung)

Der Supplementär-Block leitete „Halter≠Fahrer" auch aus Nachname-Vergleich ab
(`halter_nachname !== nachname`) — die Rule-DSL kann kein Feld-gegen-Feld.
**Canon:** Katalog-Regel auf der Claim-SSoT `claim.halter_ungleich_fahrer`
(= `!ist_fahrzeughalter`, gesetzt in `convert-lead-to-claim.ts:287`). Der
Nachname-Fallback (Band-Aid für fehlerhaftes `ist_fahrzeughalter`) **entfällt**. Die
Before/After-Harness prüft, ob ein Live-Claim dadurch Halter-Docs verlöre; falls ja →
Eskalation (Daten-Fix upstream statt Resolution-Band-Aid).

## Verifikation (Gate)

1. **Layer-1-Smoke** (`pflichtdok-konsistenz.test.ts`): die 4 `it.fails` werden zu
   **regulären grünen** Asserts (Canon fixt sie). = Regressions-Gate.
2. **Before/After-Harness** (read-only, über alle Live-Claims): pro Claim die alte
   operative Pflicht-Menge vs Katalog-abgeleitete diffen. Erwartete Diffs = genau die
   Fixes (Leasing→freigabe_bank, fahrerflucht→polizeibericht, zeugen, vorschaden).
   **Keine** unerwarteten Verluste (insb. Halter-Docs). Vor Code-Merge grün.
3. `npm run build` / `tsc --noEmit` / `vitest` / Playlist-Smoke (PR #3202).

## Phasing (für den Plan)

- **P1 Katalog-DDL** — 4 Slots ADD + polizeibericht UPDATE. Kein Consumer-Impact.
  Verifiziere via SQL/Script, dass der Katalog für die Szenario-Matrix die korrekte
  erwartete Menge liefert.
- **P2 Kontext + operative Anzeige** — `buildDokumentKontext` + `getOffeneDokumentAnforderungen`-Rewrite
  + Call-Site-Threading. Layer-1-Smoke flippen. Before/After-Harness über Live-Claims.
- **P3 Anlage + Dispatch** — `create-pflicht` aus Katalog + `berechneErwartung`-Wrapper
  + slot-id-Reconcile (`zeugenaussage`→`zeugenbericht`, ggf. Daten-Migration prüfen).

## Non-Goals

- SV-Verifizierungs-Slots (`gutachter_verifizierung`-Kategorie) — eigener Flow, unberührt.
- Kanzlei-/gutachten-/kosten-Slots (system-/SV-seitig) — unberührt außer durch die
  generische Ableitung (ändert deren Sichtbarkeit nicht).
- Keine UI-Redesigns. Reihenfolge/Labels kommen aus dem Katalog (bereits gepflegt).
- Ad-hoc-Anforderungen (`ad-hoc-anforderung.ts`) bleiben (Nicht-Katalog, KB/SV-getrieben).

## Reversibilität

Katalog-DDL additiv/Update (rückrollbar). Code hinter PR. Harness beweist No-Regression
vor Merge. Geteilte prod-DB → DDL erst nach Aaron-Go + grünem Katalog-Verify (wie
View-Kanonisierung).
