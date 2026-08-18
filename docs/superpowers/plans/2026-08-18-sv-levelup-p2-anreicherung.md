# SV-LevelUp P2 — Anreicherung der 62 Bestandsleads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus 62 Leads ohne jede Kontaktangabe werden anschreibbare Kontakte — Website gefunden, Impressum gelesen, E-Mail und Telefon eingetragen, jede Änderung rückdrehbar protokolliert.

**Architecture:** Sechs pure, unit-getestete Logikbausteine (Namenskern, Domain-Kandidaten, robots.txt, Impressum-Extraktion, E.164, Sicherheits-Score) und darüber eine dünne I/O-Schicht, die HTTP holt, drosselt und schreibt. Der Schreibpfad füllt **ausschließlich Leerstellen** und legt für jedes Feld eine Zeile in `levelup_anreicherung` ab, sodass ein kompletter Lauf über die `lauf_id` zurückgedreht werden kann.

**Tech Stack:** TypeScript · Vitest · `tsx` als Runner · Supabase Service-Role · keine externen Crawl-Libraries

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-18-sv-levelup-design.md`, Funktionen **F-15** und **F-16** in `_specs/sv-levelup/CONTRACT.md`.
- **R-G — robots.txt gilt.** Vor **jedem** Abruf einer Domain wird `/robots.txt` gelesen und befolgt. Gesperrt heißt „nicht geprüft", nicht „nicht vorhanden". Keine Captcha-Umgehung, keine Proxys.
- **Nur vier Pfade** je Domain: `/impressum`, `/kontakt`, `/imprint`, `/legal-notice`. **Kein Vollcrawl.** Höchstens **5 Kandidaten** je Lead.
- **Höflichkeit:** mindestens **2 Sekunden** zwischen zwei Abrufen derselben Domain, nie parallel gegen denselben Host, höchstens 8 Domains gleichzeitig, Timeout 10 s, maximal 3 Versuche mit Backoff.
- **R-B — nicht raten.** Kein Treffer ist ein gültiges Ergebnis: `null` plus Grund. **Niemals** eine E-Mail aus dem Domainnamen konstruieren.
- **Nur Leerstellen füllen.** Ein bereits gefülltes Feld wird nie überschrieben (T-24). Das gilt auch dann, wenn der gefundene Wert „besser" aussieht.
- **Suppression zuerst.** Steht eine gefundene Adresse in `cold_mail_suppression`, wird sie **gar nicht erst** in `sv_leads` geschrieben.
- **Jeder Write mit `.select()` und Row-Check.** `supabase-js` wirft nicht; ein RLS- oder Constraint-Fehlschlag ist ohne Prüfung unsichtbar (DSGVO-Storno-Lehre, Stille-Write-Gate).
- **Schreiben nur in `sv_leads` und `levelup_anreicherung`** (R-M). `partner_leads`, `leads`, `faelle`, `claims`, `gutachten` sind für den Anreicherer nicht erreichbar.
- **Branch:** `kitta/sv-levelup-spec` im Worktree `.claude/worktrees/sv-levelup-spec`. Absolute Pfade **immer mit** dem `worktrees`-Segment.
- **Repo-Recherche nur im Worktree.** Der Haupt-Checkout steht auf `aar-956` und ist weit hinter `main` — Greps dort finden Dateien nicht oder holen sie aus fremden Worktrees.

## Zwei Befunde, die diesen Plan formen

**1 · `upsertSvLead` ist hier nicht verwendbar.** Es gilt als „der einzige Schreibweg in `sv_leads`", aber die RPC `sv_lead_upsert` macht
`email = coalesce(nullif(excluded.email,''), sv_leads.email)` — ein **neuer Wert überschreibt den alten**. F-16 und T-24 verlangen das Gegenteil. Außerdem ist es ein Upsert ganzer Identitäten (mit `name`/`adresse`/`lat`/`lng` als Pflicht und Überschreiben von `adresse`/`ort`/`geo`), kein Feld-Update. Die Anreicherung bekommt daher einen **eigenen, eng gefassten Schreibpfad**: nur die fünf Anreicherungsfelder, nur wenn sie leer sind, immer mit Audit-Zeile.

**2 · `normalized_name` ist `GENERATED ALWAYS`** und nur `lower(regexp_replace(name,'\s+',' ','g'))` — keine Umlaut-Auflösung, keine Gattungswörter entfernt, nicht überschreibbar. Die aggressive Normalisierung aus `CONTEXT` §5 existiert in der DB **nicht**. Task 1 baut sie als **eigene** Funktion `kernName()` für die Domain-Kandidaten. Sie ist ausdrücklich **nicht** die DB-Spalte und wird nie dorthin geschrieben. (Die Folge für die Dublettenprüfung in F-06 gehört zu P4 und ist dort zu klären, nicht hier.)

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `sv-levelup/lib/anreicherung/kern-name.ts` | Firmenname → Kernbegriff (Gattungswörter weg, Umlaute auflösen) |
| `sv-levelup/lib/anreicherung/domain-kandidaten.ts` | Kernbegriff + Ort → höchstens 5 Domain-Kandidaten |
| `sv-levelup/lib/anreicherung/robots.ts` | robots.txt parsen, `istErlaubt(pfad)` |
| `sv-levelup/lib/anreicherung/impressum.ts` | HTML → E-Mail, Telefon, vertretungsberechtigte Person |
| `sv-levelup/lib/anreicherung/telefon-e164.ts` | deutsche Schreibweisen → E.164 |
| `sv-levelup/lib/anreicherung/sicherheit.ts` | Zuordnungs-Sicherheit 0–100 |
| `sv-levelup/lib/anreicherung/schreiben.ts` | Leerstellen füllen + Audit-Zeile + Suppression-Gate |
| `sv-levelup/lib/anreicherung/rueckwaerts.ts` | alle Änderungen einer `lauf_id` zurückdrehen |
| `sv-levelup/lib/anreicherung/lauf.ts` | Orchestrierung: holen, drosseln, entscheiden |
| `sv-levelup/scripts/anreicherung.ts` | CLI: `--dry-run`, `--limit`, `--lauf-id`, `--zurueck` |

---

### Task 1: Namenskern und Domain-Kandidaten

**Files:**
- Create: `sv-levelup/lib/anreicherung/kern-name.ts`, `domain-kandidaten.ts`
- Test: `sv-levelup/lib/anreicherung/__tests__/kandidaten.test.ts`

**Interfaces:**
- Produces: `kernName(firma: string): string`, `domainKandidaten(firma: string, ort: string | null): string[]`

- [ ] **Step 1: Den Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { kernName } from '../kern-name'
import { domainKandidaten } from '../domain-kandidaten'

describe('kernName', () => {
  it('entfernt Gattungswoerter und Rechtsform', () => {
    expect(kernName('Kfz-Sachverständigenbüro Musterwerk GmbH')).toBe('musterwerk')
    expect(kernName('SV-Büro Musterwerk')).toBe('musterwerk')
    expect(kernName('Ingenieurbüro Schmitz')).toBe('schmitz')
  })

  it('loest Umlaute auf', () => {
    expect(kernName('Gutachter Müller & Söhne')).toBe('mueller soehne')
  })

  it('behaelt mehrteilige Eigennamen', () => {
    expect(kernName('Kfz-Gutachter Meyer und Partner')).toBe('meyer partner')
  })

  it('gibt bei reinem Gattungsnamen einen leeren Kern zurueck', () => {
    // Nichts zu raten — der Aufrufer muss das als "kein Kandidat" behandeln (R-B)
    expect(kernName('Kfz-Sachverständigenbüro')).toBe('')
  })
})

describe('domainKandidaten', () => {
  it('liefert hoechstens 5 Kandidaten', () => {
    expect(domainKandidaten('Kfz-Sachverständigenbüro Musterwerk GmbH', 'Münster').length)
      .toBeLessThanOrEqual(5)
  })

  it('setzt die direkte Domain nach vorn', () => {
    expect(domainKandidaten('Sachverständigenbüro Musterwerk', 'Münster')[0]).toBe('musterwerk.de')
  })

  it('bildet Praefix- und Ort-Varianten', () => {
    const k = domainKandidaten('Sachverständigenbüro Musterwerk', 'Münster')
    expect(k).toContain('sv-musterwerk.de')
    expect(k).toContain('musterwerk-muenster.de')
  })

  it('gibt bei leerem Kern KEINE Kandidaten zurueck, statt zu raten', () => {
    expect(domainKandidaten('Kfz-Sachverständigenbüro', 'Münster')).toEqual([])
  })

  it('macht aus mehrteiligen Kernen eine zusammengezogene Domain', () => {
    expect(domainKandidaten('Gutachter Meyer und Partner', null)).toContain('meyerpartner.de')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

`cd sv-levelup && npx vitest run lib/anreicherung` → FAIL, „Cannot find module '../kern-name'".

- [ ] **Step 3: Implementieren**

```ts
// kern-name.ts
/**
 * Firmenname -> Kernbegriff fuer die Domain-Suche.
 *
 * ⚠ NICHT die DB-Spalte sv_leads.normalized_name. Die ist GENERATED ALWAYS und
 * macht nur lower() + Whitespace. Diese Funktion ist der aggressive zweite
 * Schritt, den CONTEXT §5 beschreibt — er lebt ausschliesslich hier und wird
 * NIE in die Datenbank geschrieben.
 */
