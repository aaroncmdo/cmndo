# Plan — `makler.claimondo.de` Subdomain

**Datum:** 2026-05-12
**Ziel:** Eigene B2B-Akquise-Subdomain für Versicherungsmakler, analog zu `gutachter.claimondo.de`
**Vorlage:** PR #713 (gutachter.claimondo.de B2B-Sales-Landing mit Waitlist + Live-Karte)

---

## TL;DR

Die App hat bereits **80 % der Bausteine**: Makler-Portal-Shell, DB-Tabellen, Permission-Matrix, sogar eine Vorab-Landing (`/makler/partner-werden`, 360 Lines). Was fehlt: Subdomain-Routing, dedizierte B2B-Sales-Landing analog `gutachter-partner`, Waitlist-Tabelle. **Aufwand: 1 Tag.**

---

## Was existiert

### Code
- ✅ **Makler-Portal-Shell** (`src/app/makler/(shell)/...`): Dashboard, Akten, Abrechnungen, Einstellungen, Promo, Leads, Onboarding, Pending — komplett, nur "post-pilot, nicht live" laut Memory
- ✅ **Marketing-Landing** `/makler/partner-werden/page.tsx` (360 Lines, voll SEO/JSON-LD ausgestattet, Footer-verlinkt) — aber innerhalb der Hauptdomain, kein eigenes B2B-Sales-Layout
- ✅ **Server-Actions** `lib/actions/makler-settings.ts`, `makler-send-message.ts`
- ✅ **Permission-Matrix-Eintrag** für `makler` (scope `makler_kunden`)

### DB
- ✅ `makler` (1 Row, Schema vorhanden)
- ✅ `makler_provisionen`, `makler_fall_consent`, `provisionen_maik`
- ✅ `promo_clicks`, `promotion_codes` (für Maik-Provision-Flow)

### Infrastruktur (Vorlage gutachter.claimondo.de)
- ✅ `src/proxy.ts:38-47` rewriten `gutachter.claimondo.de/<pfad>` → `/gutachter-partner/<pfad>`
- ✅ `src/lib/supabase/middleware.ts:165` listet `/gutachter-partner` als Public-Path
- ✅ `gutachter-partner/page.tsx` (69 L) + `GutachterPartnerClient.tsx` (402 L) + `WaitlistApply.tsx` (447 L) + `actions.ts` (73 L) + `opengraph-image.tsx`
- ✅ DB-Tabelle `gutachter_waitlist` (Bewerbungen → Triagiert → konvertiert in `sachverstaendige`)

---

## Was fehlt

