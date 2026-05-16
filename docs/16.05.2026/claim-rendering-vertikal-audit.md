# Claim-Rendering — Vertikaler Audit (Kunde / SV / Admin-KB)

**Datum:** 2026-05-16
**Zweck:** Bestandsaufnahme, **was die Portale in der Claim-/Fall-Detailansicht rendern und unter welcher Daten-Bedingung** — als Grundlage für die `faelle`→`claims`-Migration und die Smoke-Checkliste. Teil-Audit von `claim-ssot-vollmigration-audit-strategie.md` §3.1b.
**Methodik:** 3 parallele Portal-Audits, Conditional-Render-Bedingungen (`{x && <Block/>}`, `?:`, `?? Fallback`, early-returns, Tab-/Section-Visibility) gegen die gelesenen Spalten.

---

## 1 · Cross-Portal — die gefährlichsten Migrations-Stolpersteine

Diese Stellen lassen beim Spaltenumzug **ganze Blöcke/Seiten still verschwinden** — sie müssen bei jedem `faelle`-Spaltenumzug zwingend mitgezogen werden:

| # | Stelle | Risiko | Schweregrad |
|---|---|---|---|
| 1 | `gutachter/fall/[id]/page.tsx:54` — `if (!fall.sa_unterschrieben) notFound()` | Wandert `sa_unterschrieben` weg und der View `v_faelle_mit_aktuellem_termin` joint sie nicht → **JEDE SV-Fallakte ist 404**, kein Platzhalter, keine Meldung | **KRITISCH** |
| 2 | `src/lib/faelle/section-visibility.ts` — Prozess-Section-Sichtbarkeit liest `vs_reaktion_typ`, `mandatsnummer`, `regulierung_betrag`, `nachbesichtigung_status`, `ruege_counter`, `anschlussschreiben_am`, `auszahlung_*` direkt | Spaltenumzug ohne Nachzug → **ganze Prozess-Section verschwindet still** (Admin/KB) | **HOCH** |
| 3 | `src/lib/faelle/subphase-resolver.ts` — liest ~60 `faelle`-Spalten für Phase/Trigger | Umzug ohne Nachzug → Phase-Stepper zeigt falsche Phase, GutachtenCard/Panels/Banner verschwinden gemeinsam | **HOCH** |
| 4 | `src/lib/stammdaten/schema.ts` (`STAMMDATEN_FIELD_SCHEMA`) — Single-Source der Admin/KB-Stammdaten-Felder | Muss 1:1 nachgezogen werden; weniger riskant (leeres Feld statt verschwundener Block, kein `visibleWhen` aktiv) | MITTEL |
| 5 | `getSvSubphase` / `getSvLifecyclePhase` — gaten auf `gutachter_termin_bestaetigt`, `sv_termin`, `gutachten_eingegangen_am`, `gutachten_freigabe_am`, `lexdrive_case_id`, `technische_stellungnahme_status`, `nachbesichtigung_status` | Umzug ohne View-Mapping → SV-Phasenlogik kollabiert komplett | **HOCH** |
| 6 | `getClaimLifecycle` (Kunde-Stepper) liest `leads.sa_unterschrieben/vollmacht_signiert_am`, `faelle.onboarding_complete`, `auftraege`, `kanzlei_faelle` | Stepper-Quelle — beim Umzug der Lifecycle-Marker mitziehen | MITTEL |

**`faelle`-Direkt-Reads außerhalb der zentralen Loader** (einzeln nachzuziehen, vom Loader nicht abgedeckt):
- SV: `gutachter/fall/[id]/page.tsx:415` (`claim_id, no_show_count`), Feldmodus `_fallakte/actions.ts:84`, `gutachter/termine/[id]/page.tsx:73`
- Kunde: Page macht Direkt-Queries `claimExtra`, `fallExtra`, `kundeView` zusätzlich zum Loader
- Admin/KB: lädt zentral über View `v_faelle_mit_aktuellem_termin` (`SELECT *`)

---

## 2 · Bereits heute kaputte / tote Render-Blöcke

