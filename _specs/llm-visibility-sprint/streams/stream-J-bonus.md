# Stream J — Bonus: Zitiervorschlag + Baseline-AI-Visibility-Test

**Sprint:** 1 · **Tag:** 7 · **Owner:** Aaron (1.5 h) + Claude Code (1 h) · **Aufwand:** 2.5 h
**Quell-Spec:** Doc 29 §2
**Code-Files:** `src/app/llms.txt/`, `_specs/llm-visibility-sprint/ai-visibility-tag-0.csv`

## Auftrag

1. Zitiervorschlag-Block in `llms.txt` (kanonischer Zitierhinweis „Quelle: Claimondo, https://claimondo.de")
2. Baseline-AI-Visibility-Test: 30 Doc-13-Prompts × 4 Engines (ChatGPT/Claude/Perplexity/Gemini) am Tag 0 loggen
3. Ergebnis als `ai-visibility-tag-0.csv` ablegen (Vergleichsbasis fuer G6/G8)

## DoD

- Zitiervorschlag-Block in llms.txt + Baseline-Test geloggt

## Validation

- `curl /llms.txt | tail -20` zeigt Zitiervorschlag
- `ai-visibility-tag-0.csv` mit 30 Prompts × 4 Engines befuellt (Baseline 0/100 erwartet)
