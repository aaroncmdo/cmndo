# Werkstatt-Schadensfotos (W1) + Kunde-KVA-Freigabe-Stepper (K1) — Design

**Datum:** 2026-07-23
**Lane:** b0e963b6 (Werkstatt+Kunde-Repair-Audit)
**Branch:** `kitta/werkstatt-schadensfotos-kva-stepper`
**Status:** Aaron „W1 + K1 both" (23.07.). Kleiner Doppel-Change → Plan in diese Spec gefaltet.

## Kontext (Audit)
Kasko/Selbstzahler-Claim → Werkstatt-Auftrag. Backbone solide (KVA-Signatur-Freigabe-Loop, completeReparatur→Claim-Close+Provision). **Zwei echte Lücken:**

## W1 — Werkstatt sieht keine Schadensfotos
`WerkstattAuftragDetail` + Loader (`getWerkstattAuftragExtra`) zeigen **null Schadensfotos**. Gutachten-Section ist `if (!gutachten_fertiggestellt_am) return null` → bei **Selbstzahler (kein SV/Gutachten)** sieht die Werkstatt nur Unfallhergang-Text + Schadenart. Im **`kva_erst`-Modus** ist der KVA VOR dem Termin fällig → die Werkstatt kalkuliert blind.

**Fix:** Die Kunden-Schadensfotos (`fall_dokumente` `dokument_typ='schadensfoto'`, `claim_id`-gekeyt, `geloescht_am IS NULL`) mit **zur Laufzeit aufgelösten** URLs (`getStorageUrlBulk`, bucket `fall-dokumente` — robust gg. stale Storage-URLs, [[reference-gespeicherte-storage-url-ist-nicht-abrufbar]]) im Auftrag-Detail als **Galerie** zeigen.
- `queries.ts`: `WerkstattAuftragExtra` + `schadensfotos: string[]`; in `getWerkstattAuftragExtra` fall_dokumente-Query (claim_id + typ + !deleted) + `getStorageUrlBulk`. **Keine** `sichtbar_fuer`-Filterung: die zugewiesene Werkstatt (ownership via `getWerkstattAuftrag`) braucht die Schadensbilder für den KVA — analog zum bestehenden admin-Read von Kunde-PII in derselben Funktion.
- `WerkstattAuftragDetail.tsx`: neue `SectionCard title="Schadensfotos"` — Thumbnail-Grid, Klick öffnet das Bild (target=_blank). Nur wenn `extra.schadensfotos.length > 0`.

## K1 — Kunde-Selbstzahler-Stepper: KVA-Freigabe-Stufe fehlt + „Reparatur" zu früh
`SELBSTZAHLER_STEPS = ['schaden','werkstatt','termin','reparatur']` — **keine Freigabe-Stufe**. `selbstzahlerStepIndex` springt bei `terminStatus==='bestaetigt'` sofort auf Index 3 („Reparatur läuft") — **bevor** der Kunde per Signatur freigibt (`KostenvoranschlagCard`, „damit die Werkstatt beginnen kann"). Der Kunde sieht „Reparatur läuft", obwohl es an SEINER Unterschrift hängt.

**Fix:** `SELBSTZAHLER_STEPS = ['schaden','werkstatt','termin','freigabe','reparatur']`. `selbstzahlerStepIndex` bekommt `kvaFreigegeben: boolean` (= `reparatur_freigegeben_am != null`). Neue Ableitung:
```
abgeschlossen || terminStatus==='erledigt'          -> {4, done}
terminStatus==='bestaetigt' && kvaFreigegeben        -> {4}   // Reparatur läuft (erst NACH Freigabe)
terminStatus==='bestaetigt'                          -> {3}   // Freigabe — wartet auf KVA-Unterschrift
hatWerkstatt                                         -> {2}   // Termin
sonst                                                -> {1}   // Werkstatt
```
Invariante: „Reparatur" (4) NUR wenn `kvaFreigegeben`. Deckt beide Modi (kva_erst/termin_erst) korrekt.
- `selbstzahler-stepper.ts`: STEPS + Ableitung + Input.
- `SelbstzahlerReparaturStepper.tsx`: `STEP_ICON`/`STEP_LABEL` für `freigabe` (Label „Freigabe", Icon z.B. `PenLineIcon`/`FileSignatureIcon`) + `kvaFreigegeben`-Prop.
- `StatusZone.tsx`: `kvaFreigegeben={vm.flags.reparaturFreigegeben}` (schon im vm, :676).
- Tests aktualisieren: `src/lib/werkstatt/__tests__/selbstzahler-stepper.test.ts` (neue Stufe + Input) + ggf. `SelbstzahlerReparaturStepper.test.tsx` (neue Prop).

## Kein DB-/i18n-Change. Kein FallDetailClient-Change.

## Betroffene Files & Koordination
- W1: `src/lib/werkstatt/queries.ts`, `src/components/werkstatt/WerkstattAuftragDetail.tsx`.
- K1: `src/lib/werkstatt/selbstzahler-stepper.ts` (+test), `src/components/kunde/SelbstzahlerReparaturStepper.tsx` (+test), `src/components/kunde/claim-view/StatusZone.tsx`.
- ⚠ `StatusZone.tsx` — von K7 (#4699) angefasst (§249-Karte). Meine K1-Änderung = 1 Prop am Stepper-Element (:77), disjunkt zur §249-Karte (:103). Merge-Reihenfolge über Merge-Session.

## Testing
- Unit: `selbstzahler-stepper.test.ts` (Ableitung, inkl. „terminStatus=bestaetigt + !freigegeben → freigabe, NICHT reparatur").
- tsc/build + **Regel-4-Prod-Smoke**: (W1) Werkstatt-Auftrag mit Kunden-Schadensfotos → Galerie sichtbar; (K1) Selbstzahler-Kunde mit bestätigtem Termin aber offener KVA-Freigabe → Stepper steht auf „Freigabe", nicht „Reparatur". Test-Konten.

## Weitere Audit-Funde (verify-then-backlog, NICHT dieser Build)
Kein KVA-**Ablehnen/Rückfrage** (KostenvoranschlagCard = sign-or-nothing → Stuck bei zu teurem KVA); netto-only-KVA feuert keine `kva_freigabe`-Aufgabe (Gate-Mismatch `kunde-zonen.ts:37` `kvaBrutto` vs Card-Gate `kvaNetto||kvaBrutto`); Vermittlungs-„Blind-Window" (weder Finder- noch Werkstatt-Card während Brokering); kein Selbstzahler-Kosten/Selbstbehalt-Framing. → in den Audit-Marker.
