# v_claim_base Gutachten-Normalisierung + v_faelle-Retire — Design

**Datum:** 2026-07-14
**Lane:** `kitta/vclaimbase-gutachten-entity` (off staging)
**Vorgeschichte:** [[coordination-an-view-lane-vclaimbase-gutachten-aus-entity]], [[audit-abgeleitete-views-mapping-konsistenz-detailview]] (Session f6db1bed, MCP-los — hier live gegen prod verifiziert).

## 1. Problem

Die abgeleiteten Claim-Views hängen alle an einer normalisierten Basis `v_claim_base` (370 Spalten). Zwei Inkonsistenzen:

1. **Gutachten roh statt Entity.** `v_claim_base` berechnet 12 Gutachten-Felder in einem inneren Subquery aus der **rohen** `gutachten g`-Tabelle (`LEFT JOIN gutachten g ON g.claim_id = c.id`). Phase macht es bereits richtig (`LEFT JOIN v_claim_phase`). Gutachten ist der **einzige** verbliebene Roh-Tabellen-Join in der Basis. (Das frühere `rolle_sieht_gutachtenwerte()`-Value-Gate ist bereits entfernt — PR #4159, live verifiziert.)

2. **Zwei Präsentations-Views über derselben Basis.** `v_claim_full` (166 Spalten, 142 Consumer) und `v_faelle_mit_aktuellem_termin` (339 Spalten, 63 Consumer) sind **beide** `FROM v_claim_base`. `v_faelle` ist ein Legacy-Alias-Re-Mapping (andere Spaltennamen, mehr Spalten durchgereicht), soll retired werden.

**Live-Befund (prod `paizkjajbuxxksdoycev`, 2026-07-14):**
- `v_claim_base` joint roh `gutachten g` (Z. 780) + `v_claim_phase` (Z. 844, Vorbild); kein Gutachten-Rolle-Gate mehr.
- `v_gutachten_werte` = `claims c LEFT JOIN gutachten g` ohne Aggregation, `WHERE claim_sichtbar_fuer_aktuellen_user(c.id)`.
- `gutachten.claim_id` hat eine **Unique-Constraint** → max. 1 Gutachten pro Claim → **kein fan-out** beim Entity-Join.
- Beide Views DEFINER (kein `security_invoker`, `reloptions=null`) — Projekt-Muster.
- `v_faelle` = `FROM v_claim_base base;` (reines Re-Mapping, **keine** eigenen Joins). Die 173 „v_faelle-only"-Spalten sind größtenteils schon in `v_claim_base` vorhanden, nur anders benannt / in `v_claim_full` nicht durchgereicht.

## 2. Ziel

Jede abgeleitete View mappt jedes Feld **einmal aus einer Quelle**: pro Konzept die kanonische Entity-View joinen (wie Phase), nie roh doppelt. Genau **eine** Präsentations-View (`v_claim_full`). `v_faelle` verschwindet.

## 3. Phase 1 — Base-Gutachten aus der Entity (wertneutral)

### 3.1 `v_gutachten_werte` erweitern (additiv)
Fünf Felder anhängen (am Ende der Spaltenliste → kein Consumer-Bruch), die `v_claim_base` heute roh aus `g` holt und die die Entity noch nicht trägt:

| Neu in v_gutachten_werte | Quelle |
|---|---|
| `gesamt_schadensbetrag` | `g.gesamt_schadensbetrag` |
| `fertiggestellt_am` | `g.fertiggestellt_am` |
| `pdf_uploaded_at` | `g.pdf_uploaded_at` |
| `positionen` | `g.positionen` |
| `auftragsnummer` | `g.auftragsnummer` |

(`g.id` ist bereits als `gutachten_id` vorhanden → base nutzt künftig `vgw.gutachten_id IS NOT NULL` für `gutachten_vorhanden`.)

### 3.2 `v_claim_base` umstellen
Im Gutachten-Subquery die `g.*`-Referenzen auf `vgw.*` umschreiben und `LEFT JOIN gutachten g ON g.claim_id = c.id` durch `LEFT JOIN v_gutachten_werte vgw ON vgw.claim_id = c.id` ersetzen. Abgeleitete Ausdrücke bleiben (z. B. `nutzungsausfall_gesamt = gutachten_nutzungsausfall_tagessatz_eur * nutzungsausfall_tage`), lesen dann `vgw`-Felder.

Feld-Mapping (base-Alias ← Entity-Feld):
`gutachten_betrag ← gesamt_schadensbetrag` · `gutachten_eingegangen_am ← fertiggestellt_am` · `nutzungsausfall_tagessatz ← gutachten_nutzungsausfall_tagessatz_eur` · `gutachter_honorar ← gutachten_sv_honorar_netto` · `ocr_rohdaten ← gutachten_ocr_raw` · `gutachten_vorhanden ← gutachten_id IS NOT NULL` · `gutachten_hochgeladen_am ← pdf_uploaded_at` · `gutachten_positionen ← positionen` · `gutachten_nummer ← auftragsnummer` · `reparaturkosten ← reparaturkosten_netto` · `wertminderung ← minderwert` · `nutzungsausfall_gesamt ← tagessatz × nutzungsausfall_tage`.

### 3.3 Wertneutralität
Garantiert, weil `v_gutachten_werte` denselben `claims LEFT JOIN gutachten`-Join macht; die Unique-Constraint auf `gutachten.claim_id` erzwingt 1:1; identische `g.`-Felder; identisches `claim_sichtbar`-Gate; beide DEFINER. `v_claim_full` + `v_faelle` erben (beide `FROM v_claim_base`), Shape unverändert.

**Verifikation:** Shape-Diff-Harness (`nonexempt_diffs = 0` über alle Claims, wie beim `v_claim_full_on_base`-Swap etabliert). Spaltenzahl `v_claim_base` unverändert (370). Column-Namen/Typen von `v_claim_full` + `v_faelle` unverändert (Snapshot vor/nach).

### 3.4 Lieferung
Phase 1 ist **isoliert lieferbar** (eigener PR, mergen, deployen, Prod-Smoke) und **unabhängig** von Phase 2. Volle `CREATE OR REPLACE VIEW` (kein `pg_get_viewdef()+replace()+RAISE`-Guard — der bricht den fresh-Replay).

## 4. Phase 2 — `v_faelle_mit_aktuellem_termin` retiren

### 4.1 Genutzte Spalten ermitteln (nicht alle 173)
Erst per grep über die 63 Consumer feststellen, welche der 173 v_faelle-only-Spalten **tatsächlich gelesen** werden (`.select('…')`, Property-Zugriffe). Nur diese wandern; ungenutzte Spalten fallen mit `v_faelle` **ersatzlos** weg. Ergebnis: eine kuratierte Migrations-Spalten-Liste (deutlich < 173).

### 4.2 `v_claim_full` auf Parität bringen (Schritt 2a)
Die genutzten v_faelle-only-Spalten aus `v_claim_base` in `v_claim_full` durchreichen (die Daten sind bereits in der Basis). `v_claim_full` behält seine eigenen Spaltennamen; wo `v_faelle` abweichende Aliase nutzt, mappen die Consumer beim Umzug. Ein v_faelle→v_claim_full-Namens-Mapping-Dokument entsteht als Teil des Plans.

### 4.3 Consumer in 6 Wellen umziehen (Schritt 2b)
Jede Welle = eigener PR + Prod-Smoke, zwischen Wellen stopp-bar:

1. **admin-Widgets/Seiten** (DashboardStats, KritischeUpdates, MonatsUmsatzForecast, Tageskalender, WichtigeUpdates, admin/page, finance/hub, kalender, …)
2. **Crons** (abrechnung-erstellen, fall-abschluss, gutachter-erinnerungen, no-show-timeout, ocr-gutachten, …)
3. **Gutachter-Portal** (fall/[id], stellungnahme, kalender, abrechnung, termin.ics, dispatch/sachverstaendige)
4. **Kunde-Portal** (kunde/page, onboarding, get-kunde-faelle)
5. **Fallakte** (`faelle/[id]/*` — FallContext, Sections, stammdaten) — höchstes Risiko, isolierte Welle
6. **AI/Copilot** (briefing, briefing-structured, copilot/briefing, claim-ai/context, autophase, get-claim-detail)

### 4.4 `v_faelle` droppen (Schritt 2c)
Nach `git grep v_faelle_mit_aktuellem_termin` = 0: `DROP VIEW public.v_faelle_mit_aktuellem_termin` via `apply_migration`. Vorher `pg_depend`-Check (keine anderen Views hängen dran).

## 5. Out of Scope (bewusst)

Die große **Detail-View-Zerlegung** (`v_claim_summary` / `v_claim_opponent` / `v_claim_financials` / … aus dem Audit) ist ein **separates späteres Architektur-Projekt** — nicht in diesem Spec. Dieser Spec bringt genau **eine** Präsentations-View (`v_claim_full`); ihre weitere Zerlegung ist Folge-Arbeit.

## 6. Reihenfolge & Sicherheit

- **Phase 1 zuerst**, vollständig (mergen → deployen → Prod-Smoke), bevor Phase 2 beginnt. Sie steht für sich und liefert die Gutachten-Konsistenz sofort für alle Consumer.
- **Phase 2 in Wellen**, jede mit eigenem Prod-Smoke (Regel 4).
- **Regel 2:** jede DDL via `apply_migration`, File-Name == getrackte Version (kein Twin-Drift), volle `CREATE OR REPLACE`.
- **Koordination (v_claim_full = geteilte Fläche):** mehrere Lanes fassen `v_claim_full` an — `a6c863e2` (dokumente-jsonb-Aggregat) und die **Detail-View-Zerlegungs-Lane(s)** (`7572149e` / `detail-view-*`, Aaron 14.07.: „aktuell wird daran gearbeitet"). **Phase 1 fasst `v_claim_full` NICHT an** (es erbt via Passthrough) → **kein Clobber, sicher parallel baubar**. **Phase 2 Schritt 2a fasst `v_claim_full` an** → vor jedem `CREATE OR REPLACE v_claim_full` mit a6c863e2 **und** der Detail-View-Lane koordinieren, auf deren Live-Def aufbauen, nie gleichzeitig replacen. Wenn die Detail-View-Zerlegung `v_claim_full` bis dahin schon zerlegt hat, ist Phase-2-Schritt-2a ggf. hinfällig (die genutzten Spalten leben dann in Detail-Views) → Reihenfolge vor Phase-2-Start mit Aaron + der Lane klären.

## 7. Risiken

| Risiko | Mitigation |
|---|---|
| Phase-1-Wertdrift | Shape-Diff-Harness `nonexempt_diffs=0` + Column-Snapshot vor/nach |
| v_claim_full-Clobber mit a6c863e2 | Vor Replace pingen, auf Live-Def bauen |
| Fallakte-Regression (Welle 5) | Isolierte Welle, eigener Prod-Smoke, höchste Sorgfalt |
| Cron-Regression (Welle 2) | Manueller Cron-Aufruf als Prod-Smoke je Route |
| Ungenutzte v_faelle-Spalte doch irgendwo gelesen | grep über `.ts`+`.tsx`, inkl. dynamischer Property-Zugriffe; im Zweifel mit-durchreichen |
| fresh-Replay bricht (Supabase-Preview) | Volle CREATE OR REPLACE, kein replace-Guard |

## 8. Erfolgs-Kriterien

- Phase 1: `v_claim_base` joint `v_gutachten_werte` statt roh `gutachten`; Shape-Diff = 0; Prod-Smoke grün.
- Phase 2: `v_faelle_mit_aktuellem_termin` existiert nicht mehr; alle 63 Consumer lesen `v_claim_full`/Entities; jede Welle prod-gesmoked; `v_claim_full` trägt nur die genutzten Zusatz-Spalten.
