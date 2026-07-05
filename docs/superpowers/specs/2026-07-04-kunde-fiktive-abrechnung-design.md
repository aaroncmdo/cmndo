# SP4c — Fiktive-Abrechnung-Kundenansicht — Design

> Letztes Stück des SP4-Blocks (Kunde-Einstiege). Der Kunde, der `reparaturwunsch='fiktiv'` gewählt hat (Auszahlung statt Reparatur), sieht in seiner Fallakte die **voraussichtliche fiktive Auszahlung** auf Gutachten-Basis.

**Datum:** 2026-07-04 · **Session:** cec48090 · **Branch:** `kitta/kunde-fiktive-abrechnung` (off staging)

## Ziel & Abgrenzung

Der bestehende `AuszahlungCard` zeigt die **tatsächliche** Auszahlung (Netto-Kunden-Anteil nach Regulierung). SP4c ist **früher + anders**: die **erwartete** fiktive Abrechnung auf Basis des Gutachtens, sobald der Kunde die fiktive Variante gewählt hat.

**In Scope:** Eine `FiktiveAbrechnungCard` in der Kunde-Fallakte, gated `claimExtra.reparaturwunsch === 'fiktiv'`, mit Summe + Positionen + Disclaimer. Daten aus `v_gutachten_werte` (kunde-sichtbar).

**Out of Scope:** i18n (hardcoded-DE, Follow-up) · Nutzungsausfall in der fiktiven Summe (separater Anspruch) · Editier-/Abrechnungs-Workflow (Kanzlei/Regulierung).

## Design

**Berechnung (§ 249 BGB):**
- **Reparaturschaden:** Reparaturkosten **netto** + Wertminderung (Minderwert). Netto, weil ohne tatsächliche Reparaturrechnung keine MwSt.
- **Totalschaden:** Wiederbeschaffungswert − Restwert (Wiederbeschaffungsaufwand).

**Darstellung (Aaron: „Summe + Disclaimer"):** fette „Voraussichtliche Auszahlung: X €" + Positions-Aufschlüsselung + Disclaimer („auf Basis des Gutachtens; die endgültige Höhe legt die Versicherung fest"). Rendert nur bei Summe > 0.

**Komponente:** `src/components/kunde/FiktiveAbrechnungCard.tsx` (Server-Component, `SectionCard`, hardcoded-DE). Props: `reparaturkostenNetto`, `minderwert`, `totalschaden`, `wiederbeschaffungswert`, `restwert`.

**Integration:** `kunde/faelle/[id]/page.tsx` additiv — `reparaturwunsch` (claims) + `reparaturkosten_netto` (v_gutachten_werte) in `claimExtra` aufgenommen; Card im Geld-Bereich nach dem `AuszahlungCard` gerendert (gated fiktiv).

## Koordination
`page.tsx` heiß (cfefdf75 kunde-primitives-migration; SP4a #3580 fügt separat den WerkstattCard hinzu). SP4c **additiv**: 1 Import + 4 Daten-Zeilen (Typ/Select/Select/Build) + 1 Render-Slot. Kein Overlap mit dem SP4a-Slot (andere Card). Card = `SectionCard` (ratchet-safe).

## Hinweis
0 `fiktiv`-Claims auf prod (Feature neu) → die Card greift erst, wenn Kunden die fiktive Variante wählen. Verifikation: manuell einen Claim auf `reparaturwunsch='fiktiv'` + Gutachten-Werte setzen → Card erscheint mit korrekter Summe.
