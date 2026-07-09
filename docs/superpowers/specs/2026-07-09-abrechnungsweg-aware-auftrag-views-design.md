# Abrechnungsweg-abhängige Werkstatt-/SV-/Kunde-Auftragssicht — Design

**Datum:** 2026-07-09
**Branch:** kitta/werkstatt-flow-enrichment (Fortsetzung, PR #3985-Lane)
**Status:** Approved-in-Konzept (Aaron „sauber durchdenken" + 3 Klärungen 09.07.)

## Kern-Business-Logik (bestätigt)
Ein Werkstatt-**Auftrag** (Haftpflicht) entsteht erst, wenn der Kunde die SA unterschrieben hat:
Lead (offene Anfrage, `v_werkstatt_lead`) → SA-Signatur → `convertLeadToClaim` setzt
`konvertiert_zu_claim_id` → Lead fällt aus `v_werkstatt_lead`, Claim erscheint in
`v_werkstatt_auftrag`. Für die Werkstatt = „Konvertierung" Anfrage → Auftrag.

## Zwei Routen je Abrechnungsweg
- **Haftpflicht** → SV-Gutachten-Route: die Werkstatt sieht das **Gutachten** (Werte + PDF,
  hochgeladen vom SV, sichtbar ab `gutachten_fertiggestellt_am`) + den **Besichtigungstermin**
  (Gutachter + Datum). **KEIN KVA.**
- **Kasko + Selbstzahler** → Werkstatt-Reparatur-Route: die Werkstatt lädt den **KVA** hoch +
  schlägt einen **Reparaturtermin** vor + gibt die **Reparaturdauer** an; der Kunde gibt den
  **Reparaturauftrag per Unterschrift** frei. **KEIN Gutachten.**

`istWerkstattReparaturWeg(abrechnungsweg)` (selbstzahler | kasko-nicht-gebunden) = KVA-Route.
`abrechnungsweg === 'haftpflicht'` = Gutachten-Route.

## Was bereits existiert (nicht neu bauen)
`v_werkstatt_auftrag` (59 Spalten) hat schon: `besichtigung_start/_ort/_status`,
`gutachter_firmenname`, 6 Gutachten-Werte, `gutachten_bericht_pdf_url` (server-only),
`gutachten_fertiggestellt_am`, `kostenvoranschlag_netto/brutto`, `reparatur_freigegeben_am`,
`reparatur_termin_*`, `abrechnungsweg`. `WerkstattAuftragDetail` rendert `GutachtenSektion`
(`zeigtGutachten`), `KvaSektion` (`kvaStatus`), `ReparaturterminSektion`. `oeffneGutachtenPdf`
(signed URL) existiert. Kunde sieht Gutachten-Werte via `v_gutachten_werte`.

## Die Lücken → 8 Workstreams

### AV1 — Gating schärfen (Korrektheit, zuerst)
`werkstatt-auftrag-segment.ts`:
- `zeigtGutachten(w)` → **nur** `w === 'haftpflicht'` (Kasko raus, Aaron 09.07.).
- `kvaStatus(a)` → nur wenn `istWerkstattReparaturWeg(a.abrechnungsweg)` (kasko/selbstzahler);
  für haftpflicht **immer null** (heute zeigt Haftpflicht „KVA benötigt" bis Gutachten da = falsch).
Reine Logik + Unit-Tests. Kein DDL.

### AV2 — Besichtigungstermin (Gutachter-Termin) anzeigen — Aaron-Bug
`WerkstattAuftragDetail`: neue `BesichtigungsterminSektion` (nur haftpflicht) mit
`besichtigung_start` (Datum/Uhrzeit, `formatBerlin`) + `gutachter_firmenname` + `besichtigung_status`.
`WerkstattAuftraege` (Liste): in der Reparatur-Zeile (haftpflicht) den `besichtigung_start` +
Gutachter zeigen. Daten sind schon in der View — reines Rendering.

### AV3 — Auffahrunfall-Hinweis (DDL + UI)
- **DDL** (`apply_migration`): `v_werkstatt_auftrag` um `c.bkat_unfallart AS unfallart` erweitern
  (Enum, Wert `'auffahrunfall'`). Append-only.
- `werkstatt-auftrag-segment.ts`: `istAuffahrunfall(a)` = `a.unfallart === 'auffahrunfall'`.
- `WerkstattAuftragDetail`: Hinweis-Banner bei Auffahrunfall: „Auffahrunfall — Stoßfänger muss
  ausgebaut werden, Hebebühne benötigt."
- **SV-Sicht** (`gutachter/fall/[id]`): derselbe Hinweis + Zusatz: „Hinweis: Hilfestellungskosten
  (Hebebühne) individuell mit der Werkstatt aushandeln." (NUR Hinweis — KEINE SV-System-Position,
  Aaron 09.07.).

### AV4 — Reparaturdauer (DDL + UI)
- **DDL**: `v_werkstatt_auftrag` um `gu.wiederbeschaffungsdauer_tage AS reparaturdauer_tage` +
  `c.reparaturdauer_tage_kva` (neu, s. AV5) erweitern. Append-only.
- Haftpflicht: Reparaturdauer aus Gutachten (`reparaturdauer_tage`) in der `GutachtenSektion`
  anzeigen.
- KVA-Route: die Werkstatt gibt die Reparaturdauer beim KVA-Upload ein (AV5).

### AV5 — KVA-Upload → Reparaturtermin-Vorschlag + Reparaturdauer
`KvaHochladenModal` + `erstelleKvaFuerAuftrag`:
- Neue Felder: **Reparaturtermin-Vorschlag** (Datum) + **Reparaturdauer** (Tage).
- `erstelleKvaFuerAuftrag` legt zusätzlich eine `reparatur_termine`-Zeile an (wunschtermin,
  Werkstatt-Vorschlag → status `angefragt`) + speichert `claims.reparaturdauer_tage_kva` (DDL neu).
- „KVA hochladen ohne Termin" bleibt möglich (Termin optional in v1? — Aaron: Upload MUSS Termin
  mitbringen → Pflichtfeld). Reparaturdauer optional.

### AV6 — Reparaturauftrag-Freigabe per Unterschrift (Kunde, KVA-Route)
- Neue **leichte** Signatur „Reparaturauftrag freigeben" (SaSignaturStep-Infra, **eigener**
  Rechtstext „Reparaturauftrag" — KEINE SA/Abtretung).
- Kunde-Portal (`kunde/faelle/[id]`, KVA-Route): nach hochgeladenem KVA + Reparaturtermin die
  Freigabe-Signatur; setzt `claims.reparatur_freigegeben_am` (+ Signatur-Doc in `fall_dokumente`).
- Löst die heutige Klick-Freigabe (`genehmigeKvaPortal`) ab bzw. ergänzt sie um die Unterschrift.

### AV7 — Gutachten-PDF direkt für den Kunden
`kunde/faelle/[id]`: direkter „Gutachten-PDF öffnen"-Download (signed URL, wie
`oeffneGutachtenPdf` werkstattseitig) — heute nur `GutachtenWeiterleitungButton` (Email).
Gegatet auf vorhandenes Gutachten (`gutachten_fertiggestellt_am`).

