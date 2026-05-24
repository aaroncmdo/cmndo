# Doc 37 P2 (Teil 1) — Schadensreport-Cross-Links + Footer-Standorte

**Datum:** 2026-05-24 · **Branch:** `kitta/doc37-p2-schadensreport-footer` (off staging) · **PR:** gegen `staging`
**Kontext:** Doc 37 P2 (pre-release), nach #1646-Merge. Nur die **konfliktfreien** P2-Teile — siehe „Deferred".

## Umgesetzt
- **§8.1 (outbound)** — `src/app/schadensreport-2026/page.tsx`: neue Sektion „Was du gegen Kürzungen tun kannst" vor dem finalen CTA, verlinkt die 3 Misstrauens-Seiten (`/gegnerische-versicherung-zahlt-nicht`, `/versicherung-schickt-gutachter`, `/unverschuldeter-unfall-rechte`). Aktiviert den Coup-Asset als Re-Citation-Hebel Richtung Konversion.
- **§8.2** — `src/components/landing/LandingFooter.tsx`: „Top-Standorte"-Streifen (10 Städte: Köln/Düsseldorf/Dortmund/Essen/Hamburg/Berlin/München/Frankfurt/Stuttgart/Leipzig → `/kfz-gutachter/<slug>`) zwischen 4-Spalten-Grid und Copyright-Zeile. **Streifen statt 5. Spalte** (4-col-Grid würde sonst quetschen); Local-SEO-Anker von jeder Seite. Alle 10 Slugs gegen STAEDTE verifiziert (kein 404 durch `dynamicParams=false`).

## Verifikation
- `tsc` 0 · `check:token-audit` **1700/0** · `next build` **EXIT 0** (Compiled+TypeScript, kein Export-Fail).
- Dev-Smoke (robuster Readiness-Check = warten auf echten Body, nicht nur HTTP 200): `/schadensreport-2026` rendert die 3 Misstrauens-Links + Heading; Footer „Top-Standorte" + Stadt-Links (koeln/hamburg/muenchen/leipzig) auf derselben Seite. Alle grün.

## 7-Punkte-Audit
- **Build:** grün. **UI:** §8.1-Links auf Schadensreport sichtbar; §8.2-Streifen im Footer site-wide. **Redundanz:** keine; FOOTER_STANDORTE als lokale Const. **Dead-Code:** keiner. **Spec:** Doc 37 §8.1-outbound + §8.2; Rest deferred. **Inkonsistenz:** Claimondo-Tokens, Umlaute korrekt, token-audit 0. **Regression:** additive Links; LandingFooter-Grid unverändert (Streifen darunter); disjunkt zu #1652.

## Deferred (nach #1652-Merge)
- **§8.1 (inbound):** Misstrauens-Seiten + relevante Decoder → Schadensreport-Zitat. Die 3 Misstrauens-`page.tsx` sind in **#1652** (Doc 37 P1, noch offen) → Edit jetzt = Stacked-Conflict. Sauber als Mini-Follow-up nach #1652-Merge.
