# Ticket: CMM-28 Follow-up — verwaiste Kunden-Detail-Cards

**Typ:** Klärung / ggf. Cleanup oder Re-Integration · **Owner:** CMM-28 / Kunden-Portal · **Priorität:** mittel · **Aufgedeckt:** 13.05.2026 (Aufräum-Aktion `8f088031`-Merge — siehe `docs/13.05.26/8f088031-merge-regression-cleanup-bericht.md`)

## Kontext

Beim Aufarbeiten der `8f088031`-Merge-Regressionen kam raus: `app/kunde/faelle/[id]/page.tsx` ist **kein** mechanischer Restore-Kandidat — der Merge hat sie zwar gegutet (`+124 −645`), aber danach hat **CMM-28** sie *absichtlich* neu geschrieben (komplett auf claim-Loader `getKundeFallDetailRecord` umgestellt; im Commit-Header dokumentierte bewusste Cleanups: `EskalationsErgebnisCard`/`FaqBotCard`/`ReFrageKanzleiClient`/`SaeuleMeinAnwalt`/`KanzleiAnsprechpartnerBlock`-Render raus → konsolidiert zu einer „Meine Kanzlei"-Card).

**Aber:** mehrere Kunden-Detail-Card-Komponenten sind dadurch (bzw. durch den Merge davor) **verwaist** — sie existieren noch in `src/components/kunde/`, werden aber **von 0 anderen Dateien importiert**:

- `KundeAusfallEntschaedigungCard` (`src/components/kunde/KundeAusfallEntschaedigungCard.tsx`) — Ausfallentschädigungs-Übersicht (Totalschaden/Reparaturkosten-brutto/Minderwert/Wiederbeschaffungswert)
- `KanzleiPfadCard` (`src/components/kunde/KanzleiPfadCard.tsx`)
- `KundeBetreuerStrip` (`src/components/kunde/KundeBetreuerStrip.tsx`)
- `KundeAbschlussCard` (`src/components/kunde/KundeAbschlussCard.tsx`)
- `GoogleReviewPrompt` (`src/components/kunde/GoogleReviewPrompt.tsx`)
- `BelegUploadCard` (`src/components/kunde/beleg-upload/BelegUploadCard.tsx`)
- (`ClaimSummary` ist nur halb verwaist — noch in 1 anderen Datei importiert)

## Frage / zu entscheiden

Hat CMM-28 diese Cards **bewusst weggelassen** (= dann: löschen, inkl. evtl. zugehöriger Server-Loader-Helper) — oder **übersehen** beim claim-Loader-Umbau (= dann: in die neue `getKundeFallDetailRecord`-basierte `kunde/faelle/[id]/page.tsx` wieder einbinden, mit den claim-SSoT-Daten statt der alten View-Felder)?

CMM-28-Spec/Ticket prüfen. Falls Re-Integration: jede Card auf die neue claim-Loader-Datenstruktur anpassen (die alte Version las teils aus `v_faelle_mit_aktuellem_termin` / `faelle_kunde_view` — Felder ggf. umbenannt/umgezogen, siehe das `no_show_count`-Beispiel aus PR #840: von `claims` nach `faelle` umgezogen).

## Definition of Done

- [ ] CMM-28-Spec geprüft: pro Card entschieden „löschen" oder „re-integrieren"
- [ ] „löschen"-Cards: Komponente + ungenutzte Server-Loader-Helper entfernt; knip grün
- [ ] „re-integrieren"-Cards: in `kunde/faelle/[id]/page.tsx` (claim-Loader-Variante) eingebunden, auf claim-SSoT-Daten umgestellt, `npm run build` grün, in der Kunden-Fallakte sichtbar