### AV8 — Reparaturdauer beim Kunden (KVA-Route)
Der Kunde sieht bei der KVA-Route die von der Werkstatt angegebene Reparaturdauer in der
`KostenvoranschlagCard` (aus `claims.reparaturdauer_tage_kva`).

## DB-Änderungen (alle via `apply_migration`, Regel 2)
1. `claims.reparaturdauer_tage_kva int` (AV5) — Werkstatt-Reparaturdauer bei KVA.
2. `v_werkstatt_auftrag` CREATE OR REPLACE + Append: `unfallart` (AV3),
   `reparaturdauer_tage` (Gutachten, AV4), `reparaturdauer_tage_kva` (AV5).

## Reihenfolge
AV1 (Gating, sofort korrekt) → AV2 (Termin-Anzeige, Aaron-Bug) → AV3 (Auffahr-Hinweis) →
AV4+AV5 (Reparaturdauer + KVA→Termin) → AV6 (Reparaturauftrag-Signatur) → AV7 (Kunde-Gutachten-PDF)
→ AV8 (Kunde-Reparaturdauer).

## Audit / Konventionen
DDL nur Plugin; UI-Strings Umlaut-korrekt; Server-Actions Result-Object + revalidatePath;
Ownership via v_werkstatt_auftrag-RLS (Werkstatt) bzw. assertKundeOwnsClaim (Kunde); Komponenten
aus primitives/shared; abrechnungsweg-Gating zentral via istWerkstattReparaturWeg/zeigtGutachten.
