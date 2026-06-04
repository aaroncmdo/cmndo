# Per-SV Client-Side Conversion-Tracking (Monika-Embed) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder SV trägt im Embed-Cockpit seine eigenen GA4-/Google-Ads-Conversion-IDs ein; das Monika-Widget feuert bei erfolgreicher Anfrage client-seitig `gtag` direkt in das GA4/Ads genau dieses SV — per-SV isoliert, kein Make/Zapier, kein GTM.

**Architecture:** `embed_sites` hält die public Tracking-IDs (GA4 Measurement-ID existiert; +2 Spalten für Ads Conversion-ID/Label). `/api/embed/config` liefert einen `tracking`-Block (nur public-IDs) ans Widget. Das Widget lädt bei Submit-Erfolg `gtag` lazy und feuert `generate_lead` (GA4) + `conversion` (Ads) mit den Site-IDs. Pure Entscheidungs-Funktionen (`pickPublicTracking`, `planConversionCalls`) sind unit-getestet; DOM/gtag-Seiteneffekte sind dünn drumherum.

**Tech Stack:** Next.js (App Router, Route Handler), Preact-Widget (esbuild IIFE), Supabase (service_role, Plugin-Migration), Vitest, gtag.js.

**Branch:** `kitta/aar-939-embed-per-site-ga4` (off `main`) · Worktree `.claude/worktrees/aar939-embed-ga4` · PR → `staging`.

**Koordination:** `src/embed/monika/app.tsx` wird von parallelen AAR-939-Sessions geteilt — der G1-Edit dort ist minimal (4 Zeilen). Vor PR `git fetch origin main` + bei Drift in `app.tsx` rebasen.

---

## File Structure

**Create:**
- `supabase/migrations/<recorded_version>_aar939_embed_sites_gads_conversion.sql` — DDL-Spiegel (Plugin-getrackt)
- `src/lib/embed/config-tracking.ts` — `pickPublicTracking(row)` (pure)
- `src/lib/embed/config-tracking.test.ts` — Unit-Test
- `src/embed/monika/conversion.ts` — `planConversionCalls(t)` (pure) + `fireSiteConversion(cfg)` (gtag-Seiteneffekt)
- `src/embed/monika/conversion.test.ts` — Unit-Test für `planConversionCalls`

**Modify:**
- `src/app/api/embed/config/route.ts` — EmbedSiteRow + select + `tracking`-Block in Response
- `src/embed/monika/types.ts` — `MonikaTracking` + `MonikaConfig.tracking`
- `src/embed/monika/api.ts` — `ConfigResponse.tracking`
- `src/embed/monika/index.tsx` — `tracking` in beide cfg-Zweige
- `src/embed/monika/app.tsx` — G1-Fix + `fireSiteConversion(cfg)` im Erfolgszweig
- `public/embed/monika.v1.js` + `monika.js` — esbuild-Rebuild-Artefakt
- `src/lib/embed/site-write.ts` — Form-Shape +2 Felder
- `src/app/gutachter/einstellungen/embed/actions.ts` — `buildRow` +2 Felder
- `src/app/gutachter/einstellungen/embed/[id]/page.tsx` — DB→Form-Mapping +2 Felder
- `src/app/gutachter/einstellungen/embed/EmbedSiteWizard.tsx` — 2 TextFields in STEP 2
- `src/app/gutachter/einstellungen/embed/[id]/tracking-anleitung/page.tsx` — Anleitung um GA4-Key-Event + Ads-Conversion erweitern

---

## Task 1: Schema — 2 Ads-Conversion-Spalten (Supabase-Plugin, Regel 2)

**Files:**
- Create: `supabase/migrations/<recorded_version>_aar939_embed_sites_gads_conversion.sql`

- [ ] **Step 1: Migration via Plugin anwenden**