const GATTUNG = [
  'kfz', 'kraftfahrzeug', 'sachverstaendigenbuero', 'sachverstaendiger', 'sachverstaendige',
  'gutachter', 'gutachterbuero', 'ingenieurbuero', 'ingenieur', 'sv', 'svbuero', 'buero',
  'gmbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'mbh', 'co', 'und', 'partner', 'partners',
]

// 'partner' steht bewusst NICHT in der Streichliste unten — siehe UNTEN.
const IMMER_STREICHEN = new Set(GATTUNG.filter((w) => w !== 'partner' && w !== 'und'))

export function umlauteAuf(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
}

export function kernName(firma: string): string {
  const worte = umlauteAuf(firma)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')   // & . , + ( ) usw. raus
    .split(/[\s-]+/)
    .filter((w) => w.length > 1)
    .filter((w) => w !== 'und')      // Bindewort
    .filter((w) => !IMMER_STREICHEN.has(w))

  return worte.join(' ').trim()
}
```

```ts
// domain-kandidaten.ts
import { kernName, umlauteAuf } from './kern-name'

/**
 * Hoechstens 5 Kandidaten (F-15). Reihenfolge = Wahrscheinlichkeit:
 * die direkte Domain zuerst, Praefix-Varianten danach, Ort-Variante zuletzt.
 *
 * Leerer Kern -> leere Liste. Wir raten NICHT (R-B): ein Lead, dessen Name nur
 * aus Gattungswoertern besteht, bekommt keine Kandidaten und faellt mit Grund
 * durch.
 */
