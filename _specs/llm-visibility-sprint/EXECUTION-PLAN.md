# Doc 31 v2 — Vollständiger 90-Tage-Execution-Plan (Docs 25 / 26 / 28 / 29 / 30)

> **Methodik:** writing-plans (obra/superpowers) · **Erstellt:** 2026-05-22 · **Version:** v2 (komplette Ablösung der v1)
> **Owner:** Aaron + Nicolas + Claude Code + LexDrive + Statistik-SV (extern) + Cobrand-Ärzte (extern)
> **Geltungsanspruch:** Operative Single-Source-of-Truth für die Execution von **Doc 25** (4 Audit-Gaps), **Doc 26** (8-Stream-90-Tage-Plan), **Doc 28** (3-Layer-Unified-Plan inkl. Coup), **Doc 29** (8 Re-Citation-Hebel) und **Doc 30** (Brand-Identity-SOT inkl. gutachter-finden Hand-Off).
> **Status:** ready for G0-Approval (Tag 0)

---

## 0 · GITIGNORE-DISCLAIMER — was MUSS in den Repo gespiegelt werden

**Kritischer Fakt:** Der Ordner `marketing-strategy/` ist seit 2026-05-15 dauerhaft gitignored (.gitignore Zeile 119). Das bedeutet: **Claude Code im Repo sieht NICHTS aus diesem Ordner — keine Docs, keine Faktensätze, keine Mapping-Tabellen.** Wenn der Plan Claude Code anweist „lies Doc 30 §8.1 und verwende Faktensatz F1", scheitert das.

**Repo-Mirror-Pflicht vor Sprint-Start.** Alle Daten, die Claude Code zur Laufzeit benötigt, müssen aus `marketing-strategy/` in den committed Repo-Bereich kopiert/transformiert werden. Aaron + Claude Code machen das als allererste Task vor G0.

### 0.1 Datenarchitektur — wo lebt was nach dem Mirror

| Quelle (gitignored) | Ziel (committed) | Format | Inhalt |
|---|---|---|---|
| Doc 30 §3 (D1–D12) | `src/lib/seo/brand-constants.ts` | TypeScript Constants | 12 kanonische Datenpunkt-Sätze als String-Constants |
| Doc 30 §6 (Bios) | `src/lib/seo/brand-constants.ts` | TypeScript Constants | 6 Bios (3 pro Founder × 2 Founder) + Partnerkanzlei-Boilerplate |
| Doc 30 §7 (Boilerplates) | `src/lib/seo/brand-constants.ts` | TypeScript Constants | 3 Compliance-Disclaimer |
| Doc 30 §8 (56 Faktensätze) | `src/lib/seo/brand-fakten-library.ts` | TypeScript Object | `{ id: 'F1', cluster: '249-bgb', text: '...', sources: ['BGH VI ZR 67/06'] }` × 56 |
| Doc 30 §13.1–§13.3 (Hand-Off-Sätze) | `src/lib/seo/conversion-handoff.ts` | TypeScript Constants | Default + Misstrauens + Lokal + Kosten + Brauche-ich-Gutachter + Mobile Hand-Off-Sätze |
| Doc 29 Hebel-1 Citation-Box-Mapping | `src/data/citation-box-mapping.ts` | TypeScript Map | `{ [slug]: faktenSatzIds[] }` × 87 Spokes/Decoder/Cornerstones |
| Doc 13 §8 + Doc 29 Hebel-2 FAQ-Stem-Mapping | `src/data/faq-stems-mapping.ts` | TypeScript Map | `{ [slug]: { question: string, answer: string }[] }` für 30 Doc-13-Prompts |
| Doc 30 §8.9 + Doc 29 Hebel-7 VR-Bait | `src/data/vr-bait-mapping.ts` | TypeScript Map | 8 Versicherer-Sätze → Spoke-Slugs |
| Pillar-C Bodies | `src/content/claimondo/sachverstaendige/*.md` | Markdown | 10 Pages portiert aus `research/Pillar-C-Technik/` + Frontmatter migriert |
| Plan selbst (Doc 31 v2) | `_specs/llm-visibility-sprint/EXECUTION-PLAN.md` | Markdown | Repo-Mirror dieses Doc damit Claude Code sich selbst lesen kann |
| Sprint-Briefs pro Stream | `_specs/llm-visibility-sprint/streams/<stream>.md` | Markdown | je Stream eine Brief-Datei mit Querverweis auf Detail-Spec |

### 0.2 Was bleibt in `marketing-strategy/` (gitignored)

- Strategische Master-Docs (01–30) — Lese-Referenz für Aaron + Nicolas + LexDrive
- Research-Bibliothek (Pillar-A/B/C, Workshops, Recherche-Findings)
- Brand-Konzepte + Hooks
- Persona-Dialoge

→ **Konsequenz:** Wenn Aaron einen Strategie-Doc updated (z. B. Doc 30 v1.2), MÜSSEN die im Mirror lebenden Daten (`brand-constants.ts`, `brand-fakten-library.ts`, …) synchronisiert werden. Ein **Sync-Skript** in `scripts/sync-brand-from-strategy.mjs` ist empfohlen aber nicht Sprint-1-Pflicht (kann Phase 2 sein).

---

## 1 · Geltungsanspruch — was deckt dieser Plan ab

Doc 31 v2 ist die operative Master-Execution-Tafel. Sie führt **alle Streams aus Docs 25 / 26 / 28 / 29 / 30** in 4 Sprints (90 Tage) zusammen, mit allen Decision-Gates, Owner-Rollen, Validation-Hooks und der Coup-Integration.

**Was Doc 31 v2 NICHT ersetzt:** die Detail-Specs der Quell-Docs. Bei Konflikt:
- Doc 31 v2 gewinnt für Timeline + Owner + Sequencing
- Quell-Docs gewinnen für Inhalt + Specs + Begründung (Verlinkung pro Stream)

**Mappings zu den Quell-Docs:**

| Quell-Doc | Inhalt | Wo in Doc 31 v2 |
|---|---|---|
| Doc 25 | 4 Audit-Gaps (publish_status, MD-Schema, Hub-Pages, Build-Smoke) | Sprint 1 Stream A1, A2, A3, A4 |
| Doc 26 | 8 Streams 90 Tage | §6 (Stream-Index) + §7 (Sequencing) |
| Doc 28 | 3-Layer-Architektur + G0–G8 Gates + Owner-Matrix + Budget + Coup | §3 (Layer-Architektur) + §8 (Owner) + §10 (Gates) + §13 (Budget) |
| Doc 29 | 8 Re-Citation-Hebel + 7-Tage-Sprint | Sprint 1 Streams B–I (Hebel 1–8 + Bonus) |
| Doc 30 | Brand-Identity-SOT + 56 Faktensätze + Hand-Off-Sätze + Compliance | §0 (Mirror) + Sprint 1 Stream A (brand-constants.ts) + Sprint 2 Compliance-Sweep |