`mcp__plugin_supabase_supabase__apply_migration` (project_id `paizkjajbuxxksdoycev`):
- name: `aar939_embed_sites_gads_conversion`
- query:
```sql
alter table public.embed_sites
  add column if not exists tracking_gads_conversion_id text,
  add column if not exists tracking_gads_conversion_label text;

comment on column public.embed_sites.tracking_gads_conversion_id is
  'AAR-939: Google Ads Conversion-ID (AW-XXXXXXXXX) fuer client-seitiges per-SV gtag. Public, kein Secret.';
comment on column public.embed_sites.tracking_gads_conversion_label is
  'AAR-939: Google Ads Conversion-Label. send_to = conversion_id/label.';
```

- [ ] **Step 2: Recorded Version ablesen**

`mcp__plugin_supabase_supabase__list_migrations` (project_id `paizkjajbuxxksdoycev`) → die NEUESTE `version` für `aar939_embed_sites_gads_conversion` notieren (Plugin vergibt eigenen Timestamp `<V>`).

- [ ] **Step 3: Migration-File committen (Dateiname == recorded version)**

Schreibe `supabase/migrations/<V>_aar939_embed_sites_gads_conversion.sql` mit exakt dem DDL aus Step 1.
```bash
git add supabase/migrations/<V>_aar939_embed_sites_gads_conversion.sql
git commit -m "feat(aar-939): embed_sites +tracking_gads_conversion_id/_label (per-SV Ads-Conversion)"
```

- [ ] **Step 4: Verifizieren (READ)**

`mcp__plugin_supabase_supabase__execute_sql` (project_id `paizkjajbuxxksdoycev`):
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='embed_sites' and column_name like 'tracking_gads%'
order by column_name;
```
Expected: `tracking_gads_conversion_id`, `tracking_gads_conversion_label`, `tracking_gads_customer_id` (3 Zeilen).

> Types: NICHT neu generieren — der Config-Endpoint castet `embed_sites` bereits `as any` (types-lagging-DB-Idiom, route.ts:75). Kein Consumer referenziert die neuen Spalten getypt.

---

## Task 2: Config-Endpoint — `tracking`-Block (pure Helper + TDD)

**Files:**
- Create: `src/lib/embed/config-tracking.ts`
- Test: `src/lib/embed/config-tracking.test.ts`
- Modify: `src/app/api/embed/config/route.ts`

- [ ] **Step 1: Failing Test schreiben**

`src/lib/embed/config-tracking.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pickPublicTracking } from './config-tracking'

describe('pickPublicTracking', () => {
  it('mappt die drei public IDs', () => {
    expect(
      pickPublicTracking({
        tracking_ga4_measurement_id: 'G-ABC123',
        tracking_gads_conversion_id: 'AW-999',
        tracking_gads_conversion_label: 'lbl_42',
      }),
    ).toEqual({ ga4MeasurementId: 'G-ABC123', gadsConversionId: 'AW-999', gadsConversionLabel: 'lbl_42' })
  })

  it('null bleibt null', () => {
    expect(
      pickPublicTracking({
        tracking_ga4_measurement_id: null,
        tracking_gads_conversion_id: null,
        tracking_gads_conversion_label: null,
      }),
    ).toEqual({ ga4MeasurementId: null, gadsConversionId: null, gadsConversionLabel: null })
  })

  it('leakt KEINE secret-Felder, auch wenn sie auf der Row liegen', () => {
    const out = pickPublicTracking({
      tracking_ga4_measurement_id: 'G-1',
      tracking_gads_conversion_id: null,
      tracking_gads_conversion_label: null,
      // @ts-expect-error — Extra-Feld simuliert eine breitere Row
      tracking_webhook_secret: 'TOPSECRET',
    })
    expect(JSON.stringify(out)).not.toContain('TOPSECRET')
    expect(Object.keys(out)).toEqual(['ga4MeasurementId', 'gadsConversionId', 'gadsConversionLabel'])
  })
})
```

- [ ] **Step 2: Test laufen lassen → FAIL**

Run: `npx vitest run src/lib/embed/config-tracking.test.ts`
Expected: FAIL ("Cannot find module './config-tracking'").

- [ ] **Step 3: Implementierung schreiben**

`src/lib/embed/config-tracking.ts`:
```ts
// AAR-939 · Monika-Embed — public Tracking-Block für /api/embed/config.
// PURE: nimmt die drei public Tracking-Spalten einer embed_sites-Row und gibt
// exakt die public IDs zurück. Liest NUR diese Felder → kein Secret-Leak.

