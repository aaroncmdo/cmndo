# Dev-Feedback: `sa_signed` erreicht das Ads-Bidding noch NICHT

**Stand:** 2026-06-20 · **Konto:** Google Ads „Claimondo Cluster" (951-112-7970)
**Verifiziert von:** Live-Prüfung in Google Ads + GA4-Verknüpfung.

## Ergebnis der Überprüfung

Nach „durchgeführt" wurde live geprüft — das 210-€-`sa_signed`-Signal erreicht das Ads-Bidding **weiterhin nicht**:

1. **GA4↔Ads-Verknüpfung unverändert.** Verknüpft ist **nur** Property **„Cluster Management" `G-3GER9D7KRZ` (540525497)**, mit **„App-/Webmesswerte-Import: Deaktiviert"**. Die Property **`G-9YF2W9ZP2S` (Claimondo.de)**, in die `sa_signed` per Measurement Protocol gesendet wird (`NEXT_PUBLIC_GA4_ID`), ist **nicht** mit Ads verknüpft.
2. **`sa_signed` ist KEINE Ads-Conversion.** Conversion-Aktionen jetzt 16 (vorher 14) — die 2 neuen sind **„Local actions – Other engagements"** und **„Local actions – Website visits"** (auto „Von Google gehostet" via Google Business Profile), **nicht** `sa_signed`.
3. **Lokaler Code unverändert** (`src/app/flow/[token]/actions.ts`): `sa_signed` ohne `transaction_id`, weiterhin an `NEXT_PUBLIC_GA4_ID = G-9YF2W9ZP2S` (kann an nicht-gepullter Branch liegen).

## Root-Cause

**Property-Mismatch:** `sa_signed` landet in `G-9YF2W9ZP2S`, Ads ist an `G-3GER9D7KRZ` verknüpft → das Event kann aus der verknüpften Property nicht importiert werden, und in der verknüpften Property ist zudem der Webmesswerte-Import deaktiviert.

## Was konkret fehlt (To-do für Dev)

**Variante B (kurzfristig):**
- [ ] Claimondo.de-Property **`G-9YF2W9ZP2S` mit dem Ads-Konto verknüpfen**.
- [ ] In `G-9YF2W9ZP2S`: `sa_signed` als **Schlüsselereignis** markieren; Wert 210/EUR im DebugView bestätigen.
- [ ] In Ads `sa_signed` **importieren** (erst **sekundär** → kein Bidding-Risiko). **Beweis = `sa_signed` taucht als Conversion-Aktion in Ads auf.**
- [ ] Sicherstellen, dass die **gclid** in `G-9YF2W9ZP2S`-Sessions ankommt (sonst keine Ads-Zuordnung).

**Variante C (sauber, mittelfristig):**
- [ ] Funnel auf **eine** Property vereinheitlichen — Embed/Flow + `sa_signed` auf die mit Ads verknüpfte Cluster-Property `G-3GER9D7KRZ` senden; Cross-Domain LP↔app.claimondo.de konfigurieren; Webmesswerte-Import in Ads aktivieren.

**Unabhängig davon:**
- [ ] **`transaction_id`-Dedup** in `sa_signed` (s. `docs/dev-ticket-sa-signed-dedup.md`).

## Akzeptanzkriterium
`sa_signed` ist als Conversion-Aktion **in Google Ads sichtbar** und erfasst nach echten Unterschriften Conversions (zunächst sekundär). Erst dann ist die Pipeline nachweislich live.

## Referenz
`docs/value-based-bidding-strategie.md` (§6.2 Property-Mismatch, §7 To-dos).
