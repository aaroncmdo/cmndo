# /check Anspruch-Tool — Sauber-Rebuild (Design + Plan)

**Branch:** `kitta/check-anspruch-rebuild` (stacked auf `kitta/conversion-tracking-fix` → eigene PR, base = `conversion-tracking-fix`; nach #3192-Merge auf `staging` rebasen)
**Stand:** 2026-06-26
**Entscheidung (Aaron):** Größerer Umbau — antwort-adaptives ehrliches Ergebnis + illustrative €-Spannen + Funnel-Tracking + Kasko-Pfad. i18n alle 6 (pl/ru/tr/ar review-pending).

## Befund (Ist-Zustand)
`/check` ist komplett & reachable (LandingTopbar/Footer/`InlineCheckCta`/404-Seite), i18n in 6 Sprachen, sauberes Lead-Backend (`submitCheckLead` → `anfragen.payload` + Dispatch-Notify). **Zwei Mängel:** (1) **kein Tracking** (kein `generate_lead`, keine Funnel-Events); (2) **Ergebnis ignoriert die Antworten** — die statische `ENTITLEMENTS`-Liste wird allen gezeigt, auch bei Teilschuld → sachlich überzogen (UWG/Ehrlichkeit). Kein Pfad für Eigenverschulden.

## Ziel
Ehrliches, antwort-adaptives Ergebnis (4 Tiers) + Funnel-Tracking + Kasko-Pfad, konversionsoptimiert (Lead/Anruf).

## Architektur

### `lib/check/result-model.ts` (NEU, pure function)
Mappt Antworten → Ergebnis, gibt **i18n-Keys** zurück (kein Text) → pur, testbar, i18n-sauber.
- `Tier = voll | quote | pruefen | kasko`; `resolveTier(schuld)`: gegner→voll, teils→quote, selbst→kasko, unklar/undef→pruefen.
- `buildCheckResult(answers)` → `{ tier, headingKey, subKey, positions[], insightKeys[], showRanges }`.
- `positions`: kasko → `[kasko_gutachten, kasko_werkstatt, kasko_abwicklung]`; sonst → `[gutachten, wertminderung, nutzungsausfall, anwalt, auslagen]`.
- `insightKeys`: gutachten=versicherung→`insight_versicherung`; unfall_her=unter_woche→`insight_frist_frisch`; unfall_her=ueber_monat→`insight_verjaehrung`; quote→`insight_teilschuld`; pruefen→`insight_unklar`; kasko→`insight_kasko`.
- `showRanges`: voll|quote.

### `CheckFunnelClient.tsx` (Rewrite, datengetrieben)
- 4. Schuld-Option `q1_selbst` (Eigenverschulden) → Kasko-Pfad.
- Ergebnis aus `buildCheckResult`: tier-Heading/Sub, `positions` → `ent_<key>_t/_d`, Insights, €-Spannen-Block bei `showRanges`.
- **Tracking** via `trackEvent` (Helper aus #3192): `check_start` (erste Antwort) · `check_step` `{question,value}` · `check_complete` `{tier}` · `generate_lead` `{currency:'EUR',value:0,source:'check-anspruch',tier}` (Submit).
- Erfolg/Restart/Zurück/Disclaimer bleiben.

### `check-lead-action.ts`
- `schuld`-Enum + `'selbst'`; `SCHULD_LABEL` + `selbst` ("Eigenverschulden / Kasko-Fall"). (payload.check + Dispatch-Notify existieren bereits.)

### i18n — 23 neue Keys (de + en authoritativ; pl/ru/tr/ar best-effort + `TODO review`)
`q1_selbst` · `result_{voll,quote,pruefen,kasko}_heading` + `_sub` (8) · `ent_kasko_gutachten_t/_d`, `ent_kasko_werkstatt_t/_d`, `ent_kasko_abwicklung_t/_d` (6) · `insight_frist_frisch`, `insight_kasko` (2) · `ranges_heading`, `range_auslagen`, `range_nutzungsausfall`, `range_wertminderung`, `range_kostenlos`, `ranges_disclaimer` (6).
Reuse: badge/h1/sub/step_of/back/q1-3/ent_* (5)/insight_versicherung/insight_verjaehrung/insight_teilschuld/insight_unklar/result_disclaimer/lead_*/restart/alternativ_*/trust_heading. (`result_heading` wird ungenutzt — bleibt als harmloser Key.)

## Genauigkeit / Recht
- **voll** = §249 BGB (0 € Eigenkosten, Vollanspruch gegen Gegner-Haftpflicht). **quote** = §254 (anteilig nach Mitverschuldensquote — ehrlich, NICHT Voll-Liste). **pruefen** = Schuld wird geklärt. **kasko** = ehrlich: kein Anspruch gegen Gegner, aber Kasko-Service (SV-Gutachten, Werkstatt, Abwicklung).
- **€-Spannen** = illustrative Größenordnungen (Auslagenpauschale 25–30 €, Nutzungsausfall ~35–175 €/Tag, Wertminderung oft 4-stellig bei jüngeren Kfz, Gutachten/Anwalt 0 € für Sie), **kein** errechneter Gesamtbetrag (keine Schadensdaten → UWG-Risiko), mit Disclaimer.
- `result_disclaimer` ("keine Rechtsberatung") bleibt.

## Verifikation
`tsc --noEmit` + voller `next build` grün. (claimondo-marketing hat keinen Test-Runner → `result-model` per Review + tsc; Logik bewusst simpel/pur.)

## Out of Scope
Echte €-Berechnung aus Schadensdaten · CMP-Texte · Locale-spezifische Logik · €-Schätzung als Gesamtbetrag.
