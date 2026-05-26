# Mehrsprachiger Magic-Link-Flow (i18n Strategie B) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein nicht-deutschsprachiger Geschädigter, der seinen token-only Magic-Link (`/flow/[token]`) öffnet, erlebt den Schaden-Wizard, die Signatur und die Upload-Seiten in seiner Sprache — als echte Übersetzung statt Google-Translate-Banner.

**Architecture:** Die Server-Component `flow/[token]/page.tsx` löst die Empfänger-Sprache (`flow_links.sprache > lead.sprache`) auf eine der 6 next-intl-Locales auf und wrappt den Flow-Subtree in einen **scoped** `NextIntlClientProvider`, der die globale (cookie-basierte) Locale nur für diesen Teilbaum überschreibt. Die bereits in allen 6 Locales übersetzten — aber bisher ungenutzten — `flow.*`-Keys werden im Wizard verdrahtet. Ein CI-Gate erzwingt Key-Vollständigkeit über alle Locales.

**Tech Stack:** Next.js 16.2.1 (App Router, Server Components, `output: 'standalone'`), React 19, next-intl v4.9.1 (cookie-Locale ohne URL-Präfix), vitest (`environment: 'node'`, pure-logic), Playwright (E2E gegen echten Token), `scripts/i18n/translate.mjs` (Anthropic-Pipeline, Quelle = `de.json`).

---

## Kontext für den ausführenden Entwickler (lesen, bevor du startest)

Dieses Repo hat **harte, nicht verhandelbare Regeln** (`AGENTS.md`). Die für diesen Plan relevanten:

1. **Nie auf `main` oder `staging` pushen.** Jede Phase = ein eigener Branch + PR **gegen `staging`**. Du mergst **nicht** selbst — eine separate Merge-Watcher-Session merged grüne PRs. Du pushst den Branch und meldest die PR.
2. **Frontend-Umlaute Pflicht.** Alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß`. Hier unkritisch, weil wir bestehende (korrekt geumlautete) `flow.*`-Keys verdrahten — aber falls du neue Keys ergänzt: echte Umlaute.
3. **7-Punkte-Audit im Commit-Body.** Jeder Commit braucht unten einen `Audit:`-Block (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) + die Zeile `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
4. **Build braucht Heap-Bump:** immer `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Default-Heap OOMt in der TS-Check-Phase unter paralleler Session-Last). Reiner Typecheck: `npx tsc --noEmit`.
5. **Playwright lokal** startet automatisch `npm run dev` auf `:3000` (`reuseExistingServer`). Bei paralleler Session-Last eigenen Port wählen + `CI=1` (schaltet den webServer ab) + `PLAYWRIGHT_BASE_URL` setzen. Kein jsdom im Repo — UI wird über Playwright (gegen echten Token) gesmoket, Logik über vitest.

**Zentrale Erkenntnis aus dem Audit (`docs/26.05.2026/i18n-audit.md`):** Der Namespace `flow.*` existiert bereits in `de.json` **und ist in allen 6 Locales fertig übersetzt** (`tr.flow.step0.heading` = "Ne oldu?", `tr.flow.common.weiter` = "İleri"), wird aber nirgends konsumiert. P2/P3 sind deshalb primär ein **Verdrahtungs-Job**, kein Übersetzungs-Job.

**Surface-Entscheid (Aaron, 26.05.2026):** Übersetzt wird `FlowWizardKfz.tsx`. Diese Komponente trägt einen `DEPRECATED`-Kommentar (Nachfolger = `/kunde/onboarding-details` / DynamicWizard), ist aber die **einzige Live-Oberfläche für token-only Magic-Link-Geschädigte** — der Nachfolger ist auth-gated (`if (!user) redirect('/login')`) und kann diese Nutzer nicht bedienen. Verifiziert: Datei ist auf `origin/staging` + `origin/main` present, nirgends gelöscht. **Nicht** die `DEPRECATED`-Notiz als Grund nehmen, die Arbeit zu verweigern — Aaron hat den Surface explizit gewählt.

---

## File Structure

**Neu:**
- `src/lib/i18n/resolve-flow-locale.ts` — reine Funktion `resolveFlowLocale(flowSprache, leadSprache): Locale`. Einzige Verantwortung: sprache-Code → Locale-Auflösung. Keine I/O.
- `src/lib/i18n/resolve-flow-locale.test.ts` — vitest für alle sprache-Werte.
- `scripts/i18n/seed-flow-token.mjs` — Dev-Hilfsskript: seedet eine `flow_links`-Zeile mit wählbarer `sprache` für den P1/P2-Smoke. Kein Produktionscode.
- `scripts/i18n/check-complete.mjs` — CI-Gate: verifiziert identische Key-Sets über alle 6 Locales.

**Modifiziert:**
- `src/app/flow/[token]/page.tsx` — Locale auflösen, Messages laden, `NextIntlClientProvider` + `dir` um den Wizard, Banner-Gating (P1).
- `src/app/flow/[token]/FlowWizardKfz.tsx` — `useTranslations('flow.*')` verdrahten (P2).
- `src/app/flow/signatur/[token]/SignaturPage.tsx` (+ `page.tsx`) — Signatur-Strings i18n (P3).
- `src/app/upload/zb1/[token]/Zb1UploadClient.tsx` (+ `page.tsx`) — ZB1-Upload-Strings i18n (P3).
- `src/app/upload/dokumente/[token]/MultiSlotUploadClient.tsx` (+ `page.tsx`) — Dokumente-Upload-Strings i18n (P3).
- `src/i18n/messages/de.json` — fehlende `flow.*`/`flow.upload.*`-Keys ergänzen, wo der Wizard mehr Strings hat als die bestehenden Keys abdecken (P2/P3).
- `scripts/i18n/glossary.md` — Flow-/Rechtsbegriffe ergänzen, damit die Pipeline neue Keys konsistent übersetzt (P2).
- `package.json` — `check:i18n`-Script (P4).
- `.github/workflows/ci.yml` — `check:i18n`-Step (P4).

**Out-of-Scope (YAGNI, siehe Spec §10):** Kunde-Portal, Marketing/SEO, per-Sprach-URLs/hreflang, interne Portale, Emails, PDFs, der auth-gated Nachfolger DynamicWizard. `sprache='other'` bekommt KEINE 7. Sprache — bleibt Google-Translate-Banner.

---

# Phase P1 — Infra (eigener Branch + PR gegen staging)

**Branch:** `kitta/i18n-flow-p1-infra`
**Ziel:** Locale-Auflösung + scoped Provider + RTL + Banner-Gating. Der Wizard zeigt danach noch deutsche Strings (P2 verdrahtet sie) — aber die Locale-Hülle steht und ist verifizierbar.

### Task 1: `resolveFlowLocale` (reine Funktion, TDD)

**Files:**
- Create: `src/lib/i18n/resolve-flow-locale.ts`
- Test: `src/lib/i18n/resolve-flow-locale.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/lib/i18n/resolve-flow-locale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveFlowLocale } from './resolve-flow-locale'

