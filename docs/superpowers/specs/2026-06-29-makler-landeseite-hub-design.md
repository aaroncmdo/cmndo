# Makler-Kunden-Landeseite (Hub) — Design-Spec

**Datum:** 2026-06-29
**Autor:** Session fbca7869 (mit Aaron)
**Säule:** A des kanonischen Partner-Landeseiten-Systems (siehe `HANDOFF-kanonische-partner-landeseiten`). Säule B (Makler-Selbst-Registrierung) = eigene Spec danach.

## Ziel (ein Satz)

Eine gebrandete, makler-spezifische Landeseite unter `claimondo.de/m/[Promo-Code]`, von der der Kunde **»Gutachter finden & Termin«** oder **»Anspruch prüfen«** wählt — beide tragen die Makler-Attribution (`promotion_code_id`) in den kanonischen Lead — und die den aktuellen 404 des Makler-QR behebt.

## Kontext & Problem

- Der Makler teilt heute (über `/makler/promo`) den Link `${landingBase()}/start/makler/${makler.id}`. `landingBase()` = `NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'` (**Marketing-Domain**). Aber `/start/makler/[maklerId]` lebt in `src/app` = **App** (`app.claimondo.de`). Marketing-Domain hat die Route nicht → **404** (von Aaron 29.06. live bestätigt mit `claimondo.de/start/makler/bbbb2222-…0021`).
- Die existierende `/start/makler/[id]` ist nur eine **nackte Vollbild-Finder-Karte** ohne Branding/Personalisierung und ohne Anspruch-Check — nicht die „separate, für den Makler generierte Seite", die Aaron will.
- Makler-Promo-Stats sind strukturell **immer 0** (kein Klick-Tracking: nichts inserted je in `promo_clicks`).
- **Voraussetzung erfüllt:** Der Makler kann konvertierte vermittelte Fälle inzwischen sehen (Auto-`makler_fall_consent` bei Konversion, PR #3349 / Mig `20260629174646`). Der Hub erzeugt Leads → konvertieren → der Makler sieht sie. Ohne #3349 wäre der Hub nutzlos.

## Entscheidungen (Aaron, 29.06.)

1. **Landing-Experience = gebrandeter Hub** (zwei gleichwertige Wege Finder + Anspruch), NICHT direkt-in-den-Finder.
2. **URL = `claimondo.de/m/[Promo-Code]`** (Marketing-Domain, Promo-Code als Slug). Begründung: Promo-Code ist bereits eindeutig + makler-spezifisch + DER Attributions-Schlüssel → keine neue DB-Spalte, Attribution == die URL; löst auch den toten `?p=`-Marketing-Link ab.
3. **Branding = Text-Personalisierung** „Empfohlen von [Firma]" (Claimondo-gebrandet, KEIN Whitelabel — `makler` hat keine Logo-Spalte).
4. **Consent-Scope vollzugriff** (bereits live via #3349).

## Architektur

### Domains / Build-Lanes
- **Hub-Seite** → Marketing-Build (`claimondo-marketing/`, Deploy-Lane „LP").
- **Finder** (Leg 1) → App-Build (`app.claimondo.de/start/makler/[id]`), via `NEXT_PUBLIC_EMBED_ORIGIN` verlinkt. Reuse, kein Eingriff.
- **Anspruch-Check** (Leg 2) → Marketing-Build (`claimondo.de/check`), gleiche Domain wie der Hub.
- **404-Fix** (`/makler/promo`-Link) → App-Build.

→ Das Feature spannt **zwei Deploy-Lanes**. Reihenfolge: Hub (Marketing) deployen, *dann* den Promo-Link umstellen (App). Kein Regressions-Risiko bei umgekehrter Reihenfolge (404→404 bis der Hub live ist), aber Hub-first ist sauberer.

### Routing (verifiziert)
- Neue Route: `claimondo-marketing/app/[locale]/m/[code]/page.tsx`.
- `claimondo.de/m/MK-XXXX` (prefix-frei) funktioniert: `middleware.ts:102` rewritet unpräfixierte Pfade intern auf `/de/<pfad>`; die prefix-freie URL ist kanonisch. (Subdomain `makler.claimondo.de` ist von der Recruiting-LP belegt → nicht für den Kunden-Hub nutzen.)
- DB-Zugriff: `createServiceClient()` aus `@/lib/supabase/server` (service-role; `/m` ist public, kein auth.uid()). Spiegelt `check-lead-action.ts` / `kfzgutachter-lp/actions.ts`.

### Datenfluss
```
Kunde scannt QR / öffnet WhatsApp-Link
        │
        ▼
claimondo.de/m/MK-XXXX  (Marketing, Server-Component)
   1. resolveMaklerByPromoCode(sb, 'MK-XXXX') → { promotionCodeId, maklerId, firma, aktiv }
      └─ ungültig / makler.status != 'aktiv' → redirect('/gutachter-finden')   [kein 404]
   2. INSERT promo_clicks(promotion_code_id)   [fire-and-forget → Stats werden echt]
   3. Render Hub: Hero "Empfohlen von [Firma]" + Trust + 2 CTA-Karten
        │                                              │
        ▼ Weg 1 »Gutachter finden«                     ▼ Weg 2 »Anspruch prüfen«
   app.claimondo.de/start/makler/[maklerId]        claimondo.de/check?m=MK-XXXX
   (EMBED_ORIGIN; bestehender attribuierter         (hidden field 'm' → submitCheckLead
    Finder → reserviereEmbedTermin setzt             → resolve → leads.promotion_code_id)
    promotion_code_id → Lead)
        │                                              │
        └───────────────► kanonischer Lead (promotion_code_id gesetzt) ◄──────────┘
                          → convert-lead-to-claim:435 (promo→claims.makler_id)
                          → Trigger create_makler_provision → Provision + makler_fall_consent (#3349)
```

## Komponenten (File-Struktur)

### NEU (Marketing-Lane)
- **`claimondo-marketing/lib/makler/resolve-promo.ts`** — `resolveMaklerByPromoCode(sb, code): Promise<{ promotionCodeId, maklerId, firma, aktiv } | null>`. Eine Query (`promotion_codes` join `makler` by `code`, `aktiv=true`). Testbar, von Hub + Check-Leg genutzt.
- **`claimondo-marketing/app/[locale]/m/[code]/page.tsx`** — Server-Component: resolve → (fallback redirect) → click-track → render `<MaklerHubLanding>`. `export const metadata = { robots: { index: false, follow: false } }`. `dynamic = 'force-dynamic'`.
- **`claimondo-marketing/app/[locale]/m/[code]/MaklerHubLanding.tsx`** — präsentationale Komponente: Hero (`Empfohlen von {firma}`), Trust-Block (Claimondo §249 „0 € für Sie"), 2 CTA-Karten mit `href` (Finder = `${EMBED_ORIGIN}/start/makler/${maklerId}`, Anspruch = `/check?m=${code}`). Claimondo-Branding (bestehende Marketing-Tokens/Sections wiederverwenden).

### MODIFY (Marketing-Lane) — ⚠ Koordination mit Session 3aba3976
- **`claimondo-marketing/app/[locale]/check/check-lead-action.ts`** — `submitCheckLead` akzeptiert optionales Feld `m` (Promo-Code). Mechanismus: post-convert-UPDATE — nach `convert_anfrage_zu_lead` → wenn `m` gesetzt: `resolveMaklerByPromoCode` → `UPDATE leads SET promotion_code_id = <id> WHERE id = leadId` (additiv, synchron in derselben Action, vor dem Notify; best-effort). Begründung: vermutlich hat `anfragen` keine `promotion_code_id`-Spalte und die geteilte RPC `convert_anfrage_zu_lead` soll NICHT per DDL geändert werden — **im Plan verifizieren**; falls `anfragen` die Spalte doch trägt + die RPC sie propagiert, ist der INSERT-Pfad (Promo in die `anfragen`-Insert) vorzuziehen (audit-konforme INSERT-Härtung).
- **`claimondo-marketing/app/[locale]/check/page.tsx` + `CheckFunnelClient.tsx`** — `searchParams.m` lesen → als hidden field an `submitCheckLead` durchreichen.

### MODIFY (App-Lane) — 404-Fix
- **`src/app/makler/(shell)/promo/page.tsx`** — `landingUrl` Pfad `/start/makler/${makler.id}` → `/m/${code.code}` (gleiche `landingBase()`-Basis = `claimondo.de`, jetzt eine echte Marketing-Route). QR baut aus der neuen URL. Die bestehenden WhatsApp/Email/LinkedIn-Share-Buttons teilen ab da den Hub-Link (erfüllt „per WhatsApp mitsenden").

### REUSE (kein Eingriff)
- `src/app/start/makler/[maklerId]/page.tsx` + `reserviereEmbedTermin` (HOT aar-956) — Leg-1-Ziel, unverändert.

## Error-Handling
- Ungültiger/unbekannter Code oder `makler.status != 'aktiv'` → `redirect('/gutachter-finden')` (kein 404, kein Crash).
- `promo_clicks`-Insert: try/catch fire-and-forget (ein Tracking-Fehler darf die Seite nie brechen).
- Check-Leg-Promo-UPDATE: best-effort try/catch (ein Promo-UPDATE-Fail darf die Lead-Erstellung nicht brechen — der Lead existiert schon; ohne Promo bleibt er ein normaler Check-Lead). Log + weiter.

## Testing
- **Unit (vitest, falls Marketing-Build vitest hat; sonst minimal im App-Build spiegeln):** `resolveMaklerByPromoCode` — valider Code → Objekt; unbekannter Code → null; inaktiver Makler → `aktiv:false`.
- **Manuell/E2E-Smoke:** (1) `claimondo.de/m/MK-SMKE` (Test-Makler) rendert Hub mit „Empfohlen von Test Makler GmbH" + 2 CTAs; (2) Finder-CTA → app-Finder; (3) Anspruch-CTA → `/check?m=…` → Lead bekommt `promotion_code_id` (DB-Check); (4) ungültiger Code → `/gutachter-finden`; (5) `promo_clicks`-Zeile entsteht; (6) `/makler/promo` zeigt `claimondo.de/m/MK-SMKE` + QR auflösbar.
- **DB-Verifikation:** nach Anspruch-Leg-Submit `select promotion_code_id from leads where id=…` → gesetzt.

## Koordination
- **Session 3aba3976** (`kitta/aar-956-…`) baut `/check` zum Rich-Feature (Schadenfotos → Claude-Schätzung) um → **gleiche Files** (`check-lead-action.ts`, `check/page.tsx`, `CheckFunnelClient.tsx`). Der Promo-Handoff-Contract (`?m=` → hidden field → `promotion_code_id`) ist additiv; **vor Implementierung von Leg 2 mit 3aba3976 abstimmen** (entweder sie nehmen `?m=` in ihren Rebuild auf, oder ich liefere einen minimalen additiven Patch). Der Hub selbst (NEU 1–3 + 404-Fix) ist davon **unabhängig** baubar/shippbar.
- **aar-956-Sessions** — Finder/`embed/gutachter-finder`/`reserviereEmbedTermin` HOT → nur lesen/verlinken.
- **Cross-Lane-Deploy** — Hub (Marketing) vor Promo-Link-Flip (App).

## Out of Scope
- Rich-Anspruch-Check-Interna (Fotos→Claude) = Session 3aba3976.
- Säule B: Makler-Selbst-Registrierung (heute admin-only; Recruiting-LP `/makler/partner-werden` = mailto-Sackgasse) — eigene Spec.
- Attribution-Härtung des Finder-Post-UPDATE (`embed/gutachter-finder/actions.ts:323`) — aar-956-Domäne.
- Säule C: per-Gutachter-Landeseiten.

## Offene Verifikations-Punkte (im Plan klären, nicht Design-blockierend)
- Ist `/start/makler/[maklerId]` auf `app.claimondo.de` (Prod-VPS) deployed? (Leg 1 hängt dran — sonst erst App-Deploy.)
- Hat der Marketing-Build ein vitest-Setup? (sonst Unit-Test des Resolvers im App-Build oder reiner E2E-Smoke.)
- Existiert `/gutachter-finden` als Marketing-Route für den Fallback-Redirect? (sonst `/` als Fallback.)
- Hat `anfragen` eine `promotion_code_id`-Spalte / propagiert `convert_anfrage_zu_lead` sie? (entscheidet Leg-2-Mechanismus: INSERT-Pfad vs. post-convert-UPDATE.)
