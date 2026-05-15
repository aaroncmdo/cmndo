# /schaden-melden Promo-Cookie-Layer komplett entfernen

**Datum:** 2026-05-15
**Branch:** `kitta/aar-promo-cookie-killen`
**Vorgänger:** PR #1308 (page→setPromoCookie), PR #1319 (page→prop→useEffect→setPromoCookie)

## Befund

Drei verschiedene CMM-14-Crashes auf `/schaden-melden?p=MK-XXXX`, alle mit derselben Fehlermeldung `Cookies can only be modified in a Server Action or Route Handler`, aber **unterschiedlichen** Stack-Frames:

| Digest | Chunk | gefixt von | Fix-Strategie |
|---|---|---|---|
| `890686022` | `__0ml421m._.js:12` | PR #1308 | page→'use server'-Helper |
| `2237539019` | `__00ph~ev._.js:12` | PR #1319 | page→prop→useEffect |
| `2740258766` | `__112v9mh._.js:10` | **dieser PR** | Cookie ganz weg |

PR #1308 hat eine Quelle gefixt, PR #1319 die zweite, aber jeder Render-Pfad erzeugte eine neue. Sentry-Issue NEXTJS-8 zeigt 11 Events seit 10:41 — Crash ist nicht intermittent, sondern deterministisch bei valid `?p=`-Param.

Funktional war der Cookie-Layer ohnehin **redundant**:
- Cookie wurde NUR von `createLeadFromMiniWizard` gelesen (gleiche Session)
- Keine Cross-Session-Attribution (User → 5 Min später wiederkommen → noch zugeordnet)
- 30-Tage-TTL nie genutzt
- Promo-Code stand schon im URL-Param

## Fix

Promo-Code direkt im Form transportiert:

```
?p=MK-XXXX → page.tsx (validate format) → MiniWizardClient (prop)
        → hidden <input {...register('promoCode')} />
        → FormData beim Submit
        → createLeadFromMiniWizard (data.promoCode)
        → resolvePromoCodeToId → leads.promotion_code_id
```

**Files**:
- `src/lib/flow/schemas/mini-wizard.ts` — `promoCode` optional + regex-validated im Zod-Schema
- `src/app/schaden-melden/MiniWizardClient.tsx` — `useEffect`/`setPromoCookie`-Aufruf raus, hidden FormField rein, `defaultValues.promoCode: initialPromo ?? ''`
- `src/lib/actions/create-lead-from-mini-wizard.ts` — `readPromoCookie`-Aufruf raus, liest `data.promoCode` direkt
- `src/lib/flow/promo-attribution.ts` — `readPromoCookie` entfernt, nur `isValidPromoCodeFormat` bleibt
- `src/lib/flow/promo-cookie-action.ts` — gelöscht (komplette Datei)
- `src/app/schaden-melden/page.tsx` — Kommentar aktualisiert (kein Code-Change, da PR #1319 die Struktur schon vorbereitet hat)

## Verifikation lokal

```bash
npx tsc --noEmit  # grün (außer 2 pre-existing sharp-Errors)
```

## Post-merge Verifikation

```bash
# E2E-Smoke (analog scripts/smoke-makler-kunde-flow.mjs):
# 1) Makler-Login → /makler/promo zeigt MK-SMKE
# 2) Anonym → /schaden-melden?p=MK-SMKE
#    Erwartung: KEIN CMM-14-Crash mehr (Sentry-Issue NEXTJS-8 darf nicht
#    weiter eskalieren)
# 3) Wizard ausfüllen + Submit → /schaden-melden/link-versendet
# 4) DB: SELECT * FROM leads WHERE email LIKE 'kunde-smoke-%'
#    Erwartung: promotion_code_id = <ID des SMOKE-MK-TEST-promo-codes>
# 5) /makler/leads (eingeloggt als test-makler) zeigt den neuen Lead
```

## Bookmark-/Cookie-Migration

Nutzer mit gesetztem `claimondo_promo`-Cookie sehen keine Verschlechterung — der Cookie wurde nur beim aktuellen `/schaden-melden`-Submit gelesen, jeder neue Visit setzt ihn nicht mehr und löscht ihn auch nicht aktiv (verfällt nach 30 Tagen Browser-TTL).

## Closes

Sentry-Issues `JAVASCRIPT-NEXTJS-8`, `JAVASCRIPT-NEXTJS-9`.