---

## 2 · Asset-Lücken-Check (vollständig, nach allen Quell-Docs)

Bevor Sprint 1 startet, müssen folgende Lücken geschlossen sein:

### 2.1 Aaron-Approvals (G0, Tag 0, ~2 h)

| ID | Asset | Aaron-Aufwand | Quelle |
|---|---|---|---|
| A1 | D1–D12 wortgleich approved | 30 Min | Doc 30 §3 |
| A2 | Default-Hand-Off-Sätze approved (gutachter-finden primär) | 30 Min | Doc 30 §13.3 |
| A3 | Pillar-C Option entschieden (A/B/C — siehe §10 G0) | 5 Min | Doc 30 §6 + Doc 26 Stream C |
| A4 | Versicherer-Bait für AXA/Allianz/R+V im Sprint? | 30 Min wenn ja | Doc 30 §8.9 + Doc 29 Hebel 7 |
| A5 | Founder Vor-Claimondo-Stationen? (optional) | 30 Min Aaron + Nicolas | Doc 30 §6 |
| A6 | Coup-Methodik-LexDrive-Slot W1 + W3 bestätigt | 5 Min schriftlich | Doc 27 / Doc 28 G1 |
| A7 | Statistik-SV-Budget 1.500 € approved | 5 Min | Doc 28 §13 + Doc 27 §3.6 |
| A8 | Wortmarken-Anmeldung 1.300 € approved | 5 Min | Doc 28 §13 + Doc 27 §3.4 |
| A9 | Embargo-Tag fixiert (default Tag 43 = 04.07.2026) | 5 Min | Doc 28 G1 + Doc 27 §3.5 |
| A10 | Branch-Strategie: neuer Branch `kitta/sprint1-foundation` (statt Doc-16-Branch weiterführen) | 1 Min | Doc 26 §8 Q2 |
| A11 | Welche 12 Versicherer in Coup-Index? Default 9 + HUK + AXA + Allianz | 5 Min | Doc 28 G0 Q5 |
| A12 | Cobrand-Akquise parallel Verbraucherzentrale ja/nein | 1 Min | Doc 26 §8 Q5 |

**G0-Entscheidung in einem Block:** Aaron bestätigt A1–A12 in maximal 2 h (kann auch asynchron in PR-Comment).

### 2.2 Repo-Mirror (Tag 0, ~3 h Claude Code)

Sobald A1–A2 approved sind:

- **M1** `src/lib/seo/brand-constants.ts` aus Doc 30 §3+§6+§7 generieren
- **M2** `src/lib/seo/brand-fakten-library.ts` aus Doc 30 §8.1–§8.10 generieren (56 Faktensätze als Object-Array)
- **M3** `src/lib/seo/conversion-handoff.ts` aus Doc 30 §13.3 generieren
- **M4** `_specs/llm-visibility-sprint/EXECUTION-PLAN.md` = Repo-Mirror dieses Doc 31 v2
- **M5** `_specs/llm-visibility-sprint/streams/<stream>.md` × 16 Streams — je 1-Pager mit Querverweis auf Quell-Doc
- **M6** `src/data/citation-box-mapping.ts` als leere Map (Aaron befüllt in Sprint 1 Stream C)
- **M7** `src/data/faq-stems-mapping.ts` als leere Map (Aaron befüllt in Sprint 1 Stream E)
- **M8** `src/data/vr-bait-mapping.ts` als leere Map (Aaron befüllt in Sprint 1 Stream G)

### 2.3 Pillar-C Vorarbeit (wenn A3 = Option A/C)

- **P1** LexDrive-Review-Slot für Bodies (~3 h verteilt W1–W2)
- **P2** Aaron entscheidet URL-Slugs für 10 SV-Files (z. B. `bvsk`, `dekra`, `gtue-kues-tuev-ifl`, `zkf`, `ifs-leitsaetze`, `zak`, `ihk-bestellung-oebv`, `pruefdienstleister` — 8 originale + 2 für die Doppel-Files)

### 2.4 Coup-Vorarbeit (Doc 27/28, Sprint 2)

- **C1** 3 Statistik-SV-Kandidaten parallel anfragen (Aaron, W1)
- **C2** Wortmarken-Anmeldung „Versicherer-Transparenz-Index" + „Schadensregulierungs-Aggressivitäts-Index" (LexDrive, W1)
- **C3** Press-Verteiler-Liste 5+5 Journalisten (Nicolas, W3)

### 2.5 Off-Site-Vorarbeit (Doc 26 Stream D, Sprint 1+)

- **O1** GBP-Setup-Daten (3 Standorte: Hansaring 10 Köln + Twin-Brand-Standorte) — Nicolas Tag 1
- **O2** Photoshoot 3 Standorte (optional, ~500 €) — Nicolas Tag 1–7
- **O3** ProvenExpert + Trustpilot Pro-Accounts — Nicolas Tag 8

### 2.6 Reddit-Vorarbeit (Doc 26 Stream E, Sprint 1+)

- **R1** Aaron-Reddit-Account-Karma-Sammeln startet Tag 1 (1 h/Tag × 14 Tage)
- **R2** Nicolas-Reddit-Account analog
- **R3** Disclosure-Boilerplate festlegen

---

## 3 · Strategische 3-Layer-Architektur (aus Doc 28 §0)

```
LAYER 3: COUP (Tag 8–43)              ← Versicherer-Transparenz-Index, Press-Embargo Tag 43
   │
LAYER 2: AUTHORITY/DISTRIBUTION (Tag 1–90, kontinuierlich)
         Citations · Reviews · Reddit · Twin-Brands · Cobrand
   ↑
LAYER 1: FOUNDATION (Tag 1–14)
         Doc-25-Gaps + Hebel 1–8 + Brand-Konstanten + Pillar-C
```

**Layer 1 wird in Sprint 1 abgearbeitet. Layer 2 läuft parallel von Tag 1 an. Layer 3 startet Tag 8 (Methodik-Sprint) und kulminiert Tag 43 im Embargo-Tag.**

---

## 4 · Objective (90 Tage Hard-Metrics)