describe('resolveFlowLocale', () => {
  it('nimmt flow_links.sprache wenn es eine bekannte Locale ist', () => {
    expect(resolveFlowLocale('tr', null)).toBe('tr')
    expect(resolveFlowLocale('ar', 'de')).toBe('ar')
    expect(resolveFlowLocale('en', 'tr')).toBe('en')
  })

  it('fällt auf lead.sprache zurück wenn flow-sprache fehlt/unbekannt', () => {
    expect(resolveFlowLocale(null, 'ru')).toBe('ru')
    expect(resolveFlowLocale('other', 'pl')).toBe('pl')
    expect(resolveFlowLocale(undefined, 'ar')).toBe('ar')
  })

  it('liefert de für other/null/unbekannte Codes auf beiden Ebenen', () => {
    expect(resolveFlowLocale('other', 'other')).toBe('de')
    expect(resolveFlowLocale(null, null)).toBe('de')
    expect(resolveFlowLocale('xyz', undefined)).toBe('de')
    expect(resolveFlowLocale(undefined, undefined)).toBe('de')
  })

  it('akzeptiert de explizit', () => {
    expect(resolveFlowLocale('de', null)).toBe('de')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `npx vitest run src/lib/i18n/resolve-flow-locale.test.ts`
Expected: FAIL — `Failed to resolve import "./resolve-flow-locale"` (Datei existiert noch nicht).

- [ ] **Step 3: Minimale Implementierung**

`src/lib/i18n/resolve-flow-locale.ts`:

```ts
// Strategie B (i18n Magic-Link-Flow): löst die Empfänger-Sprache des
// token-only Geschädigten auf eine unserer 6 next-intl-Locales auf.
// Priorität: flow_links.sprache > lead.sprache > 'de'. 'other'/null/
// unbekannte Codes -> 'de' (dort bleibt der Google-Translate-Banner).
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

export function resolveFlowLocale(
  flowSprache: string | null | undefined,
  leadSprache: string | null | undefined,
): Locale {
  if (isLocale(flowSprache)) return flowSprache
  if (isLocale(leadSprache)) return leadSprache
  return DEFAULT_LOCALE
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg verifizieren**

Run: `npx vitest run src/lib/i18n/resolve-flow-locale.test.ts`
Expected: PASS (4 Tests grün). `isLocale('de')` ist `true` (de ∈ LOCALES), daher liefert der explizite-de-Test korrekt `'de'`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/resolve-flow-locale.ts src/lib/i18n/resolve-flow-locale.test.ts
git commit -m "$(cat <<'EOF'
feat(i18n): resolveFlowLocale — sprache-Code -> Flow-Locale (Strategie B P1)

Reine Funktion: flow_links.sprache > lead.sprache > 'de'. other/null/
unbekannt -> de. Basis fuer den scoped NextIntlClientProvider im Flow.

Audit:
- Build: gruen (vitest 4/4)
- UI: n/a (reine Logik)
- Redundanz: nutzt isLocale/DEFAULT_LOCALE aus @/i18n/locales (keine Duplikation)
- Dead-Code: nichts entfernt
- Spec: Locale-Aufloesung exakt wie Design §3
- Inkonsistenz: Locale-Type aus locales.ts, kein Hardcoding
- Regression: neue Datei, kein Konsument geaendert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: Scoped Provider + RTL + Banner-Gating in `flow/[token]/page.tsx`

**Files:**
- Modify: `src/app/flow/[token]/page.tsx` (Imports oben; `sprache`-Block ~Z. 234-236; Return ~Z. 238-280)

Aktueller Return (Referenz, Z. 238-240 + 278-280):
```tsx
return (
  <div style={brandStyle}>
    <SprachBanner sprache={sprache as Parameters<typeof SprachBanner>[0]['sprache']} />
    <FlowWizardKfz
      token={token}
      ...
      legalDocs={getAllLegalDocs()}
    />
  </div>
)
```

- [ ] **Step 1: Imports ergänzen**

In `src/app/flow/[token]/page.tsx`, nach den bestehenden Imports (nach Z. 9, `import { generateCssVars }`) einfügen:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { resolveFlowLocale } from '@/lib/i18n/resolve-flow-locale'
```

- [ ] **Step 2: Locale + Messages auflösen**

Den bestehenden `sprache`-Block (Z. 234-236) so erweitern — **direkt darunter** ergänzen:

```tsx
  // AAR-316: Sprach-Priorität flow_links.sprache > lead.sprache > 'de'
  const sprache =
    (flowLink?.sprache as string | null) ?? (lead.sprache as string | null) ?? 'de'

  // i18n Strategie B (P1): Empfänger-Locale für den scoped Provider auflösen
  // + die zugehörigen Messages laden. Überschreibt die globale Cookie-Locale
  // nur für den Flow-Subtree.
  const flowLocale = resolveFlowLocale(
    flowLink?.sprache as string | null,
    lead.sprache as string | null,
  )
  const flowMessages = await getMessages({ locale: flowLocale })
```

- [ ] **Step 3: Return umbauen — Provider, RTL, Banner-Gating**

Den Return (Z. 238-280) ersetzen durch:

```tsx
  return (
    <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Banner nur noch als Rest-Fallback: wenn KEINE echte Übersetzung greift
          (flowLocale='de') der Empfänger aber nicht-deutsch ist ('other'/unbekannt). */}
      <SprachBanner
        sprache={
          flowLocale === 'de' && sprache !== 'de'
            ? (sprache as Parameters<typeof SprachBanner>[0]['sprache'])
            : null
        }
      />
      <NextIntlClientProvider
        locale={flowLocale}
        messages={flowMessages}
        timeZone="Europe/Berlin"
      >
        <FlowWizardKfz
          token={token}
          flowLinkId={flowLinkId}
          gutachter={gutachter}
          lead={{
            id: lead.id,
            vorname: lead.vorname ?? '',
            nachname: lead.nachname ?? '',
            email: lead.email ?? '',
            telefon: lead.telefon ?? '',
            schadens_fall_typ: lead.schadens_fall_typ ?? 'sf-01',
            schadentyp: lead.schadentyp ?? null,
            schadentyp_freitext: lead.schadentyp_freitext ?? null,
            kunden_konstellation: lead.kunden_konstellation ?? 'kk-01',
            personenschaden_flag: lead.personenschaden_flag ?? false,
            mietwagen_flag: lead.mietwagen_flag ?? false,
            polizeibericht_pflicht: lead.polizeibericht_pflicht ?? false,
            polizei_vor_ort: lead.polizei_vor_ort ?? false,
            gutachter_termin: lead.gutachter_termin ?? null,
            kennzeichen: lead.kennzeichen ?? '',
            fahrzeug_hersteller: lead.fahrzeug_hersteller ?? '',
            fahrzeug_modell: lead.fahrzeug_modell ?? '',
            fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? '',
            fahrzeug_standort_plz: lead.fahrzeug_standort_plz ?? '',
            gegner_name: lead.gegner_name ?? '',
            gegner_versicherung: lead.gegner_versicherung ?? '',
            unfallhergang: lead.unfallhergang ?? '',
            fahrzeug_fahrbereit: lead.fahrzeug_fahrbereit ?? null,
            unfall_konstellation: lead.unfall_konstellation ?? null,
            gegner_anzahl_beteiligte: lead.gegner_anzahl_beteiligte ?? null,
            gegner_fahrzeugtyp: lead.gegner_fahrzeugtyp ?? null,
            service_typ: lead.service_typ ?? null,
          }}
          legalDocs={getAllLegalDocs()}
        />
      </NextIntlClientProvider>
    </div>
  )
}
```

> **Hinweis:** Das `lead={{…}}`-Objekt ist unverändert aus dem Original übernommen (nur eingerückt). Wenn das Original zwischen Z. 245-276 abweicht, **das Original 1:1 übernehmen** — nur das Wrapping (`<NextIntlClientProvider>` + `dir`) ist neu.

- [ ] **Step 4: Typecheck + Build**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in `page.tsx`.

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: Build kompiliert grün (Page-Generation-Flakes bei `/gutachter-partner` o.ä. sind Env-bedingt, nicht durch diese Änderung — Compile selbst muss grün sein).

- [ ] **Step 5: Commit**

```bash
git add "src/app/flow/[token]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): scoped NextIntlClientProvider + RTL um den Flow-Wizard (P1)

flow/[token]/page.tsx loest die Empfaenger-Locale (resolveFlowLocale) auf,
laedt deren Messages und wrappt FlowWizardKfz in einen scoped Provider, der
die globale Cookie-Locale nur fuer den Subtree ueberschreibt. dir=rtl fuer
Arabisch. SprachBanner nur noch Rest-Fallback (flowLocale=de & sprache!=de).

Audit:
- Build: gruen (tsc + next build)
- UI: kein neuer Einstiegspunkt; Flow-Huelle jetzt locale-aware
- Redundanz: getMessages/NextIntlClientProvider wie globaler Provider in layout.tsx
- Dead-Code: nichts; SprachBanner bleibt (Fallback fuer 'other')
- Spec: Provider + RTL + Banner-Gating exakt wie Design §3
- Inkonsistenz: Locale aus resolveFlowLocale, kein Hardcoding
- Regression: deutscher Flow unveraendert (flowLocale=de -> de-Messages); Branding-Wrapper-style erhalten

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: Dev-Seed-Skript + empirischer Nested-Provider-Smoke

**Files:**
- Create: `scripts/i18n/seed-flow-token.mjs`

Dieser Schritt ist der **empirische Beweis** (Spec §8), dass der innere Provider die globale Locale wirklich überschreibt und RTL greift — über einen echten Token (kein jsdom).

- [ ] **Step 1: Seed-Skript schreiben**

`scripts/i18n/seed-flow-token.mjs`:

```js
#!/usr/bin/env node
// Dev-Hilfe (kein Prod-Code): seedet eine flow_links-Zeile mit wählbarer
// sprache, um den i18n-Flow ueber einen echten Token zu smoken.
//   node --env-file=.env.local scripts/i18n/seed-flow-token.mjs ar
// Gibt den Token aus. Cleanup-Hinweis am Ende.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const sprache = process.argv[2] || 'ar'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local'); process.exit(1) }

const db = createClient(url, key, { auth: { persistSession: false } })

// Neuesten Lead nehmen (page.tsx liest alle Felder guarded, ein Minimal-Lead reicht)
const { data: lead, error: leErr } = await db
  .from('leads').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
if (leErr || !lead) { console.error('Kein Lead gefunden — bitte zuerst einen Lead anlegen.', leErr?.message); process.exit(1) }

const token = `i18n-smoke-${sprache}-${randomUUID().slice(0, 8)}`
const expires = new Date(Date.now() + 7 * 864e5).toISOString()
const { error: insErr } = await db
  .from('flow_links')
  .insert({ token, lead_id: lead.id, sprache, expires_at: expires })
if (insErr) { console.error('Insert fehlgeschlagen:', insErr.message); process.exit(1) }

console.log(`\nToken: ${token}`)
console.log(`URL:   /flow/${token}  (sprache=${sprache}, lead=${lead.id})`)
console.log(`Cleanup: delete from flow_links where token = '${token}';\n`)
```

> Falls `flow_links` eine NOT-NULL-`status`-Spalte ohne Default hat und der Insert daran scheitert: den Insert um `status: 'versendet'` (oder den im Schema gültigen Default-Enum-Wert) ergänzen. `status` wird in `page.tsx` nur informativ gelesen, der Wert ist für den Smoke egal.

- [ ] **Step 2: Token seeden**

Run: `node --env-file=.env.local scripts/i18n/seed-flow-token.mjs ar`
Expected: Ausgabe mit `Token: i18n-smoke-ar-xxxxxxxx` + URL.

- [ ] **Step 3: Dev-Server + Smoke**

Dev-Server starten (eigener Port wegen paralleler Sessions):

Run: `PORT=3050 npm run dev` (im Hintergrund), dann im Browser/Screenshot `http://localhost:3050/flow/<token>` öffnen.

**Verifizieren (Screenshot im selben Schritt auswerten):**
- Seite rendert HTTP 200 (kein Crash).
- Der äußere Flow-Container hat `dir="rtl"` (DevTools/Markup) — beweist, dass `flowLocale='ar'` server-seitig aufgelöst wurde.
- Der Google-Translate-`SprachBanner` ist **nicht** sichtbar (weil `flowLocale='ar'`, nicht `'de'`).

> Der vollständige Übersetzungs-Beweis (türkische/arabische Wizard-Strings statt deutscher) folgt in P2 — in P1 ist der Wizard absichtlich noch deutsch; `dir=rtl` + ausgeblendeter Banner beweisen die Locale-Hülle.

- [ ] **Step 4: Cleanup**

Den geseedeten Token wieder entfernen (SQL aus der Skript-Ausgabe), Dev-Server stoppen.

- [ ] **Step 5: Commit + PR**

```bash
git add scripts/i18n/seed-flow-token.mjs
git commit -m "$(cat <<'EOF'
chore(i18n): seed-flow-token Dev-Skript fuer Flow-i18n-Smoke (P1)

Seedet eine flow_links-Zeile mit waehlbarer sprache, um den scoped Provider
ueber einen echten Token zu verifizieren (dir=rtl bei ar, Banner aus).

Audit:
- Build: n/a (Dev-Skript, kein App-Code)
- UI: n/a
- Redundanz: nutzt @supabase/supabase-js service-client wie andere scripts/*
- Dead-Code: nichts
- Spec: empirischer Nested-Provider-Check (Design §8)
- Inkonsistenz: n/a
- Regression: kein App-Code beruehrt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin kitta/i18n-flow-p1-infra
gh pr create --base staging --title "feat(i18n): Flow-Wizard P1 — scoped Provider + RTL + Locale-Aufloesung" --body "Strategie B P1 (Infra). resolveFlowLocale + scoped NextIntlClientProvider + dir=rtl + Banner-Gating. Wizard-Strings folgen in P2. Smoke: dir=rtl bei sprache=ar verifiziert, Banner aus. Plan: docs/superpowers/plans/2026-05-26-i18n-magic-link-flow.md"
```

Danach: **STOP** — auf staging-Merge der P1-PR durch die Merge-Watcher-Session warten, bevor P2 startet (P2 baut auf der gemergten Provider-Hülle auf). PR melden.

---

# Phase P2 — FlowWizardKfz verdrahten (eigener Branch + PR gegen staging)

**Branch:** `kitta/i18n-flow-p2-wizard` (off frisch gepulltem `staging` nach P1-Merge)
**Ziel:** Die hardcodierten deutschen Strings in `FlowWizardKfz.tsx` (819 Z.) durch `useTranslations('flow.*')` ersetzen — primär gegen die **bereits übersetzten** `flow.*`-Keys, fehlende Keys in `de.json` ergänzen + via Pipeline übersetzen.

> **Methodik-Hinweis (warum dieser Block nicht pro-String-TDD ist):** Es gibt im Repo kein jsdom/Render-Test-Setup; UI wird über Playwright gegen echten Token gesmoket. Die String-Extraktion ist mechanisch und wird über **Build + check:i18n + Token-Smoke mit Screenshot** verifiziert, nicht über Unit-Tests pro String. Arbeite die Schritte als systematischen Sweep ab.

### Task 4: Key-Audit — Wizard-Strings gegen bestehende `flow.*`-Keys mappen

**Files:** nur lesen — `src/app/flow/[token]/FlowWizardKfz.tsx` + `src/i18n/messages/de.json` (`flow.*`)

- [ ] **Step 1: Bestehende `flow.*`-Keys auflisten**

Run:
```bash
node -e "const f=JSON.parse(require('fs').readFileSync('src/i18n/messages/de.json')).flow; console.log(JSON.stringify(f,null,2))" | head -200
```
Expected: vollständige Key-Struktur. Vorhanden sind (Stand Plan): `common` (weiter/zurueck/abbrechen/laden/speichern), `progress` (aria_label/step1-4), `step0` (heading/sub/cta_start/dauer_hint), `step1` (heading/sub/toggle_tippen/toggle_voice/dsgvo_label/fields/errors/hergang_options/schuldfrage_options/marken/voice), `step2a`, `step2b`, `step2c`, `step3`, `step4` (inkl. `errors`), `abort`.

- [ ] **Step 2: Alle deutschen UI-Strings im Wizard sammeln**

Run:
```bash
grep -nE ">[^<{]*[A-Za-zÄÖÜäöüß]{3,}[^<}]*<|'[^']*[äöüßÄÖÜ][^']*'|\"[A-ZÄÖÜ][a-zäöüß ]{4,}" "src/app/flow/[token]/FlowWizardKfz.tsx" | head -120
```
Sichte die Treffer und erstelle eine **Mapping-Tabelle** (im PR-Body oder einem Scratch-File `docs/26.05.2026/flow-i18n-key-map.md`): jede deutsche Zeichenkette → (a) existierender `flow.*`-Key (Reuse) oder (b) NEU anzulegender Key.

- [ ] **Step 3: Label-Maps berücksichtigen**

Die Konstanten-Maps oben in der Datei sind ebenfalls UI-sichtbar und brauchen i18n:
- `UNFALL_KONSTELLATION_LABELS` (Z. ~71-80) → mappt auf `flow.step1.hergang_options` (bereits vorhanden: auffahrunfall/vorfahrt/parken/spurwechsel/wildunfall/sonstiges) — **abgleichen**, ob die Keys deckungsgleich sind; fehlende (`tueroeffnung`, `glatteis`) in `de.json` unter `flow.step1.hergang_options` ergänzen.
- `GEGNER_FAHRZEUGTYP_LABELS` (Z. ~82-90) → neuer Key `flow.step2c.gegner_fahrzeugtyp_options` (pkw/lkw/transporter/motorrad/fahrrad/bus/sonstiges).

Ergebnis dieses Tasks: vollständige Mapping-Tabelle. Kein Code-Change.

### Task 5: Worked Example — `useTranslations` verdrahten (erste 3 Strings)

**Files:** Modify `src/app/flow/[token]/FlowWizardKfz.tsx`

Dies ist das Muster, das du dann auf alle Strings anwendest. **Reale Keys + Werte** (verifiziert vorhanden):
- `flow.common.weiter` = "Weiter" (tr: "İleri")
- `flow.step0.heading` = "Was ist passiert?" (tr: "Ne oldu?")
- `flow.step0.cta_start` = "Jetzt starten"

- [ ] **Step 1: Hook importieren + initialisieren**

Oben in `FlowWizardKfz.tsx` (bei den Imports, Z. ~12):
```tsx
import { useTranslations } from 'next-intl'
```
In der Komponenten-Funktion (nach den ersten `useState`-Hooks):
```tsx
const t = useTranslations('flow')
```

- [ ] **Step 2: Drei Strings ersetzen (Muster)**

Beispiel-Transformation — finde den jeweiligen deutschen Literal und ersetze:
```tsx
// vorher:  <button …>Weiter</button>
<button …>{t('common.weiter')}</button>

// vorher:  <h2 …>Was ist passiert?</h2>
<h2 …>{t('step0.heading')}</h2>

// vorher:  …>Jetzt starten</…>
…>{t('step0.cta_start')}</…>
```

- [ ] **Step 3: Build + Token-Smoke (tr)**

Run: `node --env-file=.env.local scripts/i18n/seed-flow-token.mjs tr` → Token.
Run: `npx tsc --noEmit` (grün), Dev-Server, `/flow/<tr-token>` öffnen.
Expected (Screenshot auswerten): Der erste Wizard-Schritt zeigt **"İleri"** statt "Weiter" und **"Ne oldu?"** statt "Was ist passiert?". → **Das ist der empirische Beweis, dass der scoped Provider die Locale überschreibt** (Spec §8). Cleanup-Token entfernen.

- [ ] **Step 4: Commit (Zwischenstand)**

```bash
git add "src/app/flow/[token]/FlowWizardKfz.tsx"
git commit -m "feat(i18n): FlowWizardKfz Schritt-0-Strings auf flow.*-Keys (P2 Muster)

Audit: Build gruen (tsc) / UI: tr-Token zeigt Ne oldu?/Ileri / Redundanz: bestehende flow.*-Keys reused / Dead-Code: - / Spec: Reuse §4 / Inkonsistenz: - / Regression: de-Token unveraendert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6: Vollständiger String-Sweep über alle Wizard-Schritte

**Files:** Modify `src/app/flow/[token]/FlowWizardKfz.tsx`; Modify `src/i18n/messages/de.json` (fehlende Keys)

- [ ] **Step 1: Schritt für Schritt ersetzen**

Arbeite die Mapping-Tabelle aus Task 4 ab — pro Wizard-Schritt (step0 → step1 → step2a/b/c → step3 → step4 → abort):
- Existierender Key → `{t('stepX.key')}` einsetzen.
- Fehlender Key → in `src/i18n/messages/de.json` unter dem passenden `flow.stepX`-Knoten **mit deutschem Wert** ergänzen, dann `{t('stepX.key')}` einsetzen.
- Label-Maps (`UNFALL_KONSTELLATION_LABELS`, `GEGNER_FAHRZEUGTYP_LABELS`) durch `t('step1.hergang_options.<code>')` bzw. `t('step2c.gegner_fahrzeugtyp_options.<code>')` ersetzen — die Map-Konstante entfernen, wenn sie danach keinen Consumer mehr hat (Dead-Code-Check).
- Fehler-Strings (Validierung) → `flow.step4.errors.*` / `flow.step1.errors.*` (vorhanden).
- Dynamische Strings mit Werten → next-intl-Interpolation: Key `"x_von_y": "{done} von {total} Schritten"`, Aufruf `t('progress.x_von_y', { done, total })`.

> **Umlaut-Pflicht:** Neue `de.json`-Werte mit echten `ä/ö/ü/ß`.

- [ ] **Step 2: Keine deutschen Literale übrig (Kontrolle)**

Run:
```bash
grep -nE ">[A-ZÄÖÜ][a-zäöüß]{3,}|'[A-ZÄÖÜ][a-zäöüß ]{4,}'" "src/app/flow/[token]/FlowWizardKfz.tsx"
```
Expected: nur noch nicht-UI-Treffer (Kommentare, `console`-Strings, Variablennamen, Enum-Codes). Jeder UI-sichtbare deutsche Literal-Treffer ist ein TODO.

- [ ] **Step 3: `de.json` valide?**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/messages/de.json')); console.log('de.json valid')"`
Expected: `de.json valid`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/flow/[token]/FlowWizardKfz.tsx" src/i18n/messages/de.json
git commit -m "feat(i18n): FlowWizardKfz vollstaendig auf flow.*-Keys (P2 Sweep)

Alle UI-Strings via useTranslations; fehlende Keys in de.json ergaenzt;
Label-Maps -> options-Keys; tote Map-Konstanten entfernt.

Audit: Build gruen (tsc) / UI: alle Schritte locale-aware / Redundanz: flow.*-Reuse maximiert / Dead-Code: ungenutzte Label-Maps entfernt / Spec: §4 Reuse+Ergaenzung / Inkonsistenz: Umlaute echt, Keys konsistent / Regression: de-Token zeigt identische Texte

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7: Glossar ergänzen + Pipeline für neue Keys laufen lassen

**Files:** Modify `scripts/i18n/glossary.md`; Modify `src/i18n/messages/{en,tr,ar,ru,pl}.json` (generiert)

- [ ] **Step 1: Glossar um Flow-/Rechtsbegriffe ergänzen**

In `scripts/i18n/glossary.md` Begriffe ergänzen, die in den neuen Keys vorkommen und konsistent übersetzt werden müssen, z. B.: „Sicherungsabtretung", „Vollmacht", „Wertminderung", „Fahrzeugschein (ZB1)", „Kennzeichen", „Schadennummer", „Unfallhergang". Pro Begriff die gewünschte Übersetzung je Zielsprache (Format wie bereits im File).

- [ ] **Step 2: Übersetzung der neuen/fehlenden Keys generieren**

Run: `npm run i18n:translate`
Expected: Pipeline übersetzt **nur** die in Task 6 ergänzten (in en/tr/ar/ru/pl noch fehlenden bzw. DE-Fallback-) Keys. Ausgabe listet die behandelten Pfade. (Vorhandene `flow.*`-Keys sind bereits übersetzt → werden übersprungen.)

- [ ] **Step 3: Stichprobe**

Run:
```bash
node -e "const tr=JSON.parse(require('fs').readFileSync('src/i18n/messages/tr.json')).flow; console.log(JSON.stringify(tr.step2c?.gegner_fahrzeugtyp_options ?? 'FEHLT'))"
```
Expected: türkische Übersetzungen der neuen Optionen (kein `FEHLT`, keine deutschen Fallbacks).

- [ ] **Step 4: Commit**

```bash
git add scripts/i18n/glossary.md src/i18n/messages/en.json src/i18n/messages/tr.json src/i18n/messages/ar.json src/i18n/messages/ru.json src/i18n/messages/pl.json
git commit -m "feat(i18n): neue Flow-Keys uebersetzt (en/tr/ar/ru/pl) + Glossar ergaenzt (P2)

Audit: Build n/a (nur messages+glossary) / UI: n/a / Redundanz: Pipeline reuse / Dead-Code: - / Spec: §4 Pipeline / Inkonsistenz: Glossar erzwingt Begriffs-Konsistenz / Regression: bestehende Keys unveraendert (nur fehlende ergaenzt)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 8: Build + Multi-Locale-Smoke + PR

- [ ] **Step 1: Voller Build**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: grün (Compile).

- [ ] **Step 2: Smoke je Locale (Screenshots)**

Für `tr`, `ar`, `de` je einen Token seeden (`scripts/i18n/seed-flow-token.mjs <locale>`), `/flow/<token>` durchklicken, Screenshot pro Schritt auswerten:
- `tr`: türkische Strings, LTR.
- `ar`: arabische Strings, **RTL-Layout** (Container `dir="rtl"`, Spiegelung plausibel).
- `de`: unverändert deutsch, kein Banner.
Tokens danach cleanup-en.

- [ ] **Step 3: Commit (falls Smoke-Fixes) + PR**

```bash
git push -u origin kitta/i18n-flow-p2-wizard
gh pr create --base staging --title "feat(i18n): Flow-Wizard P2 — FlowWizardKfz mehrsprachig" --body "Strategie B P2. FlowWizardKfz auf flow.*-Keys verdrahtet (Reuse der bereits uebersetzten Keys + ergaenzte Keys via Pipeline). Smoke tr/ar/de mit Screenshots. Plan: docs/superpowers/plans/2026-05-26-i18n-magic-link-flow.md"
```
PR melden, auf staging-Merge warten, dann P3.

---

# Phase P3 — Signatur + Upload-Seiten (eigener Branch + PR gegen staging)

**Branch:** `kitta/i18n-flow-p3-signatur-uploads` (off frisch gepulltem `staging`)
**Ziel:** `SignaturPage`, `Zb1UploadClient`, `MultiSlotUploadClient` analog zu P2 übersetzen. Neuer Namespace **`upload.*`** (Entscheid: eigener Top-Level-Namespace, nicht `flow.upload.*` — die Upload-Seiten sind eigene Routen außerhalb des Wizard-Flows, ein flacher `upload.*`-Namespace ist klarer und vermeidet Tiefenschachtelung).

### Task 9: Server-Strings in den page.tsx über `getTranslations`

**Files:** Modify `src/app/flow/signatur/[token]/page.tsx`, `src/app/upload/zb1/[token]/page.tsx`, `src/app/upload/dokumente/[token]/page.tsx`

- [ ] **Step 1: Provider + Locale in jeder page.tsx**

Jede dieser Server-Components rendert ihre Client-Komponente. Übernimm das P1-Muster: `resolveFlowLocale` aus dem Token-Lookup (alle drei Routen laden bereits einen Token/Lead — `sprache` mitselektieren falls noch nicht), `getMessages({ locale })`, `<NextIntlClientProvider locale messages timeZone="Europe/Berlin">` um die Client-Komponente, `dir={locale==='ar'?'rtl':'ltr'}` am Wrapper.

> Prüfe pro Route, ob der Token-Lookup `sprache` schon lädt; falls nicht, das `select(...)` um `'sprache'` erweitern (analog `flow/[token]/page.tsx` Z. 29).

- [ ] **Step 2: Server-sichtbare Strings (falls vorhanden) via `getTranslations`**

```tsx
import { getTranslations } from 'next-intl/server'
const t = await getTranslations({ locale, namespace: 'upload' })
```
und Server-gerenderte Überschriften/Fehlertexte in der page.tsx auf `t('…')` umstellen.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add "src/app/flow/signatur/[token]/page.tsx" "src/app/upload/zb1/[token]/page.tsx" "src/app/upload/dokumente/[token]/page.tsx"
git commit -m "feat(i18n): scoped Provider um Signatur- + Upload-Seiten (P3)

Audit: Build gruen (tsc) / UI: Routen locale-aware / Redundanz: P1-Provider-Muster wiederverwendet / Dead-Code: - / Spec: §3 auf P3-Surface / Inkonsistenz: dir/timeZone wie P1 / Regression: de unveraendert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10: Client-Strings in den drei Upload-/Signatur-Komponenten

**Files:** Modify `src/app/flow/signatur/[token]/SignaturPage.tsx`, `src/app/upload/zb1/[token]/Zb1UploadClient.tsx`, `src/app/upload/dokumente/[token]/MultiSlotUploadClient.tsx`; Modify `src/i18n/messages/de.json` (`upload.*`)

- [ ] **Step 1: Strings sammeln + Keys anlegen**

Pro Komponente die deutschen UI-Strings sammeln (gleicher grep wie Task 4) und unter `upload.*` in `de.json` mit deutschen Werten anlegen — sinnvoll gruppiert, z. B. `upload.signatur.*`, `upload.zb1.*`, `upload.dokumente.*`.

- [ ] **Step 2: `useTranslations('upload')` verdrahten**

In jeder Client-Komponente `import { useTranslations } from 'next-intl'` + `const t = useTranslations('upload')`, deutsche Literale durch `{t('signatur.…')}` etc. ersetzen.

- [ ] **Step 3: de.json valide + keine Literale übrig**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/messages/de.json')); console.log('valid')"`
Run: `grep -nE ">[A-ZÄÖÜ][a-zäöüß]{3,}" "src/app/flow/signatur/[token]/SignaturPage.tsx" "src/app/upload/zb1/[token]/Zb1UploadClient.tsx" "src/app/upload/dokumente/[token]/MultiSlotUploadClient.tsx"`
Expected: `valid`; grep zeigt nur Nicht-UI-Treffer.

- [ ] **Step 4: Commit**

```bash
git add "src/app/flow/signatur/[token]/SignaturPage.tsx" "src/app/upload/zb1/[token]/Zb1UploadClient.tsx" "src/app/upload/dokumente/[token]/MultiSlotUploadClient.tsx" src/i18n/messages/de.json
git commit -m "feat(i18n): Signatur-/Upload-Client-Strings auf upload.*-Keys (P3)

Audit: Build gruen (tsc) / UI: Komponenten locale-aware / Redundanz: useTranslations-Muster wie P2 / Dead-Code: - / Spec: §4 upload-Namespace / Inkonsistenz: Umlaute echt / Regression: de unveraendert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 11: `upload.*` übersetzen

**Files:** Modify `src/i18n/messages/{en,tr,ar,ru,pl}.json`

- [ ] **Step 1: Pipeline auf den neuen Namespace**

Run: `npm run i18n:translate -- --section=upload`
Expected: nur `upload.*` wird in den 5 Zielsprachen erzeugt.

- [ ] **Step 2: Stichprobe**

Run: `node -e "const ar=JSON.parse(require('fs').readFileSync('src/i18n/messages/ar.json')); console.log(ar.upload ? 'upload.* vorhanden' : 'FEHLT')"`
Expected: `upload.* vorhanden`.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/tr.json src/i18n/messages/ar.json src/i18n/messages/ru.json src/i18n/messages/pl.json
git commit -m "feat(i18n): upload.*-Namespace uebersetzt (en/tr/ar/ru/pl) (P3)

Audit: Build n/a / UI: n/a / Redundanz: Pipeline / Dead-Code: - / Spec: §4 / Inkonsistenz: Glossar / Regression: andere Keys unveraendert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 12: Build + Smoke + PR

- [ ] **Step 1: Build**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: grün.

- [ ] **Step 2: Smoke**

Für `ar` + `tr` je einen Token seeden, die Signatur- und beide Upload-Routen mit `/flow/signatur/<token>` bzw. `/upload/zb1/<token>` / `/upload/dokumente/<token>` öffnen (Token muss zu den jeweiligen Routen passen — ggf. pro Route eigener Seed), Screenshots auswerten: übersetzte Strings + RTL bei `ar`. Cleanup.

- [ ] **Step 3: PR**

```bash
git push -u origin kitta/i18n-flow-p3-signatur-uploads
gh pr create --base staging --title "feat(i18n): Flow P3 — Signatur + Upload-Seiten mehrsprachig" --body "Strategie B P3. SignaturPage + Zb1UploadClient + MultiSlotUploadClient auf upload.*-Keys, scoped Provider + RTL. Smoke ar/tr. Plan: docs/superpowers/plans/2026-05-26-i18n-magic-link-flow.md"
```
PR melden, auf Merge warten, dann P4.

---

# Phase P4 — CI-Key-Completeness-Gate + Abschluss (eigener Branch + PR gegen staging)

**Branch:** `kitta/i18n-flow-p4-ci-gate` (off frisch gepulltem `staging`)
**Ziel:** Ein CI-Gate, das verhindert, dass künftig Locales mit fehlenden/überzähligen Keys live gehen. Plus Abschluss-Verifikation.

### Task 13: `check-complete.mjs` (TDD über erzwungenen Fehlerfall)

**Files:** Create `scripts/i18n/check-complete.mjs`

- [ ] **Step 1: Script schreiben**

`scripts/i18n/check-complete.mjs`:

```js
#!/usr/bin/env node
// CI-Gate: verifiziert, dass alle Locales identische (rekursive) Key-Sets zur
// Quelle de.json haben. Bricht mit Exit 1 ab, wenn eine Locale Keys fehlen oder
// ueberzaehlige Keys hat. Verhindert untersetzte i18n-Keys im Live-Betrieb.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.resolve(__dirname, '../../src/i18n/messages')
const SOURCE = 'de'
const TARGETS = ['en', 'tr', 'ar', 'ru', 'pl']

function flatKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatKeys(v, full))
    else keys.push(full)
  }
  return keys
}

const load = (loc) => JSON.parse(fs.readFileSync(path.join(DIR, `${loc}.json`), 'utf8'))
const sourceKeys = new Set(flatKeys(load(SOURCE)))
let failed = false

for (const loc of TARGETS) {
  const locKeys = new Set(flatKeys(load(loc)))
  const missing = [...sourceKeys].filter((k) => !locKeys.has(k))
  const extra = [...locKeys].filter((k) => !sourceKeys.has(k))
  if (missing.length || extra.length) {
    failed = true
    console.error(`[i18n] ${loc}: ${missing.length} fehlend, ${extra.length} ueberzaehlig`)
    if (missing.length) console.error(`  fehlend: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`)
    if (extra.length) console.error(`  extra:   ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ' …' : ''}`)
  } else {
    console.log(`[i18n] ${loc}: OK (${locKeys.size} Keys)`)
  }
}

if (failed) { console.error('[i18n] Key-Completeness FEHLGESCHLAGEN'); process.exit(1) }
console.log('[i18n] Alle Locales vollstaendig.')
```

- [ ] **Step 2: Erfolgsfall verifizieren**

Run: `node scripts/i18n/check-complete.mjs`
Expected: `[i18n] en: OK …` für alle 5 + `Alle Locales vollstaendig.`, Exit 0. (Nach P2/P3 sind alle Keys übersetzt.)

- [ ] **Step 3: Fehlerfall erzwingen (TDD-Beweis)**

Temporär einen Key aus `tr.json` entfernen:
```bash
node -e "const f='src/i18n/messages/tr.json';const j=JSON.parse(require('fs').readFileSync(f));delete j.flow.common.weiter;require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
node scripts/i18n/check-complete.mjs; echo "Exit: $?"
```
Expected: `[i18n] tr: 1 fehlend …` + `Exit: 1`.

- [ ] **Step 4: Key wiederherstellen**

```bash
git checkout -- src/i18n/messages/tr.json
node scripts/i18n/check-complete.mjs; echo "Exit: $?"
```
Expected: `Alle Locales vollstaendig.` + `Exit: 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/i18n/check-complete.mjs
git commit -m "feat(i18n): check-complete.mjs — Key-Completeness-Gate (P4)

Verifiziert identische Key-Sets ueber alle 6 Locales. Exit 1 bei fehlenden/
ueberzaehligen Keys. TDD: erzwungener Fehlerfall liefert Exit 1, Restore Exit 0.

Audit: Build n/a (CI-Skript) / UI: n/a / Redundanz: eigenes Gate, kein Overlap mit check:token-audit / Dead-Code: - / Spec: §5 / Inkonsistenz: - / Regression: kein App-Code

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 14: `check:i18n`-Script in package.json

**Files:** Modify `package.json`

- [ ] **Step 1: Script ergänzen**

In `package.json` unter `scripts`, neben die anderen `check:*`-Einträge:
```json
"check:i18n": "node scripts/i18n/check-complete.mjs",
```

- [ ] **Step 2: Verifizieren**

Run: `npm run check:i18n`
Expected: `Alle Locales vollstaendig.`, Exit 0.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat(i18n): check:i18n npm-Script (P4)

Audit: Build n/a / UI: n/a / Redundanz: ruft check-complete.mjs / Dead-Code: - / Spec: §5 / Inkonsistenz: Namensschema wie check:token-audit / Regression: -

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 15: CI-Step in ci.yml

**Files:** Modify `.github/workflows/ci.yml` (nach dem `Tailwind-Arbitrary`-Step, Z. ~62, vor `RLS-Function-Grants` Z. ~69)

- [ ] **Step 1: Step einfügen**

Nach dem `Tailwind-Arbitrary`-Block in `ci.yml`:
```yaml
      # i18n-Drift-Bremse (Strategie B): erzwingt identische Key-Sets ueber alle
      # 6 Locales. Verhindert, dass untersetzte i18n-Keys live gehen. Siehe
      # scripts/i18n/check-complete.mjs.
      - name: i18n-Key-Completeness
        run: npm run check:i18n
```

- [ ] **Step 2: YAML-Syntax prüfen**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/check:i18n/.test(y)) throw new Error('step fehlt'); console.log('ci.yml enthaelt check:i18n step')"`
Expected: `ci.yml enthaelt check:i18n step`. (Einrückung: 6 Spaces für `- name:`, identisch zu den Nachbar-Steps.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(i18n): check:i18n als CI-Gate vor dem Build (P4)

Audit: Build n/a (CI-Config) / UI: n/a / Redundanz: reiht sich in check:*-Steps / Dead-Code: - / Spec: §5 / Inkonsistenz: Step-Stil wie Token-Audit / Regression: bestehende Steps unveraendert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 16: Abschluss — Build, Voll-Smoke, PR

- [ ] **Step 1: Voller Build + alle Checks**

Run:
```bash
npm run check:i18n
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```
Expected: check grün; Build kompiliert grün.

- [ ] **Step 2: Abschluss-Smoke (alle 6 sprache-Werte + other)**

Für `de, en, tr, ar, ru, pl` je einen Token seeden und `/flow/<token>` öffnen — Screenshot je Locale auswerten: korrekte Übersetzung, RTL nur bei `ar`. Zusätzlich `other`: Token mit `sprache=other` → Flow auf Deutsch + **Google-Translate-Banner sichtbar** (Fallback-Beweis). Alle Tokens cleanup-en.

- [ ] **Step 3: PR**

```bash
git push -u origin kitta/i18n-flow-p4-ci-gate
gh pr create --base staging --title "feat(i18n): Flow P4 — CI-Key-Completeness-Gate + Abschluss" --body "Strategie B P4. check:i18n (alle 6 Locales gleiche Key-Sets) als CI-Step. Abschluss-Smoke de/en/tr/ar/ru/pl + other-Fallback. Plan: docs/superpowers/plans/2026-05-26-i18n-magic-link-flow.md"
```
PR melden. Nach Merge: Strategie B abgeschlossen.

---

## Self-Review (vom Plan-Autor durchgeführt)

**Spec-Coverage:**
- Spec §3 (Locale-Auflösung) → Task 1. ✓
- Spec §3 (scoped Provider, kein Cookie/URL, RTL, Banner-Gating) → Task 2. ✓
- Spec §3/§8 (Nested-Provider empirisch verifizieren) → Task 3 (dir=rtl-Smoke) + Task 5 Step 3 (tr-Strings = Override-Beweis). ✓
- Spec §4 (flow.*-Reuse + Ergänzung, upload-Namespace-Entscheid) → Task 4-6 (Reuse), Task 9-10 (`upload.*` als eigener Top-Level-Namespace — offene Frage aus §9 entschieden). ✓
- Spec §4/§9 (Glossar-Erweiterung, Pipeline) → Task 7, Task 11. ✓
- Spec §5 (CI-Gate) → Task 13-15. ✓
- Spec §7 (Testing: vitest-Unit + Token-Smoke) → Task 1 (Unit), Task 3/5/8/12/16 (Token-Smoke + Screenshot). ✓
- Spec §6 (4 Phasen, je PR gegen staging) → P1-P4. ✓
- Spec §8 (Edge-Cases: other→de+Banner, fehlender Key→Gate, ar→RTL) → Task 2 (Banner-Gating + dir), Task 16 Step 2 (other-Smoke), Task 13 (Gate). ✓

**Offene §9-Details im Plan entschieden:** `upload.*` als eigener Top-Level-Namespace (Task 9 Begründung); Glossar-Erweiterung konkretisiert (Task 7); Reuse-Grad wird in Task 4 messbar gemacht.

**Type-Konsistenz:** `resolveFlowLocale(flowSprache, leadSprache): Locale` — gleiche Signatur in Task 1 (Def), Task 2 (page.tsx-Aufruf), Task 9 (Upload-pages-Aufruf). `Locale`/`isLocale`/`DEFAULT_LOCALE` durchgängig aus `@/i18n/locales`. Provider-Props (`locale`/`messages`/`timeZone`) identisch in Task 2 + Task 9.

**Placeholder-Scan:** Keine TBD/TODO als Arbeitsanweisung. P2/P3-Sweeps sind bewusst methodengetrieben (kein jsdom im Repo) mit realem Worked Example (Task 5, echte Keys+Werte) + konkreten Verifikations-Kommandos statt erfundenem Pro-String-Code — das ist die ehrliche Form für eine mechanische String-Extraktion über 819 Zeilen.

---

*Plan-Grundlage: Design-Spec `docs/superpowers/specs/2026-05-26-i18n-magic-link-flow-design.md` + i18n-Audit `docs/26.05.2026/i18n-audit.md`. writing-plans-Skill (Superpowers v5.1.0).*