export interface PublicTrackingRow {
  tracking_ga4_measurement_id: string | null
  tracking_gads_conversion_id: string | null
  tracking_gads_conversion_label: string | null
}

export interface PublicTracking {
  ga4MeasurementId: string | null
  gadsConversionId: string | null
  gadsConversionLabel: string | null
}

export function pickPublicTracking(row: PublicTrackingRow): PublicTracking {
  return {
    ga4MeasurementId: row.tracking_ga4_measurement_id ?? null,
    gadsConversionId: row.tracking_gads_conversion_id ?? null,
    gadsConversionLabel: row.tracking_gads_conversion_label ?? null,
  }
}
```

- [ ] **Step 4: Test laufen lassen → PASS**

Run: `npx vitest run src/lib/embed/config-tracking.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Route verdrahten**

In `src/app/api/embed/config/route.ts`:

(a) Import oben ergänzen (nach Zeile 3 `import { signSiteToken }`):
```ts
import { pickPublicTracking } from '@/lib/embed/config-tracking'
```

(b) `EmbedSiteRow`-Interface (route.ts:60-69) um 3 Felder erweitern — nach `brand_logo_url_override: string | null`:
```ts
    tracking_ga4_measurement_id: string | null
    tracking_gads_conversion_id: string | null
    tracking_gads_conversion_label: string | null
```

(c) Das `.select(...)` (route.ts:79) um die 3 Spalten erweitern:
```ts
    .select('slug, variante, aktiv, sv_id, brand_primary_override, brand_secondary_override, brand_accent_override, brand_logo_url_override, tracking_ga4_measurement_id, tracking_gads_conversion_id, tracking_gads_conversion_label')
```

(d) Response (route.ts:134-142) um `tracking` erweitern:
```ts
  return json(
    {
      theme,
      telefon: null,
      whatsapp: null,
      site_token: siteToken,
      tracking: pickPublicTracking(site),
    },
    200,
  )
```

- [ ] **Step 6: tsc + commit**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.
```bash
git add src/lib/embed/config-tracking.ts src/lib/embed/config-tracking.test.ts src/app/api/embed/config/route.ts
git commit -m "feat(aar-939): config-Endpoint liefert public tracking-Block (GA4+Ads IDs)"
```

---

## Task 3: Widget — Config-Typen + Plumbing (kein neuer Code-Pfad, nur Daten durchreichen)

**Files:**
- Modify: `src/embed/monika/types.ts`, `src/embed/monika/api.ts`, `src/embed/monika/index.tsx`

- [ ] **Step 1: `MonikaTracking` + `MonikaConfig.tracking` (types.ts)**

In `src/embed/monika/types.ts` nach dem `MonikaTheme`-Interface (nach Zeile 15) einfügen:
```ts
export interface MonikaTracking {
  ga4MeasurementId: string | null
  gadsConversionId: string | null
  gadsConversionLabel: string | null
}
```
Und im `MonikaConfig`-Interface (nach `stadtSlug: string | null`, Zeile 26) ergänzen:
```ts
  /** Per-SV Tracking-IDs (nur sv_embed, aus /api/embed/config). null = kein Tracking. */
  tracking: MonikaTracking | null
```

- [ ] **Step 2: `ConfigResponse.tracking` (api.ts)**

In `src/embed/monika/api.ts` das `ConfigResponse`-Interface (Zeile 8-14) um ein Feld erweitern (nach `site_token`):
```ts
  tracking?: {
    ga4MeasurementId: string | null
    gadsConversionId: string | null
    gadsConversionLabel: string | null
  } | null
```

