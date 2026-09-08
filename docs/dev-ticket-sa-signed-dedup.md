# Dev-Ticket: `sa_signed` Dedup / Doppelzählung absichern

**Typ:** Bugfix / Tracking-Hygiene
**Priorität:** Hoch (sa_signed wird das **primäre wertbasierte** Bidding-Signal in Google Ads → Doppelzählung = direkte Budget-Fehlsteuerung)
**Datei:** `src/app/flow/[token]/actions.ts` (sa_signed-Block, aktuell ~Z. 876–892)
**Branch (Vorschlag):** `kitta/aar-<nr>-sa-signed-dedup` · PR gegen `staging`

---

## Problem

Das `sa_signed`-Event wird ohne Dedup-Schlüssel gefeuert:

```ts
await trackServerConversion(gaRow?.ga_client_id ?? null, {
  name: 'sa_signed',
  params: { source: 'flow', value: SA_SIGNED_VALUE_EUR, currency: 'EUR' },
})
```

Läuft die SA-Unterschrift-Action mehrfach (Reload, Retry, Doppel-Submit, erneuter Aufruf bei bereits unterschriebener SA), wird dieselbe Unterschrift **mehrfach mit 210 €** gezählt → Wertinflation im value-based Bidding.

Zum Vergleich: der Lead-Pfad hat bereits Dedup über `lead_id` (`value-model.ts` / `buildConversionExtra`). Beim `sa_signed` fehlt das Pendant.

## Fix (zwei Ebenen — beide umsetzen)

**1. Dedup-Key am Event** — `transaction_id` ergänzen:

```ts
params: {
  source: 'flow',
  value: SA_SIGNED_VALUE_EUR,
  currency: 'EUR',
  transaction_id: leadId,   // (oder fall.id) — eindeutig pro SA
},
```

`leadId` ist im Scope (s. `.eq('id', leadId)` direkt darüber).

⚠️ **Hinweis GA4-Custom-Event:** GA4 dedupt `transaction_id` zuverlässig nur bei `purchase`/E-Commerce-Events, **nicht garantiert** bei beliebigen Custom-Events. Deshalb zusätzlich Ebene 2.

**2. Idempotenz an der Quelle (robust):** `sa_signed` nur beim **Übergang** auf „unterschrieben" feuern, nicht wenn die SA schon unterschrieben war. Vor dem Status-Update prüfen, ob `leads.sa_unterschrieben` bereits `true` ist; nur feuern, wenn vorher `false/null`. (Der Block setzt `sa_unterschrieben: true` ohnehin — den vorherigen Wert vorab lesen und als Guard nutzen.)

## Akzeptanzkriterien

- [ ] `sa_signed` trägt `transaction_id` (= leadId/fall.id).
- [ ] Zweiter Aufruf derselben unterschriebenen SA feuert **kein** weiteres `sa_signed`.
- [ ] Wert/Currency unverändert (210 € / EUR).
- [ ] Kurztest: zweifacher Action-Aufruf → nur **eine** Conversion in GA4 DebugView.

## Kontext
Teil des Value-Based-Bidding-Umbaus (s. `docs/value-based-bidding-strategie.md`). `sa_signed` wird in Google Ads als primäre, wertbasierte Conversion importiert — Dedup ist davor Pflicht.