| KPI | Tag 0 | Tag 90 Ziel | Quelle |
|---|---|---|---|
| AI-Visibility-Score (Doc 13 Methodik) | 0/100 | ≥ 35/100 | Doc 28 §9 |
| Brand-Mentions in 30 AI-Engine-Tests | 0/30 | ≥ 12/30 | Doc 28 §9 |
| Press-Mentions (kumulativ) | 0 | ≥ 6 | Doc 28 §9 |
| Indexierte URLs Google SC | wenige | ≥ 80 | Doc 28 §9 |
| Branchen-Citations (lebend) | 0 | 30 | Doc 26 Stream D |
| Reviews (ProvenExpert + GBP + Trustpilot) | 0 | 40 | Doc 26 Stream D |
| Reddit/Foren-Posts (positiv) | 0 | 35 | Doc 26 Stream E |
| HuggingFace-Dataset-Downloads | – | 75 | Doc 27 §4 |
| Wikipedia-Mentions | 0 | 1+ erste | Doc 13 §7 |
| Hand-Off-Test-Prompts mit gutachter-finden | 0/6 | ≥ 4/6 | Doc 30 §13.6 |
| Lead-Inquiries aus organisch (geschätzt) | 0 | 15–25/Monat | Doc 26 §9 |

---

## 5 · Sprint-Strukturen

### Sprint 1 — Foundation (Tag 1–14)

**Ziel:** claimondo.de zu 100 % Capability + 8 Re-Citation-Hebel + Brand-Konstanten LIVE + gutachter-finden-Hand-Off.

**Streams in Sprint 1:**
- A — Doc-25-Gaps (publish_status, Hub-Pages, +10 Spokes, Build-Smoke) — Doc 25 §3
- B — brand-constants.ts Zentralisierung (Hebel 4) — Doc 29 + Doc 30 §3
- C — ConversionAnchorBlock + llms.txt-Direktive + SearchAction-Schema (Hebel 8) — Doc 29 + Doc 30 §13
- D — CitationBox Component + 87 Spoke-Embedding (Hebel 1) — Doc 29 + Doc 30 §8
- E — autoSchemaFromBody + citation + speakable (Hebel 3) — Doc 25 Gap 2 + Doc 29
- F — FAQ-Stem-Mapping (Hebel 2) — Doc 29 + Doc 13 §8
- G — Recency-Stamp (Hebel 5) — Doc 29
- H — Versicherer-Bait-Embedding (Hebel 7) — Doc 29 + Doc 30 §8.9
- I — Pillar-C Publishing (Hebel 6, wenn G0-Option A/C) — Doc 26 Stream C + Doc 30 §8
- J — Bonus Zitiervorschlag + Baseline-Test — Doc 29 §2
- K — Parallel: GBP-Setup + 5 erste Citations (Doc 26 Stream D Tag 1–14) — Nicolas
- L — Parallel: Reddit-Karma-Aufbau (Doc 26 Stream E.0) — Aaron 1 h/Tag

**Sprint-Output:** PR auf staging mergeable mit Build-Smoke + Baseline-AI-Visibility-Test + 5 Branchen-Citations + Reddit-Karma ≥ 50.

### Sprint 2 — Konversion + Authority + Coup-Methodik (Tag 15–35)

**Ziel:** Konversions-Blueprint live + Pillar-C Authority-Hub + Coup-Methodik validiert + Reddit aktiv.