- [ ] **Step 3: `tracking` in beide cfg-Zweige (index.tsx)**

In `src/embed/monika/index.tsx`:
- sv_embed-Zweig (nach `stadtSlug: null,` Zeile 97) ergänzen:
```ts
      tracking: remote?.tracking ?? null,
```
- kfz_gutachter_lp-Zweig (nach `stadtSlug: d.stadt || null,` Zeile 117) ergänzen:
```ts
      tracking: null,
```

- [ ] **Step 4: tsc + commit**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler (cfg-Objekte sind jetzt vollständig).
```bash
git add src/embed/monika/types.ts src/embed/monika/api.ts src/embed/monika/index.tsx
git commit -m "feat(aar-939): widget reicht per-SV tracking-IDs aus der config durch"
```

---

## Task 4: Widget — Conversion feuern (pure Plan + TDD) + G1-Fix + Build

**Files:**
- Create: `src/embed/monika/conversion.ts`, `src/embed/monika/conversion.test.ts`
- Modify: `src/embed/monika/app.tsx`
- Build: `public/embed/monika.v1.js` + `monika.js`

- [ ] **Step 1: Failing Test für `planConversionCalls`**

`src/embed/monika/conversion.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { planConversionCalls } from './conversion'

describe('planConversionCalls', () => {
  it('GA4 only → config + generate_lead', () => {
    expect(planConversionCalls({ ga4MeasurementId: 'G-1', gadsConversionId: null, gadsConversionLabel: null }))
      .toEqual([
        ['config', 'G-1'],
        ['event', 'generate_lead', { send_to: 'G-1' }],
      ])
  })

  it('Ads mit Label → config + conversion mit send_to id/label', () => {
    expect(planConversionCalls({ ga4MeasurementId: null, gadsConversionId: 'AW-9', gadsConversionLabel: 'lbl' }))
      .toEqual([
        ['config', 'AW-9'],
        ['event', 'conversion', { send_to: 'AW-9/lbl' }],
      ])
  })

  it('Ads ohne Label → send_to nur die ID', () => {
    expect(planConversionCalls({ ga4MeasurementId: null, gadsConversionId: 'AW-9', gadsConversionLabel: null }))
      .toEqual([
        ['config', 'AW-9'],
        ['event', 'conversion', { send_to: 'AW-9' }],
      ])
  })

  it('beide → GA4- UND Ads-Calls', () => {
    expect(planConversionCalls({ ga4MeasurementId: 'G-1', gadsConversionId: 'AW-9', gadsConversionLabel: 'lbl' }))
      .toEqual([
        ['config', 'G-1'],
        ['event', 'generate_lead', { send_to: 'G-1' }],
        ['config', 'AW-9'],
        ['event', 'conversion', { send_to: 'AW-9/lbl' }],
      ])
  })

  it('nichts gesetzt → keine Calls', () => {
    expect(planConversionCalls({ ga4MeasurementId: null, gadsConversionId: null, gadsConversionLabel: null }))
      .toEqual([])
  })
})
```

- [ ] **Step 2: Test → FAIL**

Run: `npx vitest run src/embed/monika/conversion.test.ts`
Expected: FAIL ("Cannot find module './conversion'").

- [ ] **Step 3: `conversion.ts` schreiben**