export function domainKandidaten(firma: string, ort: string | null): string[] {
  const kern = kernName(firma)
  if (!kern) return []

  const teile = kern.split(' ')
  const zusammen = teile.join('')          // "meyer partner" -> "meyerpartner"
  const erstes = teile[0]
  const ortSlug = ort ? umlauteAuf(ort).toLowerCase().replace(/[^a-z0-9]/g, '') : null

  const kandidaten = [
    `${erstes}.de`,
    teile.length > 1 ? `${zusammen}.de` : null,
    `sv-${erstes}.de`,
    `kfz-gutachter-${erstes}.de`,
    ortSlug ? `${erstes}-${ortSlug}.de` : null,
  ].filter((d): d is string => d !== null)

  return [...new Set(kandidaten)].slice(0, 5)
}
```

- [ ] **Step 4: Test laufen lassen — muss durchlaufen**

`cd sv-levelup && npx vitest run lib/anreicherung` → PASS.

- [ ] **Step 5: Commit**

```bash
git add sv-levelup/lib/anreicherung/
git commit -m "feat(sv-levelup): Namenskern und Domain-Kandidaten

kernName() ist der aggressive Normalisierungsschritt aus CONTEXT §5 — er lebt
NUR hier. sv_leads.normalized_name ist GENERATED ALWAYS (nur lower + Whitespace)
und wird nie von hier geschrieben.