Diese Blöcke sind **schon vor der Migration** defekt — die Migration darf sie nicht weiter verschlechtern, idealerweise gleich mitfixen:

| Block | Portal | Befund |
|---|---|---|
| `MietwagenStatusCard` in `FallDetailSections` | Kunde | `getKundeFallDetailRecord` gibt `mietwagen_*` nicht aus → Card rendert **immer `null`**. Mietwagen kommt nur über `KundeAusfallEntschaedigungCard` (separater Query). |
| Gegner-Block (Name/KZ/Typ) in `StammdatenReadSection` | Kunde | Loader liefert `gegner_versicherung`+`_versicherungsnummer`, aber nicht `gegner_name/_kennzeichen/_fahrzeugtyp/_bekannt` → Block rendert nur teilweise |
| Halter-Block in `StammdatenReadSection` | Kunde | `halter_ungleich_fahrer_flag` nicht im Loader → `?? false` → Block **nie sichtbar** |
| Fahrzeug-Zeile (FIN/Erstzulassung/Fahrbereit/Leasing) | Kunde | `fin_vin`, `erstzulassung`, `fahrzeug_fahrbereit`, `lackfarbe_code`, `finanzierung_leasing` nicht im Loader → Badges/Bild fehlen still |
| Eigene-Versicherung-Block | Kunde | Page übergibt `lead={null}`, Block liest nur `lead.*` → per Design tot |
| `visibleSections` (`getVisibleFallSections(fall,'sv',…)`) | SV | berechnet, **nie gerendert** → VS-Reaktion/Rüge/Regulierungs-Detail haben gar keine SV-UI |
| `StammdatenCard.tsx` (shared/stammdaten) | SV | hinter `{false && …}` — toter Code; Cardentity-Felder werden im Live-Pfad nirgends gelesen |
| Kanzlei-Claim-Detailansicht | Kanzlei | `/kanzlei/mandate` verlinkt `/kanzlei/fall/[id]` — **Route existiert nicht** (toter Link) |

---

## 3 · Vorschäden — der explizite Prüffall

| Portal | Vorschaden-Rendering | Quelle |
|---|---|---|
| **Kunde** | **Fehlt komplett** — kein Block liest `hat_vorschaeden`/`vorschaden_*`/Cardentity. Migration der Vorschaden-Spalten ist Kunde-Portal-neutral. | — |
| **SV** | Tab „Historie" (`StammdatenDetail.tsx:210`) + Vorschäden-Warnblock (`FallDetailClient.tsx:429`, `if hat_vorschaeden`). **Gespalten:** `hat_vorschaeden` von `leads`, `vorschaden_anzahl/_letzter_datum/_beschreibung` von `faelle`. Cardentity-Ergebnis nur in toter `StammdatenCard`. | `leads` + `faelle` |
| **Admin/KB** | Stammdaten-Block `vorschaeden` (`hat_vorschaeden`, `vorschaden_anzahl`, `vorschaeden_beschreibung`) + Fahrzeug-Block `CardentityTypBButton` (`cardentity_abfrage_am`, `cardentity_enriched_at`, `vorschaden_letzter_datum`, `vorschaden_typ_b_pdf_url`) + OCR-Pendant in `GutachtenOcrCard` (`gutachten_vorschaeden_text`, `karosseriezustand`, `lackmesswert_max_my`). `CardentityTypBButton` liest `lead.hat_vorschaeden` (bewusste Lead-Quelle). | `leads` + `faelle` + `v_gutachten_werte` |

**Migrations-Konsequenz Vorschäden:** Die Domäne ist über `leads` + `faelle` + `gutachten`/OCR verteilt und uneinheitlich (`hat_vorschaeden` mal Lead, mal faelle). Beim Umzug muss eine **einheitliche Quelle** definiert werden — und der SV-„Historie"-Tab + Admin-`vorschaeden`-Block + Warnblock zeigen sonst widersprüchliche Stände. Deckt sich mit dem Cardentity-Konsolidierungs-Audit (§3.1c der Strategie).

---

## 4 · Domänen-Abdeckung je Portal (Kurzraster)