`src/embed/monika/conversion.ts`:
```ts
// AAR-939 · Monika-Embed — Per-SV Conversion-Feuern (client-side gtag).
//
// planConversionCalls: PURE — entscheidet aus den Tracking-IDs die gtag-Calls
// (testbar). fireSiteConversion: lädt gtag.js lazy (post-consent, nur bei
// Submit-Erfolg) und wendet die Calls an. KEIN value → der SV definiert den Wert
// in seiner GA4/Ads-Conversion-Action selbst (wir überschreiben ihn nicht).

import type { MonikaConfig, MonikaTracking } from './types'

export type GtagCall = [string, ...unknown[]]

export function planConversionCalls(t: MonikaTracking): GtagCall[] {
  const calls: GtagCall[] = []
  if (t.ga4MeasurementId) {
    calls.push(['config', t.ga4MeasurementId])
    calls.push(['event', 'generate_lead', { send_to: t.ga4MeasurementId }])
  }
  if (t.gadsConversionId) {
    calls.push(['config', t.gadsConversionId])
    const sendTo = t.gadsConversionLabel ? `${t.gadsConversionId}/${t.gadsConversionLabel}` : t.gadsConversionId
    calls.push(['event', 'conversion', { send_to: sendTo }])
  }
  return calls
}

interface GtagWindow extends Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

/** Stellt sicher, dass window.gtag existiert; lädt gtag.js einmalig mit loadId. */
function ensureGtag(loadId: string): (...args: unknown[]) => void {
  const w = window as GtagWindow
  if (typeof w.gtag === 'function') return w.gtag // SV hat schon gtag → wiederverwenden
  w.dataLayer = w.dataLayer || []
  const gtag = (...args: unknown[]) => {
    ;(w.dataLayer as unknown[]).push(args)
  }
  w.gtag = gtag
  gtag('js', new Date())
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loadId)}`
  document.head.appendChild(s)
  return gtag
}

/** Feuert bei Submit-Erfolg die per-SV-Conversion. No-op ohne IDs / außer sv_embed. */
export function fireSiteConversion(cfg: MonikaConfig): void {
  if (cfg.source !== 'sv_embed' || !cfg.tracking) return
  const calls = planConversionCalls(cfg.tracking)
  if (calls.length === 0) return
  const loadId = cfg.tracking.ga4MeasurementId || cfg.tracking.gadsConversionId
  if (!loadId) return
  try {
    const gtag = ensureGtag(loadId)
    for (const [cmd, ...args] of calls) gtag(cmd, ...args)
  } catch {
    /* Tracking darf den Erfolgs-Flow nie brechen */
  }
}
```

- [ ] **Step 4: Test → PASS**

Run: `npx vitest run src/embed/monika/conversion.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: G1-Fix + Conversion-Call in app.tsx**

In `src/embed/monika/app.tsx`:
- Import nach `import { track } from './tracking'` (Zeile 12) ergänzen:
```ts
import { fireSiteConversion } from './conversion'
```
- Die `submit()`-Funktion (aktuell Zeile 53-78): das `track(cfg, 'monika_anfrage_submit')` von VOR dem `await` (Zeile 73) entfernen und den Erfolgszweig ersetzen. Konkret die Zeilen
```ts
    track(cfg, 'monika_anfrage_submit')
    const result = await submitAnfrage(cfg.base, payload)
    sending.value = false
    if (result.ok) go('success')
    else error.value = result.error
```
ersetzen durch:
```ts
    const result = await submitAnfrage(cfg.base, payload)
    sending.value = false
    if (result.ok) {
      // G1: erst bei Erfolg zählen (vorher feuerte es auf Submit-Versuch)
      track(cfg, 'monika_anfrage_submit')
      fireSiteConversion(cfg)
      go('success')
    } else {
      error.value = result.error
    }
```

- [ ] **Step 6: Widget bauen (esbuild) + Budget-Check**

Run: `npm run build:embed`
Expected: `[monika] built: …` + `gzip-Budget ok (< 30.0 KB)`, exit 0. (Falls `build:embed` nicht existiert: `node scripts/build-monika.mjs`.)

- [ ] **Step 7: tsc + commit (inkl. Build-Artefakt)**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.
```bash
git add src/embed/monika/conversion.ts src/embed/monika/conversion.test.ts src/embed/monika/app.tsx public/embed/monika.v1.js public/embed/monika.js
git commit -m "feat(aar-939): widget feuert per-SV GA4/Ads-Conversion bei Submit-Erfolg (+G1-Fix)"
```