### 1. DNS + nginx (VPS)
- DNS-Eintrag `makler.claimondo.de` → A-Record auf VPS
- nginx-Vhost mit Cert (Let's Encrypt analog gutachter.claimondo.de)
- VPS-Aaron-Befehl, **kein Code-Change**

### 2. Subdomain-Rewrite in `src/proxy.ts`
Nach Block für `gutachter.claimondo.de` (Zeile 38-47) analog ergänzen:
```ts
if (hostname === 'makler.claimondo.de') {
  const url = request.nextUrl.clone()
  if (
    !pathname.startsWith('/makler-partner') &&
    !pathname.startsWith('/api/')
  ) {
    url.pathname = `/makler-partner${pathname === '/' ? '' : pathname}`
    return NextResponse.rewrite(url)
  }
}
```

### 3. Public-Path-Allowlist in `src/lib/supabase/middleware.ts:126-168`
`/makler-partner` zur Liste hinzufügen.

### 4. Neue Route `/makler-partner/`
Spiegel von `gutachter-partner/` mit Makler-spezifischem Inhalt:

| Datei | Vorlage | Anpassung |
|---|---|---|
| `src/app/makler-partner/page.tsx` | `gutachter-partner/page.tsx` (69 L) | SEO-Meta auf Makler-Akquise, JSON-LD Service-Schema |
| `src/app/makler-partner/MaklerPartnerClient.tsx` | `GutachterPartnerClient.tsx` (402 L) | Hero "Werden Sie Claimondo-Partner" + Vorteile-Sektion (Mehrwert für Versicherungskunden, kein Aufwand, Provision optional) + ROI-Beispiel |
| `src/app/makler-partner/WaitlistApply.tsx` | `WaitlistApply.tsx` (447 L) | Form-Felder: Vermittlernummer, Versicherer-Pool, Schadensmenge/Monat, Bestandsgröße |
| `src/app/makler-partner/actions.ts` | `gutachter-partner/actions.ts` (73 L) | `submitMaklerWaitlistApplication()` |
| `src/app/makler-partner/opengraph-image.tsx` | identisch übernehmen | Brand-Headline auf "Makler-Partnerschaft" |

**Wiederverwendung:** `LandingTopbar`, `LandingFooter`, `StickyCallBar`, `AnswerCapsule` aus `src/components/landing/` — keine Duplikate, identische Komponenten wie marketing-Landings.

### 5. DB-Tabelle `makler_waitlist`
Migration via `npx supabase migration new` (AGENTS.md-Regel 2):

```sql
CREATE TABLE public.makler_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vermittlernummer text,
  firmenname text NOT NULL,
  ansprechpartner text NOT NULL,
  email text NOT NULL,
  telefon text,
  versicherer_pool text[],         -- Liste der gepflegten Versicherer
  bestandsgroesse_kunden int,      -- Zahl der Versicherungskunden
  schaeden_pro_monat_geschaetzt int,
  region_plz text,
  status text NOT NULL DEFAULT 'eingegangen' CHECK (status IN ('eingegangen','triagiert','akzeptiert','abgelehnt','konvertiert')),
  notiz_intern text,
  ip_hash text,                    -- Spam-Bremse, kein Klartext
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  triagiert_am timestamptz,
  triagiert_von uuid REFERENCES auth.users(id)
);

ALTER TABLE public.makler_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_makler_waitlist" ON public.makler_waitlist
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_read_makler_waitlist" ON public.makler_waitlist
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_manage_makler_waitlist" ON public.makler_waitlist
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
```

### 6. Sitemap + robots.txt
- `src/app/sitemap.ts` (oder dynamic) — Eintrag `https://makler.claimondo.de/` ergänzen
- robots.txt der Subdomain darf Indexierung erlauben (analog gutachter.claimondo.de)

### 7. `/makler/partner-werden` umlenken (optional)
Die existierende Landing (360 Lines) kann:
- (a) **bleiben** als interne Marketing-Page für Footer-Link
- (b) **301 redirect** zu `https://makler.claimondo.de/`
- (c) **gelöscht werden** wenn Subdomain übernimmt

→ **Empfehlung:** (a) bleiben — Footer-Link funktioniert weiter, Subdomain läuft parallel als Sales-Landing für gezielte Marketing-Kampagnen.

### 8. Footer-Link auf der Hauptdomain
`src/components/landing/LandingFooter.tsx` ergänzen oder ändern:
- Aktuell: `Makler Partner werden` → `/makler/partner-werden`
- Optional ergänzen: zweiter Link `/makler.claimondo.de` für direkte B2B-Akquise

---

## Akquise-Inhalt (Pflichtsektionen für Sales-Landing)

Analog `gutachter-partner` (PR #713) bewährt:

1. **Hero** — "Mehr Service für Ihre Kunden, kein Aufwand für Sie"
2. **Vorteile** (3-4 Cards) — Kundenbindung, kostenlos, weiße Marke (kein Branding-Konflikt), schnelle Abwicklung
3. **Wie es funktioniert** (3-Step-Diagramm) — Kunde meldet Schaden → Claimondo übernimmt → Makler bleibt im CC
4. **ROI-Beispiel** — "10 Schäden pro Jahr × 0 € Aufwand = X Std. Zeitersparnis"
5. **FAQ-Section** — Provision? Datenschutz? Kunden-Loyalität? White-Label-Optionen?
6. **Waitlist-Apply** — Formular mit Vermittlernummer, Versicherer-Pool, Bestandsgröße
7. **Trust-Signale** — Logos der bisherigen Partner, Testimonials, "Powered by Claimondo"

**Live-Karte (optional):** gutachter-partner zeigt SV-Standorte. Für Makler vermutlich nicht relevant — ggf. weglassen oder durch "Wo wir aktiv sind"-Heatmap ersetzen.

---

## Aufwand

| Schritt | Zeit |
|---|---|
| 1. DNS + nginx VPS | 30 Min (Aaron-Befehl) |
| 2. proxy.ts + middleware allowlist | 15 Min |
| 3. Route `/makler-partner/` (5 Files, ~1000 Lines, copy + adapt) | 4-6 h |
| 4. DB-Migration `makler_waitlist` + Smoke | 30 Min |
| 5. Sitemap + robots | 15 Min |
| 6. Akquise-Inhalt verfeinern (Hero/Vorteile/FAQ Texte) | 2-3 h |
| 7. Build + Smoke `makler.claimondo.de` Live-Test | 30 Min |
| **Total** | **~1 Tag** |

---

## Reihenfolge

1. **DNS + nginx beauftragen** (lange Lead-Time durch Cert-Validation, ~5 Min real, aber parallel laufen lassen)
2. **DB-Migration erstellen** (`npx supabase migration new makler_waitlist`)
3. **Route kopieren + anpassen** (`/makler-partner/` aus `/gutachter-partner/`)
4. **proxy.ts + middleware**
5. **Build + Local-Smoke** (`makler.localhost:3000` per `/etc/hosts`)
6. **Deploy + Live-Smoke**
7. **Sitemap-Update + robots**

---

## Out of Scope (separates Ticket)

- **Makler-Portal aktivieren** (`/makler/(shell)/...` ist da, aber Pilot-Status). Erst wenn Akquise via Subdomain Bewerbungen einsammelt, Pilot live schalten
- **White-Label für Makler-Kunden** — analog SV-Branding, aber für Makler. Eigenes Spec (verbunden mit `branding-rollout-spec.md` von heute)
- **Maik-Provision-Pattern auf Makler übertragen** — Provisionen pro Lead via `makler_provisionen`, eigenes Cron-Modell
- **A/B-Test Footer-Link vs. Subdomain** — Marketing-Analyse welche Akquise besser konvertiert

---

## Risiken

- **`gutachter_waitlist` Naming-Drift:** Tabelle hat schon Schema, `makler_waitlist` muss eigenständig sein — kein UNION
- **Subdomain-Cookies:** Auth-Cookies sind auf `.claimondo.de` (Wildcard), gut. Aber `makler.claimondo.de` ist Public — kein Auth-Flow nötig
- **SEO-Konkurrenz Hauptdomain:** Wenn `/makler/partner-werden` weiter existiert + Subdomain, Google verwirrt. Lösung: Sitemap eindeutig, Canonical-Tags pro Seite richtig setzen
- **Kein Drift zur App-Subdomain:** `makler.claimondo.de` darf nicht App-Routes (login, faelle etc.) zugänglich machen — wird durch Rewrite-Block in proxy.ts verhindert (alles geht auf `/makler-partner/*`)
