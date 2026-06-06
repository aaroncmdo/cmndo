# Monika A-Flow Phase 2 — Browser-Smoke (Teaser + Resume, 06.06.2026)

Self-contained Playwright (`scripts/_monika-p2-smoke.mjs`, nicht committet), 4 Szenarien je in
eigenem Browser-Context (frische sessionStorage/localStorage). Cluster-Modus, lange Seite (2800px).
**EXIT 0, keine Page-Errors.**

## Verifiziert (Screenshots)
- **A — Teaser feuert bei Scroll (Desktop):** Laden → **kein** Teaser (A1). Nach Min-Dwell 3 s + Scroll ≥ 30%
  → Teaser-Peek „Hi, grüße Sie! 👋" über dem Siegel-FAB (Monika-Mini + ✕) (A2). Klick → Chat öffnet,
  Greeting läuft (A3).
- **B — Desktop-Resume über Reload:** Flow bis Haftpflicht → Auffahrunfall-Schritt, dann Reload (=
  simulierter Seitenwechsel) → Panel **auto-öffnet** mit **kompletter History** (instant, kein Re-Typing),
  weiter bei den Unfalltyp-Chips (B1).
- **C — Dismiss → 2-Tage-Ruhe:** Teaser → ✕ → Reload + Scroll → **kein Teaser** (`count 0`); 2-Tage-
  localStorage-Stempel greift (C1).
- **D — Mobile-Resume = Peek:** 400 px-Viewport, Flow bis Wertgutachten → Grund, Reload → **Resume-Peek**
  (Monika + letzte Zeile + „weiter ↑"), Panel **nicht** auto-offen (`mk-panel count 0` = kein
  Vollbild-Takeover) (D1).

## Build / Tests
`build:embed` 48.5 KB raw / **17.5 KB gz** (Budget < 30). 37 vitest (store/teaser + Phase-1) grün.
`typecheck:embed` grün.

## Restraint (Make-or-Break) bestätigt
Max 2 Beats/Session (`nextBeat`), ✕ → 2 Tage Ruhe (Szenario C), nie Auto-Vollbild auf Mobile (Szenario D),
Teaser **stumm** (Sound erst Phase 3).
