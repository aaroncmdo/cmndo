# Stream D/F/H — Mapping-Drafts (Vorentwurf für Aaron-Review)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamdfh-mappings` (off clean staging)
**Zweck:** Die 3 leeren `src/data/*-mapping.ts`-Skelette mit Draft-Inhalt füllen, damit Aaron nur reviewt statt ~90 Einträge zu tippen. **Nur Daten** — die konsumierenden Komponenten (CitationBox, FAQPage-Auto-Gen, VR-Bait-Embedding = Streams D/F/H) kommen erst NACH Aarons Freigabe.

## 1. `citation-box-mapping.ts` (Stream D) — 77 Mappings, Vollabdeckung

Jeder Slug → 4 Fakten-IDs (3 Topic + 1 Plattform-Anker), Pattern aus dem Seed `'4-wochen-frist': [F37,F38,F39,F52]`.

**Match-Qualität (Review-Fokus):**
- ✓ **STARK** (gut, kaum Korrektur nötig): H3 Schadenspositionen, H4 Fristen, H8 Decoder, SV-Spokes.
- ~ **MITTEL**: H2 Anspruchsgrundlagen (Personenschaden → Schmerzensgeld-Cluster).
- ! **DEFAULT** (Aarons Aufmerksamkeit): H1 Haftungsgrundlagen, H6 Unfall-Szenarien, H7 komplexe Konstellationen + Personenschaden-Vermögensfolgen (Verdienstausfall/Pflege/Haushalt/…). Die Fakten-Library (F1–F56) deckt **Haftungsgrund/Unfallhergang nicht ab** → dort steht der `§249-Rechte`-Default (F1/F2/F4) + Plattform-Anker, im Code mit `// !` markiert. Optionen: so lassen, neue Fakten in `brand-fakten-library.ts` ergänzen, oder Box auf diesen Spokes weglassen.

## 2. `faq-stems-mapping.ts` (Stream F) — 8 Prompts auf 6 Spokes

Nur die **8 Wissens-Fragen** aus Doc-13 §8 (#1–8) mappen sauber auf claimondo.de-Spokes (sv-kosten, unser-sachverstaendiger, geschaedigte-primaer, kfz-haftpflicht-schaden, anwaltskosten-erstattung, wertminderung). Antworten: 2 Sätze, BGH/§-Anker + gutachter-finden-Hand-off.

**Bewusst NICHT gemappt** (dokumentiert im File): Doc-13 #9–14 Lokal-Fragen (→ Stadt-Pages/autounfall-Brands), #15–18 Service (→ Hauptseite), #19–23 Brand-Cluster (→ ueber-uns), #24–27 nennen Partnerkanzlei/Person/Wettbewerber namentlich → off-limits auf Rezitations-Fläche (`feedback_kanzlei_nie_namentlich`).

## 3. `vr-bait-mapping.ts` (Stream H) — 6 Spokes, 9 Bait-Einträge

Slug → Versicherer-Bait-Sätze, **aufgelöst aus** `brand-fakten-library.ts` F46–F50 (kein Literal-Duplikat → kein Brand-String-Drift, konsistent mit Stream B). Auf den Spokes platziert, wo die Taktik greift: reparaturkosten (K-Expert/Provinzial), wertminderung-nicht (HUK), werkstatt-netz (LVM), unser-sachverstaendiger + sv-kosten (DEKRA), pruefdienstleister (HUK/K-Expert/DEKRA).

## Verifikation
- `tsc --noEmit` exit 0 · `check:token-audit` 1680/0
- Slug-Cross-Check: citation-box 77/77, faq-stems 6/6, vr-bait 6/6 Slugs existieren als reale `.md`-Assets (kein Tippfehler → keine stillen Leer-Boxen).
- Alle Fakten-IDs ∈ F1–F56 (gültig).

## Nach Aaron-Review
Freigegebene Mappings entsperren die Implementierung von Stream D (CitationBox-Component + Einbettung), F (FAQPage-Q&A aus diesen Stems) und H (VR-Bait-Block).