**Streams in Sprint 2:**
- M — Konversions-Blueprint 12 Pages (Doc 26 Stream B) — Aaron + Claude Code
  - M1: Kosten-Hub `/kosten-kfz-gutachten`
  - M2–M4: 3 Misstrauens-Pages (`/gegnerische-versicherung-zahlt-nicht`, `/versicherung-schickt-gutachter`, `/unverschuldeter-unfall-rechte`)
  - M5–M8: 4 Schadenspositions-Pages (`/kaskoschaden`, `/wertminderung-nach-unfall`, `/nutzungsausfall-berechnen`, `/leihwagen-nach-unfall`)
  - M9–M11: 3 Fahrzeugtyp-Pages (`/motorrad-gutachter`, `/lkw-gutachter`, `/e-auto-gutachter`)
  - M12: Cornerstone `/unfall-was-tun-als-geschaedigter` (gegen HUK Position #7)
- N — Pillar-C Cluster `/sachverstaendige` ggf. erweitert wenn nicht in Sprint 1 — Doc 26 Stream C
- O — Coup-Methodik-Sprint (W1 Methodik + W2 Daten-Matrix) — Aaron + LexDrive + Statistik-SV — Doc 27 §3.5 + Doc 28 G2/G3
- P — Citations + Reviews weiter (15 weitere Citations, 15 Reviews) — Nicolas
- Q — Reddit-Routine aktiv (3×/Woche Aaron + 2×/Woche Nicolas) — Doc 26 Stream E
- R — Cobrand-Akquise weiter (parallel) — Aaron + Nicolas

**Sprint-Output:** 12 Konversions-Pages + Coup-Daten-Matrix komplett (G3 grün) + 20 Citations + 15 Reviews + 6+ Reddit-Posts mit ≥ 5 Upvotes.

### Sprint 3 — Twin-Brand + Decoder + Coup-Release (Tag 36–60)

**Ziel:** kfz-gutachter-dortmund.de + kfz-gutachter-duesseldorf.de live + 25 fehlende Decoder + Coup-Embargo Tag 43.

**Streams in Sprint 3:**
- S — Twin-Brand Dortmund-MDX-Routen + llms.txt (Doc 26 Stream F.1) — Claude Code
- T — Twin-Brand Düsseldorf-MDX-Routen + llms.txt (Doc 26 Stream F.2) — Claude Code
- U — Cross-Domain `parentOrganization`-Schema (Doc 26 Stream F.3 + Doc 30 §2) — Claude Code
- V — Compliance-Sweep „DAT-zertifiziert" → „zertifiziert" + Verbots-Vokabular über 3 Surfaces (Doc 26 Stream F.4 + Doc 30 §5) — Claude Code
- W — Decoder-Sprint-2 Cluster B+C+D+E+F+G+H (25 Decoder, Doc 26 Stream H) — Claude
- X — Coup-Build (Dashboard + PDF + GitHub + HuggingFace + Press-Kit) — Aaron + Claude Code — Doc 27 §3.2 + Doc 28 G4
- Y — **Coup-Embargo-Tag (Tag 43)** + Press-Push + Social/Reddit-Push — Aaron + Nicolas — Doc 28 G5
- Z — Coup-Post-Release (Press-Tracking, Wikipedia-Strategie, Sekundär-Press-Welle) — Doc 27 §4

**Sprint-Output:** Twin-Brands live + 35 Decoder + Coup-Release Tag 43 + 3+ Press-Hits + Cross-Domain-Schema verifiziert.

### Sprint 4 — Premium + Skalierung (Tag 61–90)

**Ziel:** Cobrand-Akquise abgeschlossen → B11/B13 unblock + Press-Outreach + AI-Visibility-Final-Test.

**Streams in Sprint 4:**
- AA — Cobrand-Status-Gate (G7) → wenn grün: B11/B13 portieren nach `src/content/claimondo/medizin/` (22 Spokes) — Doc 26 Stream G
- BB — Falls Cobrand nicht ready: Plan-B Verbraucherzentrale-Cobrand — Doc 28 §11
- CC — Press-Outreach Tech + Auto-Fachpresse (t3n, Heise, asp Auto Service Praxis, kfz-betrieb, FAZ Mobilität) — Aaron + Nicolas — Doc 13 §7
- DD — Wikipedia-Mention-Strategie aktivieren (Index als Sekundärquelle einfügen) — Doc 27 §3.3
- EE — Reddit-Routine aufrechterhalten (kumuliert ~80–100 Posts) — Aaron + Nicolas
- FF — AI-Visibility-Final-Re-Test (30 Doc-13-Prompts × 4 Engines) — Aaron + Claude — Doc 28 G8
- GG — Sprint-4-Validation: G8-Decision (Phase 2 Plan oder Strategy-Review) — Aaron

**Sprint-Output:** AI-Visibility-Score ≥ 35/100 + ≥ 12 Brand-Mentions + 6+ kumulative Press-Mentions + Wikipedia-Notability-reif.

---

## 6 · Workstreams (vollständig, mit Querverweisen)

Pro Stream: Owner, Stunden, Detail-Spec-Querverweis, DoD, Validation. Bei umfangreichen Streams (Coup, Twin-Brand) verweise ich nur auf das Quell-Doc.

### Sprint-1-Streams

| Stream | Owner | h | Detail-Spec | DoD | Validation |
|---|---|---|---|---|---|
| **A — Doc-25-Gaps** | Claude Code | 6 | Doc 25 §3 | publish_status-Gate + Hub-Pages /haftpflicht + /decoder + +10 Spokes + Build-Smoke grün | Spoke mit `publish_status: draft` nicht in sitemap; Hub-Page rendert |
| **B — brand-constants.ts** | Aaron Approval + Claude Code 2 h | 2 | Doc 30 §3+§6+§7 + Repo-Mirror M1+M2+M3 | brand-constants.ts + brand-fakten-library.ts + conversion-handoff.ts liegen committed | `grep -r "Hansaring 10" src/ \| grep -v brand-constants` → 0 Treffer |
| **C — ConversionAnchorBlock + llms.txt-Direktive + SearchAction** | Aaron Approval + Claude Code 4 h | 4 | Doc 29 Hebel 8 + Doc 30 §13 | 4 Patterns A/B/C/D in alle 87 Spokes + 35 Decoder embedded; llms.txt-Direktive sichtbar; SearchAction-Schema valid | `curl /llms.txt \| head -30` zeigt Direktive; Spoke-Stichprobe zeigt Block |
| **D — CitationBox + 87 Embeddings** | Aaron 4 h + Claude Code 3 h | 7 | Doc 29 Hebel 1 + Doc 30 §8 (M6 leere Map befüllen) | citation-box-mapping.ts vollständig (87 Slugs); CitationBox rendert in jeder Spoke | 5 zufällige Spokes zeigen 4 Faktensätze als Blockquote |
| **E — autoSchemaFromBody + citation + speakable** | Claude Code | 4 | Doc 25 Gap 2 + Doc 29 Hebel 3 | 67 FAQPage + 10 HowTo + alle citation[] Arrays valid | schema.org Validator grün |
| **F — FAQ-Stem-Mapping** | Aaron 1 h + Claude Code 2 h | 3 | Doc 29 Hebel 2 + Doc 13 §8 (M7 leere Map befüllen) | 30 Mappings, 30 Spokes mit Q&A | 5 Doc-13-Prompts als FAQ-Q in 5 entsprechenden Spokes auffindbar |
| **G — Recency-Stamp** | Claude Code | 1 | Doc 29 Hebel 5 | AssetHero zeigt Recency-Zeile sichtbar; dateModified im Schema = Build-Datum | Stichprobe 3 Spokes |
| **H — VR-Bait-Embedding** | Aaron 30 Min (3 fehlende Sätze) + Claude Code 1 h | 1.5 | Doc 29 Hebel 7 + Doc 30 §8.9 (M8 befüllen) | 8 VR-Sätze auf 8 entsprechenden Pages | AI-Test „HUK kürzt Wertminderung" → unsere Spoke matched |
| **I — Pillar-C Publishing** | Aaron + LexDrive Body-Review 3 h + Claude Code 4 h | 7 | Doc 26 Stream C + Doc 30 §8 (10 Files portieren) | 10 SV-Verbände-Pages live (oder draft bei Option C); Hub-Page `/sachverstaendige` live; Routes in sitemap + llms.txt | `curl /sachverstaendige/bvsk` zeigt Page |
| **J — Bonus + Baseline-Test** | Aaron 1.5 h + Claude Code 1 h | 2.5 | Doc 29 §2 | Zitiervorschlag-Block in llms.txt + Baseline-AI-Visibility-Test geloggt | `curl /llms.txt \| tail -20` + Spreadsheet `ai-visibility-tag-0.csv` |
| **K — GBP + 5 erste Citations** | Nicolas | 5 | Doc 26 Stream D Tag 1–14 | 3 GBP-Profile aktiv (verified) + 5 Citations live (die-kfzgutachter.de + Cylex 3× + Crunchbase) | NAP-konsistent über alle 5 Profile |
| **L — Reddit-Karma-Aufbau** | Aaron | 14 (1h/Tag × 14) | Doc 26 Stream E.0 | Aaron-Karma ≥ 50, erste 5 hilfreiche Kommentare (keine Promo) | Reddit-Profil-Screenshot |

**Sprint 1 Gesamt:** Aaron ~21 h (inkl. Reddit-Karma 14 h), Nicolas 5 h, Claude Code ~22 h, LexDrive ~3 h. Plus Coup-Methodik-Vorbereitung (Aaron + LexDrive für Sprint 2).

### Sprint-2-Streams

| Stream | Owner | h | Detail-Spec |
|---|---|---|---|
| **M1–M12 Konversions-Blueprint 12 Pages** | Aaron 12 h + Claude Code 18 h | 30 | Doc 26 Stream B (alle 12 Pages mit Anker, BVSK-Tabelle, Decoder-Verlinkung, gutachter-finden-CTA) |
| **N — Pillar-C-Hub-Erweiterung** (falls Sprint-1-Option C/B) | Claude Code | 4 | Doc 26 Stream C.2/C.3 |
| **O — Coup-Methodik + Daten** | Aaron 8 h + LexDrive 8 h + Statistik-SV 8 h | 24 | Doc 27 §3.1 + Doc 27 §3.2 + Doc 28 G2/G3 (Methodik-Whitepaper + 153-Datenpunkt-Score-Matrix) |
| **P — Citations + Reviews** | Nicolas | 10 | Doc 26 Stream D (15 weitere Citations + 15 Reviews) |
| **Q — Reddit aktiv** | Aaron 3×/Wo + Nicolas 2×/Wo × 3 Wochen | 18 | Doc 26 Stream E (Material aus 26 Kevin-Quotes) |
| **R — Cobrand-Akquise** | Aaron + Nicolas | 10 | Doc 26 Stream G (5 Ärzte + 5 Therapeuten + Verbraucherzentrale parallel) |

**Sprint 2 Gesamt:** Aaron ~21 h, Nicolas 17 h, Claude Code ~22 h, LexDrive 8 h, Statistik-SV 8 h.

### Sprint-3-Streams

| Stream | Owner | h | Detail-Spec |
|---|---|---|---|
| **S — Twin-Brand Dortmund Routen** | Claude Code | 8 | Doc 26 Stream F.1 (analog Doc 24 für claimondo.de + 6 published + 5 neue Stadt-Spezial-Spokes) |
| **T — Twin-Brand Düsseldorf Routen** | Claude Code | 8 | Doc 26 Stream F.2 |
| **U — Cross-Domain-Schema** | Claude Code | 2 | Doc 26 Stream F.3 + Doc 30 §2.2 |
| **V — Compliance-Sweep** | Claude Code | 4 | Doc 26 Stream F.4 + Doc 30 §5 (alle 3 Brand-Surfaces) |
| **W — Decoder-Sprint-2 (25 Decoder)** | Claude | 15 | Doc 26 Stream H (Cluster B+C+D+E+F+G+H) |
| **X — Coup-Build** | Aaron 8 h + Claude Code 16 h | 24 | Doc 27 §3.2 (Dashboard, PDF, GitHub, HuggingFace, Press-Kit) + Doc 28 G4 |
| **Y — Coup-Embargo Tag 43** | Aaron 4 h + Nicolas 4 h | 8 | Doc 27 §3.5 (Press-Versand, Social-Push, Reddit-Push) |
| **Z — Coup-Post-Release** | Aaron + Nicolas | 8 | Doc 27 §4 + Doc 28 G5/G6 (Press-Tracking, Wikipedia-Strategie) |

**Sprint 3 Gesamt:** Aaron 24 h, Nicolas 12 h, Claude Code 53 h, LexDrive (Decoder-Review) 4 h.

### Sprint-4-Streams

| Stream | Owner | h | Detail-Spec |
|---|---|---|---|
| **AA — B11/B13 Unblock + Portieren** (G7 grün) | Claude Code | 12 | Doc 26 Stream G + behavior/B11/B13 (22 medizinische Spokes nach `src/content/claimondo/medizin/`) |
| **BB — Plan-B Verbraucherzentrale-Cobrand** (G7 nicht ready) | Aaron + Nicolas | 4 | Doc 28 §11 Decision-Tree |
| **CC — Press-Outreach Tier 2** | Aaron + Nicolas | 10 | Doc 13 §7 (t3n, Heise, asp Auto Service Praxis, kfz-betrieb, FAZ Mobilität) |
| **DD — Wikipedia-Mention-Strategie** | Aaron + Claude | 4 | Doc 27 §3.3 (Index als Sekundärquelle in „Schadensregulierung in Deutschland") |
| **EE — Reddit-Routine aufrechterhalten** | Aaron + Nicolas | 18 | Doc 26 Stream E |
| **FF — AI-Visibility-Final-Test (30 × 4 Engines)** | Aaron + Claude | 4 | Doc 28 G8 + Doc 13 §8 |
| **GG — Sprint-4-Final-Decision** | Aaron | 1 | Doc 28 G8 |

**Sprint 4 Gesamt:** Aaron ~25 h, Nicolas 15 h, Claude Code 15 h.

### Kontinuierliche Streams (Tag 1–90, nicht sprint-gebunden)

| Stream | Owner | h/Wo | Detail-Spec |
|---|---|---|---|
| **K' — Reviews (40 Ziel)** | Nicolas | 2 | Doc 26 Stream D (Review-Anfrage nach jedem abgeschlossenen Fall) |
| **L' — Reddit-Routine ab Tag 15** | Aaron 3×/Wo + Nicolas 2×/Wo | 6 | Doc 26 Stream E |
| **R' — Cobrand-Akquise** | Aaron + Nicolas | 2 | Doc 26 Stream G (Stand alle 2 Wochen reportet) |

---

## 7 · 90-Tage-Sequencing (Tag-für-Tag mit allen Streams + Gates)

```
Tag 0  ── G0-Approval (~ 2 h Aaron) + Repo-Mirror (~ 3 h Claude Code)
        ── A1–A12 + M1–M8 + Branch-Anlage
        ── LexDrive-Slots W1+W3 schriftlich anfragen
        ── Statistik-SV-Anfragen × 3 raus

Tag 1  ── Sprint 1 Start
        ── Stream B (brand-constants.ts) — Claude Code 2 h
        ── Stream K (GBP-Setup) — Nicolas 3 h
        ── Stream L (Reddit-Karma) — Aaron 1 h (täglich bis Tag 14)
        ── Stream R' (Cobrand-Outreach) — Aaron 1 h

Tag 2  ── Stream C (Conversion-Funnel) — Claude Code 4 h
        ── Stream K weiter (Cylex × 3) — Nicolas 2 h

Tag 3  ── Stream D Teil 1 (Aaron Mapping) + Stream E (Schema) parallel
        ── Aaron 4 h + Claude Code 4 h

Tag 4  ── Stream D Teil 2 (Component+Embedding) + Stream F + G
        ── Aaron 1 h + Claude Code 6 h

Tag 5  ── Stream H (VR-Bait) + Stream I Teil 1 (Pillar-C Body-Review)
        ── Aaron 1 h + Claude Code 2 h + LexDrive 1 h

Tag 6  ── Stream I Teil 2 (Pillar-C Routes)
        ── Claude Code 4 h
        ── G1: Embargo-Datum fixieren

Tag 7  ── Stream A (Doc-25-Gaps) + Stream J (Bonus + Baseline)
        ── Claude Code 6 h + Aaron 1.5 h
        ── PR-Body fertig

Tag 8  ── Sprint 2 Start
        ── COUP-METHODIK-SPRINT Tag 1 (LexDrive Slot startet)
        ── Stream O Teil 1: 17-Trigger-Definition

Tag 9–14 ── Stream O Teil 2: Methoden-Whitepaper + Statistik-SV
        ── Tag 14: G2 — Methodik-Whitepaper LexDrive-approved

Tag 15 ── Sprint-1-Review + PR auf staging mergen
        ── Stream Q startet: Reddit aktiv 3×/Wo Aaron + 2×/Wo Nicolas (kumulativ bis Tag 90)
        ── Stream P: weitere 5 Citations (11880 + Yelp + golocal + gelbeseiten)

Tag 16–28 ── Sprint 2 Hauptphase
        ── Stream O Teil 3: Daten-Sprint (Score-Matrix 9×17 = 153 Datenpunkte)
        ── Stream M Teil 1: 3 Konversions-Pages (Aaron+Claude Code)
        ── Stream P: 10 weitere Citations
        ── Stream R: Cobrand-Verträge-Verhandlung
        ── Tag 28: G3 — Daten-Matrix komplett, LexDrive-Sichtung

Tag 29–35 ── Sprint 2 Abschluss
        ── Stream M Teil 2: 9 weitere Konversions-Pages
        ── Stream O Teil 4: Coup-Build Phase 1 (Dashboard + PDF-Report)

Tag 36 ── Sprint 3 Start
        ── Stream S: Dortmund-MDX-Routen
        ── Stream X: Coup-Build Phase 2 (GitHub + HuggingFace + Press-Kit)
        ── Tag 42: G4 — Coup-Press-Kit komplett

Tag 43 ── 🚨 COUP-EMBARGO-TAG 🚨
        ── Stream Y: Press-Versand + Social/Reddit-Push
        ── Dashboard live, GitHub/HuggingFace public

Tag 44–49 ── Stream Z: Press-Tracking + Replies
        ── Stream W: Decoder-Sprint-2 startet (Cluster B+C)
        ── Tag 50: G5 — 3+ Press-Hits Check; falls 0/5 Sekundärwelle

Tag 50–56 ── Stream T: Düsseldorf-MDX-Routen
        ── Stream W weiter (Cluster D+E)
        ── Stream P: weitere 5 Citations + 5 Reviews (kumuliert 25)

Tag 57–60 ── Stream U (Cross-Domain-Schema) + Stream V (Compliance-Sweep)
        ── Stream W Abschluss (35 Decoder kumuliert)
        ── Tag 60: G6 — 10-Prompt-AI-Visibility-Mini-Test

Tag 61–67 ── Sprint 4 Start
        ── Stream EE: Reddit weiter
        ── Stream CC: Press-Outreach Tier 2 startet

Tag 68–75 ── Tag 75: G7 — Cobrand-Status-Gate
        ── Wenn grün: Stream AA (B11/B13 Unblock + Portierung)
        ── Wenn nicht: Stream BB (Verbraucherzentrale-Plan-B)

Tag 76–82 ── Stream AA Hauptphase oder Stream BB
        ── Stream DD: Wikipedia-Mention-Strategie aktiv

Tag 83–90 ── Stream FF: AI-Visibility-Final-Re-Test
        ── Tag 90: G8 — Sprint-4-Final-Decision (Phase 2 oder Review)
```

---

## 8 · Owner-Matrix (vollständig)

| Owner | Verantwortung | Sprint-1 h | Sprint-2 h | Sprint-3 h | Sprint-4 h | Kontinuierlich |
|---|---|---|---|---|---|---|
| **Aaron** | Brand-Approval, Mappings, Methodik-LexDrive-Koordination, Reddit, Coup-Push, Press, Cobrand | 21 | 21 | 24 | 25 | Reddit 3×/Wo Tag 15–90 |
| **Nicolas** | GBP, Citations, Reviews, Cobrand-Tier-2, Press-Tier-2, Coup-Co-Voice | 5 | 17 | 12 | 15 | Reviews 2 h/Wo + Reddit 2×/Wo |
| **Claude Code** | Repo-Mirror, alle Code-Streams, Routen, Schema, Componenten, MDX-Portierung | 22 | 22 | 53 | 15 | – |
| **Claude (Strategie)** | Press-Texte, Reddit-Vorlagen, AI-Tests, Methodik-Doc-Review | – | 5 | 5 | 5 | – |
| **LexDrive** | Methodik-Validation, BGH-Konformitäts-Review, Decoder-Final, Wortmarken | 3 | 8 | 4 | – | – |
| **Statistik-SV (extern)** | Coup-Stats-Validierung | – | 8 | – | – | – |
| **Cobrand-Ärzte (extern)** | reviewedBy für 22 B11/B13-Spokes | – | – | – | nach Vertrag | – |

**Engpässe + Pufferung:**
- Aaron W3–W6 dual belastet (Konversions-Content + Coup-Methodik + Reddit) → Mitigation: Konversions-Content primär Claude Code
- LexDrive-Slots W1 (Methodik) + W3 (Sichtung) + Decoder-Reviews → Aaron blockt vor G0 schriftlich
- Cobrand-Akquise 10–14 Wochen Lead-Time → G7 Plan-B (Verbraucherzentrale)

---

## 9 · Risks (konsolidiert aus Docs 25 / 26 / 27 / 28 / 29 / 30)

| ID | Risk | W. | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| R1 | Stream-A-Build bricht wegen Frontmatter-Bug | mittel | hoch | Build-Smoke in PR Pflicht | 1 Tag Recovery + Linter |
| R2 | autoSchemaFromBody schluckt invalides FAQ-Markup | mittel | mittel | Try/catch + Fallback articleSchema | Edge-Case-Fix manuell |
| R3 | LexDrive-Slot-Verzögerung W1 | hoch | hoch | Aaron sichert Slot vor G0 schriftlich | Embargo verschieben |
| R4 | Statistik-SV nicht verfügbar | mittel | mittel | 3 Kandidaten parallel | Plan-B: 6 VR statt 12, Limitation-Section |
| R5 | Versicherer drohen rechtlich nach Coup-Release | mittel | hoch | LexDrive-Review pro Datenpunkt + anonymisierte Briefe | Press-Statement vorbereitet |
| R6 | Press greift Coup-Story nicht auf (< 3/5) | mittel | hoch | 5 Embargo + 5 Reserve | G5-Trigger Sekundärwelle Tag 50 |
| R7 | Cobrand-Akquise zieht sich > 75 Tage | hoch | mittel | parallele Verbraucherzentrale | G7 Plan-B |
| R8 | Reddit-Posts werden geshadowbanned | mittel | mittel | Karma-Sammeln Tag 1–14 + Disclosure-Pflicht | Account-Switch + Wartezeit |
| R9 | Aaron-Eigenzeit reicht nicht (W3–W6 dual) | hoch | hoch | Konversions-Content primär Claude Code | Reddit-Frequenz reduzieren wenn Coup-Build kritisch |
| R10 | Konkurrent kopiert Coup-Konzept | niedrig | mittel | Marken-Anmeldung G0/A8 | Annual-Event-Etablierung |
| R11 | Compliance-Pivot „DAT-zertifiziert" nicht überall durchgezogen | mittel | mittel | Stream V expliziter Sweep + Linter-Hook | Fix-PR pro Treffer |
| R12 | Repo-Mirror veraltet (Aaron updated Doc 30, Mirror nicht synchron) | mittel | mittel | Sync-Skript in Phase 2; vorerst Aaron-PR-Pflicht für Strategie-Doc-Updates | Manuelle Sync vor Sprint-Start |
| R13 | Citation-Box-Mapping (Aaron 4 h) zu viel Arbeit | hoch | mittel | Fallback: pro Cluster identische Box statt pro Spoke individuell | Reduziert auf 30 Min, 8 Cluster-Boxen statt 87 |
| R14 | Faktensatz-Library v1 hat Tippfehler oder fehlende §-Anker | mittel | niedrig | LexDrive-Sichtung in Sprint 1 Tag 5 (vor Embedding) | Korrektur-PR |

---

## 10 · Decision-Gates G0–G8 (aus Doc 28)

### G0 — Plan-Approval (Tag 0)
Alle A1–A12 entschieden (siehe §2.1).

### G1 — Embargo-Datum fixiert (Tag 6)
LexDrive-Slots bestätigt, Embargo-Tag im Pressekalender hart blockiert.

### G2 — Methodik-Whitepaper Draft 1 (Tag 14)
Coup-Methodik LexDrive-approved. Wenn rote Flag: Embargo +1 Woche.

### G3 — Daten-Matrix komplett (Tag 28)
153 (oder 102 bei 6-VR-Reduktion) Datenpunkte extrahiert + gescort. Wenn nicht: VR-Reduktion statt Verschiebung.

### G4 — Coup-Press-Kit komplett (Tag 42)
Pressemitteilung + PDF + Dashboard + GitHub + HuggingFace ready.

### G5 — Release-Validation (Tag 50, 7 Tage nach Embargo)
Hard Metric: 3 von 5 Press-Hits in 7 Tagen. Wenn < 3: Sekundärwelle aktivieren.

### G6 — Sprint-3-Validation (Tag 60)
10-Prompt-AI-Visibility-Mini-Test. Ziel: 2 von 10 Mentions. Wenn 0: Distribution forcieren.

### G7 — Cobrand-Status-Gate (Tag 75)
Trauma-Therapeut UND Unfallchirurg signed?
- Ja → AA: B11/B13 Unblock + Portierung
- Nein → BB: Plan-B Verbraucherzentrale

### G8 — Sprint-4-Final (Tag 90)
5 Hard-Metrics-Check + Phase-2-Plan oder Strategy-Review.

---

## 11 · Validation-Hooks pro Sprint

### Sprint 1 (Tag 14)
- [ ] PR auf staging mergeable, Build grün
- [ ] alle 87 Spokes + 35 Decoder haben ConversionAnchorBlock + CitationBox
- [ ] gutachter-finden in Hand-Off-Stichprobe nachweisbar
- [ ] brand-constants.ts vollständig (12 D + Bios + Boilerplates)
- [ ] llms.txt zeigt Direktive + Zitiervorschlag-Block
- [ ] Spoke mit publish_status: draft nicht in sitemap
- [ ] 5 Branchen-Citations live
- [ ] Aaron-Reddit-Karma ≥ 50
- [ ] LexDrive-Slots W1+W3 bestätigt (G1 ready)
- [ ] Pillar-C live (oder als draft committed bei Option C)
- [ ] Baseline-AI-Visibility-Test geloggt

### Sprint 2 (Tag 35)
- [ ] 12 Konversions-Pages live
- [ ] Pillar-C-Hub aktiv (wenn nicht in Sprint 1)
- [ ] 20 Citations + 15 Reviews
- [ ] 6+ Reddit-Posts mit ≥ 5 Upvotes
- [ ] Coup-Methodik-Whitepaper LexDrive-approved (G2)
- [ ] Coup-Daten-Matrix komplett (G3)

### Sprint 3 (Tag 60)
- [ ] kfz-gutachter-dortmund.de + duesseldorf.de MDX-Routen live
- [ ] Cross-Domain-Schema verifiziert
- [ ] 35 Decoder LIVE
- [ ] 25 Reviews
- [ ] Coup-Release Tag 43 ausgeführt + G5 Press-Hits ≥ 3
- [ ] G6: 2+ AI-Mentions im Mini-Test
- [ ] Compliance-Sweep „DAT-zertifiziert" über 3 Surfaces

### Sprint 4 (Tag 90)
- [ ] G7-Entscheidung dokumentiert (Cobrand ja/nein)
- [ ] Falls Cobrand: B11/B13 portiert (22 Spokes)
- [ ] Wikipedia-Mention-Strategie aktiv
- [ ] G8: AI-Visibility-Score ≥ 35/100
- [ ] G8: ≥ 12 Doc-13-Test-Prompts mit Mention
- [ ] G8: 6+ kumulative Press-Mentions
- [ ] G8: ≥ 80 indexierte URLs Google SC

---

## 12 · Output-Strukturen (alle Sprint-Outputs)

### Code-Outputs (committed im Repo)

| Output | Pfad | Quell-Doc |
|---|---|---|
| Brand-Konstanten | `src/lib/seo/brand-constants.ts` | Doc 30 §3+§6+§7 |
| Brand-Faktensatz-Library | `src/lib/seo/brand-fakten-library.ts` | Doc 30 §8 |
| Conversion-Handoff-Sätze | `src/lib/seo/conversion-handoff.ts` | Doc 30 §13.3 |
| Citation-Box-Mapping | `src/data/citation-box-mapping.ts` | Doc 29 Hebel 1 |
| FAQ-Stems-Mapping | `src/data/faq-stems-mapping.ts` | Doc 29 Hebel 2 |
| VR-Bait-Mapping | `src/data/vr-bait-mapping.ts` | Doc 29 Hebel 7 |
| Components | `src/components/content/CitationBox.tsx`, `ConversionAnchorBlock.tsx` | Doc 29 + Doc 30 |
| autoSchemaFromBody | `src/lib/content/claimondo-mdx.ts` (Erweiterung) | Doc 25 Gap 2 + Doc 29 Hebel 3 |
| Pillar-C Cluster | `src/content/claimondo/sachverstaendige/*.md` + Routes | Doc 26 Stream C |
| Konversions-Pages | `src/app/kosten-kfz-gutachten/page.tsx` u. 11 weitere | Doc 26 Stream B |
| Twin-Brand Routes | `src/app/[dortmund/dduesseldorf]/...` | Doc 26 Stream F |
| Decoder-Sprint-2 (25 Files) | `src/content/claimondo/decoder/*.md` (neue) | Doc 26 Stream H |
| B11/B13 (wenn G7 grün) | `src/content/claimondo/medizin/*.md` + Routes | Doc 26 Stream G |
| Coup-Dashboard | `src/app/transparenz-index-2026/page.tsx` | Doc 27 §3.2 |
| Coup-PDF | `public/transparenz-index-2026.pdf` | Doc 27 §3.2 |
| Repo-Mirror Plan | `_specs/llm-visibility-sprint/EXECUTION-PLAN.md` | dieses Doc |
| Repo-Mirror Stream-Briefs | `_specs/llm-visibility-sprint/streams/*.md` | je Stream |

### Off-Repo-Outputs

| Output | Wo | Quell-Doc |
|---|---|---|
| GBP-Profile | Google Business | Doc 26 Stream D |
| Branchen-Citations | die-kfzgutachter, Cylex, 11880 etc. | Doc 26 Stream D |
| Reviews | ProvenExpert, GBP, Trustpilot | Doc 26 Stream D |
| Reddit-/Foren-Posts | r/de_Versicherung, motor-talk usw. | Doc 26 Stream E |
| Coup-Dataset | GitHub `claimondo-de/transparenz-index` | Doc 27 §3.2 |
| Coup-Dataset | HuggingFace `claimondo/de-kfz-transparency-2026` | Doc 27 §3.2 |
| Press-Pressemitteilung | OpenPR + PressBox + pressemitteilung.de | Doc 27 §3.2 |
| Press-Embargo-Versand | 5 Journalisten direkt | Doc 27 §3.2 |
| Wortmarken-Anmeldung | DPMA | Doc 27 §3.4 |
| Cobrand-Verträge | LexDrive-vermittelt | Doc 26 Stream G |
| AI-Visibility-Tests | Spreadsheet `ai-visibility-{sprint}.csv` (im Repo unter `_specs/...`) | Doc 13 §8 + Doc 28 G6/G8 |

---

## 13 · Budget (vollständig aus Doc 28 §13)

| Position | Wer | Kosten | Wann |
|---|---|---|---|
| Statistik-SV-Engagement | extern | ~1.500 € | Sprint 2 W1 |
| Wortmarken-Anmeldung × 2 | DPMA + LexDrive | ~1.300 € | Sprint 1 W1–W2 |
| Press-Verteilung Premium | OpenPR + PressBox + pressemitteilung.de | ~300 € | Sprint 3 Tag 42 |
| Cobrand-Honorare | Trauma-Therapeut + Unfallchirurg | je ~300–600 €/Mo | ab Cobrand-Signing |
| GBP-Photoshoot 3 Standorte | extern oder selbst | 0–500 € | Sprint 1 Tag 1–7 |
| ProvenExpert/Trustpilot Pro | extern | ~50–100 €/Mo | Sprint 1 Tag 8 |
| **GESAMT-Hard-Cost 90 Tage** | – | **~3.500–5.500 €** | – |

**Plus Eigenzeit:** Aaron ~91 h (über 4 Sprints) + Nicolas ~49 h + Claude (Strategie) ~15 h. Externe Hilfe (LexDrive, SV, Ärzte) zusätzlich.

---

## 14 · Plan-Aktivierung — was Aaron jetzt entscheiden muss (G0)

12 Asset-Approvals + Branch-Setup-Entscheidungen:

| # | Entscheidung | Empfehlung |
|---|---|---|
| A1 | D1–D12 wortgleich (Doc 30 §3) | approved oder Wording-Justage |
| A2 | Default-Hand-Off-Sätze (Doc 30 §13.3) | approved |
| A3 | Pillar-C Option A (LexDrive-Review + Sprint integriert) / B (Phase 2) / C (Auto-Draft) | **Option A**, sofern LexDrive-Slot W1 verfügbar |
| A4 | Versicherer-Bait für AXA/Allianz/R+V im Sprint | ja, weil Top-3-Versicherer in DE |
| A5 | Founder Vor-Claimondo-Stationen im Sprint | nein (kann später, Doc 30 v1.0 funktional) |
| A6 | LexDrive-Slot W1 (8 h) + W3 (4 h) + Decoder-Reviews (3 h) schriftlich bestätigt | Pflicht — Aaron klärt heute |
| A7 | Statistik-SV-Budget 1.500 € | ja (Press-Resistenz) |
| A8 | Wortmarken-Anmeldung 1.300 € | ja (Plattform-Schutz) |
| A9 | Embargo-Tag = Tag 43 = 04.07.2026 (Freitag) | ja oder Mo 06.07. wenn Press-Logistik besser |
| A10 | Branch-Strategie: neuer Branch `kitta/sprint1-foundation` | ja |
| A11 | 12 Versicherer im Coup-Index (9 + HUK + AXA + Allianz) | ja, HUK ist Pflicht |
| A12 | Cobrand-Akquise parallel Verbraucherzentrale | ja, breiter Trichter |

Sobald A1–A12 entschieden + Repo-Mirror durchgeführt: **Sprint 1 startet Tag 1 (morgen oder nach Aaron-Wunsch).**

---

## 15 · Zusammenfassung — was dieser Plan ist

Doc 31 v2 ist der **operative Master-Execution-Plan** für die 90 Tage vom 23.05.2026 bis 21.08.2026. Er führt Docs 25/26/28/29/30 zusammen, mit:

- **4 Sprints** (Foundation → Konversion+Coup-Methodik → Twin-Brand+Coup-Release → Premium+Skalierung)
- **35+ Streams** über alle Quell-Docs verteilt
- **8 Decision-Gates** mit klaren Pivot-Punkten
- **5 Owner-Rollen** mit Stunden-Budget pro Sprint
- **Repo-Mirror-Architektur** (kritisch: marketing-strategy/ ist gitignored)
- **Budget ~3.500–5.500 € Hard-Cost** + ~155 h Eigenzeit über 4 Sprints
- **Coup-Embargo Tag 43** als Pivot-Event
- **Hard-Metrics:** AI-Visibility-Score 0 → ≥ 35/100 in 90 Tagen, Hand-Off-zu-gutachter-finden in ≥ 4 von 6 Test-Prompts

Wer diesen Plan ausführt, schaltet drei Wachstums-Hebel gleichzeitig frei: **technische SOT-Vollendung (Layer 1) + Off-Site-Authority (Layer 2) + einmaligen Press-Coup (Layer 3) — auf einer brand-konsistenten Surface mit eingebautem Discovery-Funnel zur `gutachter-finden`-Karte.**

---

*Erstellt 2026-05-22 als operativer 90-Tage-Master-Execution-Plan. Konsolidiert Docs 25 / 26 / 28 / 29 / 30. Format: writing-plans. Bedingung: Repo-Mirror der relevanten Specs aus gitignored marketing-strategy/ in den committed Repo-Bereich vor Sprint-Start.*