---

## Task 5: Cockpit — 2 Ads-Felder ins bestehende Tracking-Step

**Files:**
- Modify: `src/lib/embed/site-write.ts`, `src/app/gutachter/einstellungen/embed/actions.ts`, `src/app/gutachter/einstellungen/embed/[id]/page.tsx`, `src/app/gutachter/einstellungen/embed/EmbedSiteWizard.tsx`

- [ ] **Step 1: Form-Shape erweitern (site-write.ts)**

In `EmbedSiteFormData` (site-write.ts:11-28) nach `tracking_ga4_measurement_id: string`:
```ts
  tracking_gads_conversion_id: string
  tracking_gads_conversion_label: string
```
In `emptyEmbedSiteForm()` (site-write.ts:117-133) nach `tracking_ga4_measurement_id: '',`:
```ts
    tracking_gads_conversion_id: '',
    tracking_gads_conversion_label: '',
```

- [ ] **Step 2: DB-Write erweitern (actions.ts `buildRow`)**

In `src/app/gutachter/einstellungen/embed/actions.ts`, im `buildRow`-Objekt nach `tracking_ga4_measurement_id: orNull(form.tracking_ga4_measurement_id),` (actions.ts:80):
```ts
    tracking_gads_conversion_id: orNull(form.tracking_gads_conversion_id),
    tracking_gads_conversion_label: orNull(form.tracking_gads_conversion_label),
```

- [ ] **Step 3: DB→Form-Mapping erweitern ([id]/page.tsx)**

In `src/app/gutachter/einstellungen/embed/[id]/page.tsx` nach `tracking_ga4_measurement_id: data.tracking_ga4_measurement_id ?? '',` (page.tsx:50):
```ts
    tracking_gads_conversion_id: data.tracking_gads_conversion_id ?? '',
    tracking_gads_conversion_label: data.tracking_gads_conversion_label ?? '',
```
Falls die `.select(...)` in dieser Datei die Spalten explizit listet (statt `*`): `tracking_gads_conversion_id, tracking_gads_conversion_label` ergänzen. (Prüfen: `grep -n "select(" [id]/page.tsx` — bei `select('*')` nichts zu tun.)

- [ ] **Step 4: 2 TextFields im Wizard (EmbedSiteWizard.tsx STEP 2)**

In `src/app/gutachter/einstellungen/embed/EmbedSiteWizard.tsx` direkt nach dem GA4-`TextField` (das mit `value={form.tracking_ga4_measurement_id}`, endet ~Zeile 332 mit `placeholder="G-XXXXXXX"` + `/>`):
```tsx
          <TextField
            label="Google-Ads Conversion-ID (optional)"
            value={form.tracking_gads_conversion_id}
            onChange={(e) => patch({ tracking_gads_conversion_id: e.target.value })}
            hint="Aus Google Ads → Conversions. Format AW-XXXXXXXXX."
            placeholder="AW-XXXXXXXXX"
          />
          <TextField
            label="Google-Ads Conversion-Label (optional)"
            value={form.tracking_gads_conversion_label}
            onChange={(e) => patch({ tracking_gads_conversion_label: e.target.value })}
            hint="Das Label aus demselben Conversion-Snippet (send_to = ID/Label)."
            placeholder="AbC-D_efGhIjK"
          />
```

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.
```bash
git add src/lib/embed/site-write.ts src/app/gutachter/einstellungen/embed/actions.ts "src/app/gutachter/einstellungen/embed/[id]/page.tsx" src/app/gutachter/einstellungen/embed/EmbedSiteWizard.tsx
git commit -m "feat(aar-939): cockpit-tracking-step +Google-Ads Conversion-ID/Label"
```

---

## Task 6: Anleitung erweitern (SV-facing Doku)

**Files:**
- Modify: `src/app/gutachter/einstellungen/embed/[id]/tracking-anleitung/page.tsx`

