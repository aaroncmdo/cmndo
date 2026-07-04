# Design-Spec: Verkettung `/check` → Foto-Anspruch-Tool

**Datum:** 2026-07-03
**Branch:** `kitta/anspruch-check-verkettung` (off staging)
**Verwandt:** PR #3413 (Foto-Tool), PR #3197 (`/check`), Memory `coordination-anspruch-pruefen-tool`

## Problem / Ausgangslage

Es existieren **zwei** Anspruch-Tools mit überlappendem Nutzer-Intent („was steht mir zu?"):

| | `/check` (claimondo-marketing) | `/embed/anspruch-pruefen` (Haupt-App) |
|---|---|---|
| Mechanik | 3 Fragen (Schuld/Frist/Gutachten) | Foto → KI-Vision |
| Ergebnis | *welche* Ansprüche (qualitativ, 4 Tiers §249/§254/prüfen/kasko) | *wie viel* €-Spanne (quantitativ, fahrzeugspezifisch) |
| Ziel-Pfad | Lead-Formular → Dispatch-Rückruf | Finder → Selbst-Buchung Gutachter |
| Status | live, prominent (Nav/Footer/Artikel via `InlineCheckCta`) | live seit #3419, **0 Einstiegspunkt → 0 organische Adoption** |

Das Foto-Tool ist technisch sauber auf prod (Route HTTP 200, DB-Seeds 6/2/12 intakt, Vision funktional), aber repo-weit **nirgendwo verlinkt** → praktisch tot für echte Nutzer. Der frühere „Marketing-LP-iframe" war als *deferred* markiert und nie gebaut.

## Entscheidung (Aaron, 2026-07-03)

**Verkettung** statt zweitem parallelen Hook: `/check` bleibt der breite, niedrigschwellige Top-Funnel-Eingang; im Ergebnis führt ein CTA ins reichere Foto-Tool. Natürliche Progression **Schuld → Wert → Buchung**. Vermeidet zwei konkurrierende „Anspruch prüfen"-Hooks und nutzt den bestehenden `/check`-Traffic.

Verworfene Alternativen: eigenständiger paralleler Hook (Redundanz-Risiko), Segmentierung nach Kontext (komplexer), `/check` ersetzen (verwirft bewährten Funnel).

## Design

### Platzierung & Gating
- Der Foto-Check-CTA rendert im `/check`-Ergebnis-Screen **direkt nach der bestehenden „illustrative €-Größenordnungen"-Box** (`CheckFunnelClient.tsx`, aktuell ~Z.229).
- **Nur bei `result.showRanges === true`** (Tier `voll`/`quote` — echter bezifferbarer Gegner-Anspruch). Bei `kasko`/`prüfen` **kein** CTA (Wert-Schätzung dort nicht sinnvoll / Schuld erst zu klären).
- Logik: die €-Box zeigt generisch-illustrative Spannen; der Foto-Check ist die individuelle Vertiefung („wie viel ist **Ihr** Schaden wert?").

### Gewichtung (Aaron: Foto-Check primär)
- Der Foto-Check-CTA ist der **prominente, primäre** Handlungsaufruf (großer Button, navy/ondo).
- Das bestehende Rückruf-Lead-Formular **tritt visuell zurück** (dezenteres Heading, z. B. „Lieber persönlich? Rückruf anfordern", reduziertes Gewicht) — bleibt aber **voll funktional** (Felder, `handleSubmit`, `check-lead-action`). **Keine Regression** des bestehenden Lead-Pfads.

### Technischer Übergang
- Cross-Domain-Link von `claimondo.de/check` → `${EMBED_ORIGIN}/embed/anspruch-pruefen` (`NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'`), **selber Tab** (Funnel-Progression). Kein iframe, kein Wrapper (das nackte Embed rendert standalone sauber, `min-h-screen`).
- **Attribution durchreichen** (analog `GutachterFindenSection`): Ads-Click-IDs (`gclid`/`gbraid`/`wbraid`/`gclsrc`) aus der `/check`-URL als Query-Params an den Foto-Link. Zusätzlich der **Makler-Promo-Code**, falls der `/check`-Besuch über `/m/[code]` attribuiert ist — Param-Name gemäß Foto-Tool-/Finder-Konvention (Impl-Detail, s. u.).
- `data-tracking="cta-check-foto-tool"`.

### Komponenten
1. **`AnspruchFotoCheckCta`** (neu, `claimondo-marketing/components/…`, Stil an `InlineCheckCta` angelehnt aber prominent). Nimmt die durchzureichenden Params als Props (oder liest sie client-seitig aus `window.location.search` wie `CheckFunnelClient` bereits Z.90).
2. **`CheckFunnelClient.tsx`** (Edit): CTA nach €-Box rendern (showRanges-gated) + Lead-Formular visuell zurücknehmen.
3. **i18n**: neue `check.foto_check.*`-Keys in `i18n/messages/{de,en,tr}.json` (deutsche Umlaute korrekt).

## Scope (YAGNI)
**Im MVP:** nur der CTA-Umbau im `/check`-Ergebnis + Attribution-Durchreichung + i18n.
**Nicht im MVP** (bewusst, da „Verketten" gewählt, nicht „Eigenständig"): keine dedizierte Marketing-Wrapper-Seite `/anspruch-pruefen`, keine Home-Teaser-Section, keine Cluster-LP-Einbettung, keine Consent-Bridge-Arbeit (kein iframe).

## Offene Implementierungs-Details (im Bau zu klären, nicht Design-blockierend)
- **Makler-Promo-Mechanik:** Wie hält `/check` den Promo-Code (Cookie via `/m/[code]` vs. URL-Param)? `check-lead-action` liest `promotion_code_id` — Quelle verifizieren. Wie nimmt das Foto-Tool/der Finder den Promo-Code auf (Query-Param-Name)? Beide Enden gegen den echten Code verifizieren, bevor der Param verdrahtet wird.
- **Consent:** Cross-Domain-Navigation (kein iframe) → das Foto-Tool lädt mit eigenem Consent-Kontext (app.claimondo.de). Kein postMessage-Handshake nötig (nur beim iframe). Prüfen, dass die Ads-Click-IDs für die Conversion-Attribution ausreichen.

## Verifikation
- **Gates:** claimondo-marketing `tsc` + `build` + `lint` grün. (Marketing ist eigenes Top-Level-Build; App-Ratchets erfassen `claimondo-marketing/` nicht.)
- **Prod-Smoke nach Deploy:** `/check` mit Antworten die Tier `voll`/`quote` ergeben → Foto-CTA sichtbar & prominent; Klick führt auf `app.claimondo.de/embed/anspruch-pruefen` mit Attribution-Params; Rückruf-Formular weiterhin absendbar (Lead landet in `anfragen`/`leads`). Bei `kasko`/`prüfen` **kein** CTA.
- **Adoption-Nachweis:** nach Live-Gang erneut `anspruch_schaetzungen`-Count auf prod prüfen (aktuell 3, alle Test) → echte Sessions mit `schaetzung_session_id`-Handoff.