| Domäne | Kunde | SV | Admin/KB |
|---|---|---|---|
| Fahrzeug-Spec | teilweise (reduziert) | ja (Panel) | ja (Schema-Block) — `vehicle_id` nirgends gelesen |
| Vorschäden | **fehlt** | ja (Tab+Warnblock) | ja (Block+Cardentity) |
| Gutachten-Werte | ja (`v_gutachten_werte`) | ja (`v_gutachten_werte`) | ja (OCR-Card admin-only + Schema `kernwerte`) |
| Mietwagen | nur Ausfall-Card | **fehlt** | ja (Edit/Status — inkonsistente Spaltenpaare) |
| Regulierung/VS | Status-Hinweise | **fehlt** (visibleSections tot) | ja (Prozess-Tab breit) |
| Gegner | teilweise | nur `claim_parties` | `faelle.gegner_*` inline |

**Inkonsistenz-Funde fürs Mapping:**
- Mietwagen: Cards lesen `mietwagen_hat`/`nutzungsausfall_tage`, `NutzungsausfallSection` liest `mietwagen_flag`/`nutzungsausfall` — **zwei Spaltenpaare fürs selbe Konzept**.
- Gutachten-Werte: `reparaturkosten` vs `reparaturkosten_netto/brutto`, `wertminderung` vs `minderwert` — Stammdaten-`kernwerte` vs `v_gutachten_werte` nicht namensgleich.
- `vehicle_id` wird in **keiner** Detailansicht gelesen — die Fahrzeug-Migration auf `vehicles` erfordert komplettes Umverdrahten, nicht nur Spalten-Rename.

---

## 5 · Smoke-Checkliste — pro Portal nach jedem Migrations-PR

Damit „sauber smoken" möglich ist: nach jedem `faelle`-Spaltenumzug diese Blöcke explizit prüfen (Screenshot + Datenlage):

### SV-Portal (`/gutachter/fall/[id]`)
- [ ] Fallakte lädt überhaupt (kein 404) — **`sa_unterschrieben`-Gate** #1
- [ ] AuftragHeaderPanel-Stepper zeigt korrekte Phase
- [ ] GutachtenCard erscheint ab Subphase 4.4 / mit OCR-Werten
- [ ] Stammdaten-Tabs Historie/Unfall/Schaden/Kunde/Gegner gefüllt
- [ ] Vorschäden-Warnblock bei `hat_vorschaeden`
- [ ] Banner: Termin-verstrichen / Gutachten-Upload / Stellungnahme / Nachbesichtigung

### Kunde-Portal (`/kunde/faelle/[id]`)
- [ ] ClaimStepper + Lifecycle-Phasen korrekt
- [ ] SaeuleMeinGeld — Forderung + Gutachten-Block (hängt an `v_gutachten_werte.gutachten_ocr_processed_at`)
- [ ] KundeAusfallEntschaedigungCard erscheint bei OCR + `totalschaden`
- [ ] AuszahlungCard / VS-Hinweise je `status`
- [ ] FallDetailSections: Fahrzeug-Zeile, Schadensort, Unfallhergang

### Admin/KB-Fallakte (`/faelle/[id]`)
- [ ] Übersicht-Tab: Stammdaten-Sections phase-gegated korrekt sichtbar
- [ ] Prozess-Tab: Sections (Kanzlei/AS/VsReaktion/Stellungnahme/Rüge/Nachbesichtigung/Klage/Auszahlung) erscheinen nach `section-visibility.ts` #2
- [ ] GutachtenOcrCard (admin-only) — 40 Werte-Spalten via `v_gutachten_werte`
- [ ] Mietwagen Edit/Status-Card + NutzungsausfallSection (beide Spaltenpaare!)
- [ ] VsKorrespondenz / Regulierung / KanzleiSLA-Cards

> Voller Portal-Smoke mit Screenshots ist Pflicht nach jedem Schema-Drop (`feedback_post_drop_smoke`). Dieses Audit liefert die Block-Liste dafür.

---

## 6 · Quellen

3 parallele Portal-Audits (Kunde/SV/Admin-KB), 16.05.2026. Ergänzt `claim-ssot-vollmigration-audit-strategie.md` §3.1b.