Leerer Kern -> keine Kandidaten. Ein Lead, dessen Name nur aus Gattungswoertern
besteht, faellt mit Grund durch, statt geraten zu werden (R-B)."
```

---

### Task 2: robots.txt

**Files:**
- Create: `sv-levelup/lib/anreicherung/robots.ts`
- Test: `sv-levelup/lib/anreicherung/__tests__/robots.test.ts`

**Interfaces:**
- Produces: `parseRobots(txt: string, agent?: string): RobotsRegeln`, `istErlaubt(regeln: RobotsRegeln, pfad: string): boolean`

**Warum selbst schreiben:** Wir prüfen genau vier bekannte Pfade gegen `User-agent`/`Disallow`/`Allow`. Ein Paket dafür wäre zusätzliche Angriffsfläche für dreißig Zeilen Logik.

- [ ] **Step 1: Den Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { istErlaubt, parseRobots } from '../robots'

const erlaubt = (txt: string, pfad: string) => istErlaubt(parseRobots(txt), pfad)

describe('robots.txt', () => {
  it('erlaubt alles, wenn die Datei leer ist', () => {
    expect(erlaubt('', '/impressum')).toBe(true)
  })

  it('befolgt ein globales Disallow', () => {
    expect(erlaubt('User-agent: *\nDisallow: /', '/impressum')).toBe(false)
  })

  it('befolgt ein Praefix-Disallow', () => {
    const txt = 'User-agent: *\nDisallow: /intern'
    expect(erlaubt(txt, '/intern/x')).toBe(false)
    expect(erlaubt(txt, '/impressum')).toBe(true)
  })

  it('laesst Allow ein Disallow ueberstimmen (laengere Regel gewinnt)', () => {
    const txt = 'User-agent: *\nDisallow: /\nAllow: /impressum'
    expect(erlaubt(txt, '/impressum')).toBe(true)
    expect(erlaubt(txt, '/kontakt')).toBe(false)
  })

  it('ignoriert Regeln fuer andere Agenten', () => {
    expect(erlaubt('User-agent: Googlebot\nDisallow: /', '/impressum')).toBe(true)
  })

  it('ignoriert Kommentare und leere Disallow-Zeilen', () => {
    expect(erlaubt('# nur ein Kommentar\nUser-agent: *\nDisallow:', '/impressum')).toBe(true)
  })

  it('behandelt einen Abruf-Fehlschlag als erlaubt, aber der Aufrufer entscheidet', () => {
    // parseRobots kennt kein HTTP — der Lauf behandelt 4xx als "keine Regeln",
    // 5xx als "unklar, nicht abrufen". Das steht in lauf.ts, nicht hier.
    expect(parseRobots('').regeln).toEqual([])
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

- [ ] **Step 3: Implementieren**

```ts
export type RobotsRegeln = { regeln: { pfad: string; erlaubt: boolean }[] }

/**
 * Minimaler Parser fuer genau unseren Zweck (R-G). Beruecksichtigt nur die
 * Gruppe fuer `*` bzw. den uebergebenen Agenten.
 */
