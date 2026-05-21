# CMM-44 SP-G PR2 — Call-Site-Inventur (paren-balanced Re-Grep, 2026-05-20)

Generiert via `node scripts/cmm44-spg-grep.mjs` — kontext-sicherer Parser, der `claims:claim_id(...)` + `gutachten(...)`-Sub-Embeds als false-positives ausschließt.

**Total: 22 Treffer** in 17 Files. Klassifizierung pro Site (Muster A-G aus dem Plan-Header).

## Übersicht pro Spalte

| Spalte | Hits | Notiz |
|---|---:|---|
| `gutachten_eingegangen_am` | 11 | meistgenutzter SP-G-Reader |
| `gutachten_betrag` | 4 | Finance + Cron |
| `nutzungsausfall_gesamt` | 3 | Klasse-C (3× makler-/copilot-Display) |
| `reparaturkosten` | 2 | Cardentity + PDF-Kanzlei |
| `ki_kalkulation` | 2 | Schadenskalkulation + Onboarding |
| Andere 13 Spalten | 0 | nicht direkt gegriffen — laufen vermutlich über v_*-View (Pattern E, kein Change) |

## Detail-Inventur (alle 22 Hits)

| # | Datei:Zeile | Spalte | Muster | Anmerkung |
|--:|---|---|---|---|
| 1 | `src/app/admin/finance/(hub)/offene-faelle/page.tsx:45` | `gutachten_betrag` | **A** | direkt-Select Finance-Übersicht |
| 2 | `src/app/api/cardentity/typ-b/route.ts:21` | `reparaturkosten` | **A** | Cardentity-Typ-B-Read |
| 3 | `src/app/api/cron/abrechnung-erstellen/route.ts:88` | `gutachten_betrag` | **A** | Cron Abrechnungs-Erzeugung |
| 4 | `src/app/api/kunde/gutachten/weiterleiten/route.ts:37` | `gutachten_eingegangen_am` | **A** | Kunde-Weiterleitung-Trigger |
| 5 | `src/app/api/pdf/kanzlei-paket/[id]/route.tsx:20` | `reparaturkosten` | **A** | PDF-Generation |
| 6 | `src/app/api/schadenkalkulation/route.ts:99` | `ki_kalkulation` | **B** (Write) | Schadenkalkulation-Insert/Update |
| 7 | `src/app/api/seed-testdata/route.ts:497` | `gutachten_eingegangen_am` | **F (Test-Fixture, OOS)** | claimloses Test-INSERT — analog SP-B out-of-scope |
| 8 | `src/app/gutachter/abrechnung/page.tsx:79` | `gutachten_eingegangen_am` | **A** | SV-Abrechnungsseite |
| 9 | `src/app/gutachter/fall/[id]/actions.ts:38` | `gutachten_eingegangen_am` | **B (Write)** | SV-Action 1 |
| 10 | `src/app/gutachter/fall/[id]/actions.ts:78` | `gutachten_eingegangen_am` | **B (Write)** | SV-Action 2 |
| 11 | `src/app/kunde/onboarding/actions.ts:80` | `ki_kalkulation` | **B (Write)** | Kunde-Onboarding-Update |
| 12 | `src/components/makler/akte-detail/MaklerAkteDetail.tsx:118` | `nutzungsausfall_gesamt` | **F (Klasse-C-Read)** | JSX-Display `fall.nutzungsausfall_gesamt` |
| 13 | `src/components/makler/akte-detail/MaklerAkteDetail.tsx:444` | `nutzungsausfall_gesamt` | **F (Klasse-C-Read)** | JSX-Display `fall.nutzungsausfall_gesamt` |
| 14 | `src/lib/abrechnung/process-case-billing.ts:28` | `gutachten_betrag` | **A** | Abrechnungs-Prozess |
| 15 | `src/lib/analytics/conversion.ts:35` | `gutachten_eingegangen_am` | **A** | Conversion-Analytics direct |
| 16 | `src/lib/analytics/conversion.ts:62` | `gutachten_eingegangen_am` | **D (nested faelle(...))** | von leads/anderer Tabelle |
| 17 | `src/lib/analytics/finance.ts:15` | `gutachten_eingegangen_am` | **A** | Finance-Analytics |
| 18 | `src/lib/analytics/sv-performance.ts:54` | `gutachten_eingegangen_am` | **A** | SV-Performance-Analytics |
| 19 | `src/lib/claims/get-kunde-faelle.ts:392` | `gutachten_eingegangen_am` | **A** | Kunde-Fall-Detail-Loader |
| 20 | `src/lib/finance/fall-finanzen.ts:48` | `gutachten_betrag` | **A** | Finance-Berechnung |
| 21 | `src/lib/makler/copilot-prompt.ts:158` | `nutzungsausfall_gesamt` | **F (Klasse-C-Read)** | Copilot-Prompt-Display |
| 22 | `src/lib/sla/blocker-detection.ts:34` | `gutachten_eingegangen_am` | **A** | SLA-Blocker-Detection |

## Klassen-Splitting für den Sweep

- **Pattern A — Read-Sweep (15 Sites):** 1, 2, 3, 4, 5, 8, 14, 15, 17, 18, 19, 20, 22 + analytics/conversion #16 (nested) = ~14. Datenfluss: `from('faelle').select('gutachten_eingegangen_am, ...')` → `from('faelle').select('claim_id, ...').then(g=...)` mit zusätzlichem `from('gutachten').select(...)`-Lookup (oder via `claims:claim_id(gutachten(...))`-Embed).
- **Pattern B — Write-Sweep (3 Sites):** 6, 9, 10, 11. SP-G-Write zu `gutachten.upsert({...}, {onConflict:'claim_id'})`, SP-G-Spalten aus `faelle`-Write **entfernen**. Guarded.
- **Pattern D — Nested-Embed (1 Site):** 16 (`conversion.ts:62`). Im umschließenden Select das `faelle(...)`-Embed um `claims:claim_id(gutachten(...))` ergänzen, SP-G-Spalte dort lesen.
- **Pattern F — Klasse-C-JSX (3 Sites):** 12, 13, 21. `fall.nutzungsausfall_gesamt` → derived calc `(g?.gutachten_nutzungsausfall_tagessatz_eur ?? 0) * (g?.nutzungsausfall_tage ?? 0)`. Bedingt vom Loader, der diese Werte aus gutachten holt — siehe upstream-Loader für `MaklerAkteDetail` und `copilot-prompt`.
- **Out-of-Scope (1 Site):** 7 (`seed-testdata/route.ts:497`) — claimloses Test-Fixture, analog SP-B.

**~20 effektive Sites zu migrieren.** Klein genug für 1 PR (kein Cluster-Schnitt).

## Beobachtung: View-Reader nicht in der Inventur

Mein Re-Grep schließt explizit `claims:claim_id(...)` und `gutachten(...)`-Sub-Embeds aus → Reader, die diese SP-G-Spalten via `v_faelle_mit_aktuellem_termin` / `v_claim_full` / `faelle_sv_view` lesen, tauchen hier **nicht** auf. Das ist korrekt: PR1 Block 3 hat alle 3 Views repointet, sodass `f.<col>` jetzt `g.<new> AS <old>` ist — Output-Spalten-Name unverändert, Reader brauchen keinen Code-Change (**Pattern E — no-op**).