- [ ] **Step 1: Datei lesen + Abschnitt ergänzen**

`Read` die Datei. Ergänze einen Abschnitt (im bestehenden Stil/Komponenten der Seite), der erklärt:
- **GA4:** Measurement-ID `G-XXXXXXX` eintragen. Einmalig in GA4 → Verwalten → Ereignisse → `generate_lead` als **Schlüsselereignis** markieren → zählt als Conversion.
- **Google Ads:** in Google Ads eine **Conversion-Action** „Website → manuell mit Code" anlegen, aus dem Snippet `AW-XXXXXXXXX` (Conversion-ID) und das **Label** kopieren, beide Felder eintragen. Zählt sofort, kein weiterer Schritt.
- **Datenschutz:** das Widget lädt Google-Tag erst NACH dem Absenden (post-Consent); der SV muss GA4/Ads in seiner eigenen Datenschutzerklärung führen.

Texte auf Deutsch mit echten Umlauten (Frontend-Pflicht).

- [ ] **Step 2: tsc + commit**

Run: `npx tsc --noEmit`
```bash
git add "src/app/gutachter/einstellungen/embed/[id]/tracking-anleitung/page.tsx"
git commit -m "docs(aar-939): tracking-anleitung um GA4-Key-Event + Ads-Conversion ergaenzt"
```

---

## Task 7: Integration — voller tsc, Build, Smoke, PR

- [ ] **Step 1: Voller Build**

Run: `npm run build`
Expected: grün (Route `/api/embed/config` + Cockpit-Pages kompilieren).

- [ ] **Step 2: Alle neuen Tests**

Run: `npx vitest run src/lib/embed/config-tracking.test.ts src/embed/monika/conversion.test.ts`
Expected: PASS (8 Tests gesamt).

- [ ] **Step 3: Manueller Conversion-Smoke (eine Test-embed_site)**

`execute_sql` (READ): eine vorhandene `embed_sites`-slug mit `variante` holen; via `apply_migration` NICHT — stattdessen die IDs per Cockpit (oder einmalig per Server-Action) auf eine Test-GA4-ID `G-TESTONLY` setzen. Widget auf einer erlaubten Domain laden, Anfrage absenden → DevTools→Network: Request an `googletagmanager.com/gtag/js?id=G-TESTONLY` + `…/g/collect?…&en=generate_lead`. (Test-IDs danach wieder leeren.)

- [ ] **Step 4: PR gegen staging öffnen**

```bash
git fetch origin main
# bei Drift in src/embed/monika/app.tsx: git rebase origin/main
git push -u origin kitta/aar-939-embed-per-site-ga4
gh pr create --base staging --title "AAR-939: Per-SV Client-Side Conversion-Tracking (Monika-Embed)" --body "<Spec-Link + Zusammenfassung + Audit-Block>"
```
PR-Body: Link auf die Spec, die 4 Bausteine, der G1-Fix-Hinweis (app.tsx geteilt), und der 7-Punkte-Audit-Block (AGENTS.md).

---

## Self-Review (durchgeführt)
- **Spec-Coverage:** Schema (T1), Config-tracking-Block (T2), Widget-Plumbing+Conversion+G1 (T3/T4), Cockpit (T5), Consent/Anleitung (T6), Tests+PR (T7). ✓
- **Abweichung vom Spec:** Conversion feuert **ohne `value`** (statt 50 EUR) — der SV definiert den Wert in seiner eigenen Conversion-Action; ein imposed `value` würde ihn überschreiben. Spec-Doc wird entsprechend nachgezogen.
- **Typ-Konsistenz:** `MonikaTracking` (ga4MeasurementId/gadsConversionId/gadsConversionLabel) identisch in types.ts, api.ts (inline), config-tracking.ts (PublicTracking), conversion.ts. `pickPublicTracking`-Output == ConfigResponse.tracking-Shape == MonikaTracking. ✓
- **Keine Platzhalter:** alle Code-Steps mit vollständigem Code. ✓