export function parseRobots(txt: string, agent = '*'): RobotsRegeln {
  const regeln: { pfad: string; erlaubt: boolean }[] = []
  let inGruppe = false

  for (const rohzeile of txt.split(/\r?\n/)) {
    const zeile = rohzeile.replace(/#.*$/, '').trim()
    if (!zeile) continue
    const [rohSchluessel, ...rest] = zeile.split(':')
    const schluessel = rohSchluessel.trim().toLowerCase()
    const wert = rest.join(':').trim()

    if (schluessel === 'user-agent') {
      inGruppe = wert === '*' || wert.toLowerCase() === agent.toLowerCase()
      continue
    }
    if (!inGruppe) continue
    if (schluessel === 'disallow' && wert) regeln.push({ pfad: wert, erlaubt: false })
    if (schluessel === 'allow' && wert) regeln.push({ pfad: wert, erlaubt: true })
  }
  return { regeln }
}

/** Laengste passende Regel gewinnt — so macht es auch Google. */
export function istErlaubt(regeln: RobotsRegeln, pfad: string): boolean {
  let treffer: { pfad: string; erlaubt: boolean } | null = null
  for (const r of regeln.regeln) {
    if (!pfad.startsWith(r.pfad)) continue
    if (!treffer || r.pfad.length > treffer.pfad.length) treffer = r
  }
  return treffer ? treffer.erlaubt : true
}
```

- [ ] **Step 4: Test laufen lassen — muss durchlaufen**

- [ ] **Step 5: Commit**

---

### Task 3: Impressum-Extraktion und E.164

**Files:**
- Create: `sv-levelup/lib/anreicherung/impressum.ts`, `telefon-e164.ts`
- Test: `sv-levelup/lib/anreicherung/__tests__/impressum.test.ts`

**Interfaces:**
- Produces: `zuE164(roh: string): string | null`, `extrahiere(html: string): { email: string | null; telefon: string | null; person: string | null; istRollenadresse: boolean }`

- [ ] **Step 1: Den Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { extrahiere } from '../impressum'
import { zuE164 } from '../telefon-e164'

describe('zuE164', () => {
  it('normalisiert deutsche Schreibweisen', () => {
    expect(zuE164('0251 / 12 34 56')).toBe('+4925112 3456'.replace(/\s/g, ''))
    expect(zuE164('+49 (0)251 123456')).toBe('+49251123456')
    expect(zuE164('0049 251 123456')).toBe('+49251123456')
  })

  it('verwirft zu kurze Nummern statt zu raten', () => {
    expect(zuE164('12345')).toBeNull()
    expect(zuE164('')).toBeNull()
  })

  it('laesst eine auslaendische Nummer mit Landesvorwahl stehen', () => {
    expect(zuE164('+43 1 2345678')).toBe('+4312345678')
  })
})

describe('extrahiere', () => {
  it('liest eine mailto-Adresse', () => {
    const r = extrahiere('<a href="mailto:kanzlei@musterwerk.de">Mail</a>')
    expect(r.email).toBe('kanzlei@musterwerk.de')
    expect(r.istRollenadresse).toBe(false)
  })

  it('markiert Rollenadressen', () => {
    expect(extrahiere('info@musterwerk.de').istRollenadresse).toBe(true)
    expect(extrahiere('kontakt@musterwerk.de').istRollenadresse).toBe(true)
  })

  it('entobfuskiert (at) und [at]', () => {
    expect(extrahiere('mail (at) musterwerk.de').email).toBe('mail@musterwerk.de')
    expect(extrahiere('mail[at]musterwerk[dot]de').email).toBe('mail@musterwerk.de')
  })

  it('schreibt die Adresse klein', () => {
    expect(extrahiere('Info@Musterwerk.DE').email).toBe('info@musterwerk.de')
  })

  it('liest die vertretungsberechtigte Person', () => {
    expect(extrahiere('<p>Inhaber: Dipl.-Ing. Klaus Meyer</p>').person).toBe('Klaus Meyer')
    expect(extrahiere('vertreten durch Anna Schmitz').person).toBe('Anna Schmitz')
  })

  it('gibt null zurueck, wenn nichts steht — kein Raten', () => {
    const r = extrahiere('<p>Willkommen auf unserer Seite.</p>')
    expect(r.email).toBeNull()
    expect(r.telefon).toBeNull()
    expect(r.person).toBeNull()
  })

  it('ignoriert Bild- und Skript-Adressen', () => {
    expect(extrahiere('<img src="logo@2x.png"> <script>a@b.c</script>').email).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

- [ ] **Step 3: Implementieren**

```ts
// telefon-e164.ts
/**
 * Deutsche Impressums-Schreibweisen -> E.164. Gibt null zurueck statt zu raten
 * (R-B). Kein Vertrauen in die Laenge: unter 6 Ziffern ist keine Rufnummer.
 */
export function zuE164(roh: string): string | null {
  if (!roh) return null
  let s = roh.replace(/[^\d+]/g, '')
  if (!s) return null

  if (s.startsWith('00')) s = '+' + s.slice(2)
  else if (s.startsWith('0')) s = '+49' + s.slice(1)
  else if (!s.startsWith('+')) s = '+49' + s

  // '+49(0)251...' -> die fuehrende Null nach der Landesvorwahl faellt weg
  s = s.replace(/^\+490+/, '+49')

  const ziffern = s.replace(/\D/g, '')
  if (ziffern.length < 8 || ziffern.length > 15) return null
  return s
}
```

```ts
// impressum.ts
import { zuE164 } from './telefon-e164'

const ROLLEN = ['info', 'kontakt', 'office', 'mail', 'email', 'buero', 'kanzlei', 'service', 'anfrage']

export type ImpressumBefund = {
  email: string | null
  telefon: string | null
  person: string | null
  istRollenadresse: boolean
}

function entobfuskiere(s: string): string {
  return s
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
}

export function extrahiere(html: string): ImpressumBefund {
  // Skripte und Style-Bloecke raus, sonst landen Tracking-Adressen im Befund
  const sauber = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  // 1. mailto: hat Vorrang — es ist eine Absicht, kein Zufallstreffer
  const mailto = sauber.match(/mailto:([^"'>\s?]+)/i)
  let email = mailto ? mailto[1] : null

  if (!email) {
    const text = entobfuskiere(sauber.replace(/<[^>]+>/g, ' '))
    const treffer = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    email = treffer ? treffer[0] : null
  }
  if (email) email = email.toLowerCase().replace(/[.,;]$/, '')
  // Bilddateien sehen fuer den Regex wie Adressen aus ("logo@2x.png")
  if (email && /\.(png|jpe?g|gif|webp|svg)$/i.test(email)) email = null

  const nurText = entobfuskiere(sauber.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')

  const telTreffer = nurText.match(/(?:\+49|0049|0)[\d\s/().-]{6,}/)
  const telefon = telTreffer ? zuE164(telTreffer[0]) : null

  // Nur wenn EINDEUTIG eine Person genannt ist (F-15/F-16)
  const personTreffer = nurText.match(
    /(?:Inhaber(?:in)?|Geschäftsführer(?:in)?|Geschäftsführer(?:in)?|vertreten durch)\s*:?\s*((?:Dipl\.-?\s?Ing\.?|Dr\.?|Ing\.?)?\s*[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+)/,
  )
  const person = personTreffer
    ? personTreffer[1].replace(/(Dipl\.-?\s?Ing\.?|Dr\.?|Ing\.?)\s*/g, '').trim()
    : null

  const lokalteil = email ? email.split('@')[0] : ''
  return { email, telefon, person, istRollenadresse: ROLLEN.includes(lokalteil) }
}
```

- [ ] **Step 4: Test laufen lassen — muss durchlaufen**

- [ ] **Step 5: Commit**

---

### Task 4: Sicherheits-Score

**Files:**
- Create: `sv-levelup/lib/anreicherung/sicherheit.ts`
- Test: `sv-levelup/lib/anreicherung/__tests__/sicherheit.test.ts`

**Interfaces:**
- Produces: `websiteSicherheit(a: { firmaImText: boolean; plzImText: boolean; ortImText: boolean; kernImHost: boolean }): number`, `emailSicherheit(istRollenadresse: boolean, websiteSicherheit: number): number`

- [ ] **Step 1: Den Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { emailSicherheit, websiteSicherheit } from '../sicherheit'

describe('websiteSicherheit', () => {
  it('gibt 90+ bei Firmenname woertlich und passender PLZ', () => {
    expect(websiteSicherheit({ firmaImText: true, plzImText: true, ortImText: true, kernImHost: true }))
      .toBeGreaterThanOrEqual(90)
  })

  it('gibt 70 bis 89, wenn nur der Ort stimmt', () => {
    const s = websiteSicherheit({ firmaImText: false, plzImText: false, ortImText: true, kernImHost: true })
    expect(s).toBeGreaterThanOrEqual(70)
    expect(s).toBeLessThan(90)
  })

  it('bleibt unter 70 bei bloszer Namensaehnlichkeit', () => {
    expect(websiteSicherheit({ firmaImText: false, plzImText: false, ortImText: false, kernImHost: true }))
      .toBeLessThan(70)
  })
})

describe('emailSicherheit', () => {
  it('deckelt Rollenadressen auf 60 (T-25)', () => {
    expect(emailSicherheit(true, 95)).toBeLessThanOrEqual(60)
  })

  it('erbt bei persoenlicher Adresse die Website-Sicherheit', () => {
    expect(emailSicherheit(false, 95)).toBe(95)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

- [ ] **Step 3: Implementieren**

```ts
/**
 * Zuordnungs-Sicherheit 0..100 nach F-15:
 *   90+   Firmenname im Impressum woertlich und PLZ stimmt
 *   70-89 Firmenname sinngemaess oder nur der Ort stimmt
 *   <70   nur Namensaehnlichkeit
 * Unter 70 wird geschrieben, aber in der Vertriebsliste als unsicher markiert.
 */
export function websiteSicherheit(a: {
  firmaImText: boolean
  plzImText: boolean
  ortImText: boolean
  kernImHost: boolean
}): number {
  let s = 0
  if (a.kernImHost) s += 45
  if (a.firmaImText) s += 30
  if (a.plzImText) s += 20
  if (a.ortImText) s += 15
  return Math.min(100, s)
}

/** Rollenadressen sind zulaessig, tragen aber hoechstens 60 (F-16, T-25). */
export function emailSicherheit(istRollenadresse: boolean, website: number): number {
  return istRollenadresse ? Math.min(60, website) : website
}
```

- [ ] **Step 4: Test laufen lassen — muss durchlaufen**

- [ ] **Step 5: Commit**

---

### Task 5: Schreibpfad — nur Leerstellen, mit Audit-Zeile

**Files:**
- Create: `sv-levelup/lib/anreicherung/schreiben.ts`
- Test: `sv-levelup/lib/anreicherung/__tests__/schreiben.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` aus `@/lib/supabase/admin`.
- Produces: `type Fund = { feld: 'email'|'telefon'|'website_url'|'vorname'|'nachname'; wert: string; quelleUrl: string; sicherheit: number }`, `schreibeFunde(leadId: string, funde: Fund[], laufId: string, opts?: { dryRun?: boolean }): Promise<{ ok: true; geschrieben: string[]; uebersprungen: {feld:string;grund:string}[] } | { ok: false; error: string }>`

- [ ] **Step 1: Den Test schreiben** (Supabase gemockt — die Entscheidungslogik ist das Prüfobjekt)

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  lead: {} as Record<string, unknown>,
  suppression: [] as string[],
  updates: [] as Record<string, unknown>[],
  audit: [] as Record<string, unknown>[],
  updateRows: 1,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabelle: string) => {
      if (tabelle === 'sv_leads') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: state.lead, error: null }) }) }),
          update: (werte: Record<string, unknown>) => ({
            eq: () => ({ select: async () => ({
              data: Array.from({ length: state.updateRows }, () => ({ id: 'x' })), error: null,
            }) }),
          }),
        }
      }
      if (tabelle === 'cold_mail_suppression') {
        return { select: () => ({ in: async () => ({ data: state.suppression.map((email) => ({ email })), error: null }) }) }
      }
      if (tabelle === 'levelup_anreicherung') {
        return { insert: async (rows: Record<string, unknown>[]) => { state.audit.push(...rows); return { error: null } } }
      }
      throw new Error(`Unerwartete Tabelle: ${tabelle}`)
    },
  }),
}))

const { schreibeFunde } = await import('../schreiben')

beforeEach(() => {
  state.lead = { id: 'L1', email: null, telefon: null, website_url: null, vorname: null, nachname: null }
  state.suppression = []
  state.audit = []
  state.updateRows = 1
})

describe('schreibeFunde', () => {
  it('fuellt eine Leerstelle und protokolliert sie', async () => {
    const r = await schreibeFunde('L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'https://b.de/impressum', sicherheit: 90 },
    ], 'LAUF1')
    expect(r.ok).toBe(true)
    expect(r.ok && r.geschrieben).toEqual(['email'])
    expect(state.audit).toHaveLength(1)
    expect(state.audit[0]).toMatchObject({ feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de', lauf_id: 'LAUF1' })
  })

  // T-24: nur Leerstellen
  it('ueberschreibt ein gefuelltes Feld NICHT', async () => {
    state.lead.email = 'alt@example.de'
    const r = await schreibeFunde('L1', [
      { feld: 'email', wert: 'neu@example.de', quelleUrl: 'u', sicherheit: 95 },
    ], 'LAUF1')
    expect(r.ok && r.geschrieben).toEqual([])
    expect(r.ok && r.uebersprungen[0]).toMatchObject({ feld: 'email', grund: 'bereits gefuellt' })
    expect(state.audit).toHaveLength(0)
  })

  it('schreibt eine Adresse aus der Suppression-Liste GAR NICHT', async () => {
    state.suppression = ['a@b.de']
    const r = await schreibeFunde('L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')
    expect(r.ok && r.geschrieben).toEqual([])
    expect(r.ok && r.uebersprungen[0]).toMatchObject({ grund: 'in cold_mail_suppression' })
  })

  it('meldet einen 0-Row-Update als Fehler statt Erfolg', async () => {
    state.updateRows = 0
    const r = await schreibeFunde('L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')
    expect(r.ok).toBe(false)
  })

  it('schreibt im Trockenlauf nichts, meldet aber was passieren wuerde', async () => {
    const r = await schreibeFunde('L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1', { dryRun: true })
    expect(r.ok && r.geschrieben).toEqual(['email'])
    expect(state.audit).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

- [ ] **Step 3: Implementieren** — die drei Regeln in dieser Reihenfolge: Suppression, dann Leerstelle, dann schreiben; Update **immer** mit `.select()` und Row-Check; Audit-Zeilen erst nach erfolgreichem Update.

- [ ] **Step 4: Test laufen lassen — muss durchlaufen**

- [ ] **Step 5: Commit**

---

### Task 6: Rückwärtsgang

**Files:**
- Create: `sv-levelup/lib/anreicherung/rueckwaerts.ts`
- Test: `sv-levelup/lib/anreicherung/__tests__/rueckwaerts.test.ts`

**Interfaces:**
- Produces: `dreheLaufZurueck(laufId: string): Promise<{ ok: true; zurueckgesetzt: number } | { ok: false; error: string }>`

- [ ] **Step 1: Den Test schreiben** — T-26: Felder werden auf `wert_vorher` zurückgesetzt, **die Audit-Zeilen bleiben** (append-only), und ein zweiter Aufruf ist idempotent.

- [ ] **Step 2–5:** rot → implementieren → grün → Commit. Der Log wird nie gelöscht: „Zurückdrehen löscht nicht, es schreibt zurück."

---

### Task 7: Lauf und CLI, dann Trockenlauf gegen die echten 62

**Files:**
- Create: `sv-levelup/lib/anreicherung/lauf.ts`, `sv-levelup/scripts/anreicherung.ts`
- Modify: `sv-levelup/package.json` (Script `anreicherung`, devDependency `tsx`)

- [ ] **Step 1: Orchestrierung bauen** — je Lead: Kandidaten bilden → je Kandidat robots.txt prüfen → Startseite holen → Sicherheit bestimmen → bester Treffer → die vier Impressum-Pfade → extrahieren → `schreibeFunde`. Drosselung: ≥2 s je Host, höchstens 8 Hosts parallel, Timeout 10 s, 3 Versuche mit Backoff. Ein Fehlschlag bricht den Lauf **nicht** ab.

- [ ] **Step 2: CLI**

```
npm run anreicherung -- --dry-run            # nichts schreiben, nur berichten
npm run anreicherung -- --limit 5            # erst an fuenf Leads
npm run anreicherung -- --zurueck <laufId>   # Lauf zurueckdrehen
```

- [ ] **Step 3: Trockenlauf über alle 62 und Trefferquote notieren**

Erwartete Ausgabe: je Lead die Kandidaten, der gewählte Treffer mit Sicherheit, die Funde. Am Ende die Quote — **das ist die Zahl, die die Spec verlangt** („F-15 über alle 62 Leads gelaufen, Trefferquote notiert") und die Grundlage für den Trichter in §5.5.5.

- [ ] **Step 4: Echten Lauf über 5 Leads, Ergebnis in der DB prüfen**

```sql
select feld, count(*), min(sicherheit), max(sicherheit)
from public.levelup_anreicherung where lauf_id = '<laufId>' group by feld;
select count(*) filter (where email is not null) as mit_email,
       count(*) filter (where telefon is not null) as mit_telefon
from public.sv_leads;
```

- [ ] **Step 5: Rückwärtsgang an genau diesem Lauf beweisen** — zurückdrehen, Felder wieder `null`, Audit-Zeilen unverändert vorhanden; dann erneut einspielen.

- [ ] **Step 6: Commit mit der gemessenen Trefferquote im Body**

---

## Abnahme P2

- [ ] Alle sechs Logikbausteine haben grüne Tests
- [ ] T-24 (überschreibt nichts), T-25 (Rollenadresse ≤ 60), T-26 (Lauf zurückdrehen) sind als Tests vorhanden und grün
- [ ] Trockenlauf über alle 62 Leads gelaufen, **Trefferquote notiert**
- [ ] Echter Lauf über eine kleine Teilmenge, in der DB verifiziert
- [ ] Rückwärtsgang an einem echten Lauf bewiesen
- [ ] `partner_leads` = 126 und `leads` = 78 unverändert
- [ ] `npm run typecheck` und `npm run test` grün
