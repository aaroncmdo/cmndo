# Schadenkarte — URL-Fix · Sperren · Zombie-Fix · NFC-Beschreiben (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die physische Schadenkarte funktioniert — die aufgedruckte/geschriebene URL zeigt auf die App statt ins 404, eine verlorene Karte lässt sich sperren, und der NFC-Chip kann sauber beschrieben werden.

**Architecture:** Der Chip trägt einen **NDEF-URI-Record** mit `https://app.claimondo.de/schaden/<karten_token>` — die Identität der **Karte**. Das Fahrzeug bleibt eine **DB-Verknüpfung** (`schadenkarten.fahrzeug_id`), die jederzeit um-/entbindbar ist, ohne den Chip anzufassen. **Ein** `buildSchadenkarteUrl()`-Helper speist QR-PDF, Seiten-QR **und** NFC-Schreiben → Chip == Aufkleber == PDF per Konstruktion.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Supabase (Postgres + RLS) · vitest · Web NFC (`NDEFReader`, Chrome/Android)

**Spec:** `docs/superpowers/specs/2026-07-14-schadenkarte-nfc-sperren-zb1-design.md`
**Branch:** `kitta/schadenkarte-nfc-sperren` (off `origin/staging`)

## Global Constraints

- **Regel 1:** Nie auf `main` pushen. PR gegen `staging`.
- **Regel 2:** DDL **ausschließlich** über `mcp__plugin_supabase_supabase__apply_migration`. Danach `list_migrations`, die **getrackte** Version ablesen, File exakt als `supabase/migrations/<V>_<name>.sql` committen. `execute_sql` **nur lesend**.
- **Regel 4:** Prod-Playwright-Smoke nach Deploy. ⚠️ Web NFC ist **nicht** smokebar (echte Hardware) — das wird so benannt, **nicht** als „gesmoked" ausgegeben.
- **Umlaute:** Alle **nutzersichtbaren** Strings mit echten `ä/ö/ü/ß`. Code-Kommentare/Commits dürfen ASCII sein.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, **kein** `throw`. `revalidatePath` bei jedem Write.
- **Komponenten:** `@/components/primitives` (Button) + `@/components/shared` (SectionCard) — kein handgerolltes Tailwind für Komponenten.
- **Prod-DB-ref:** `paizkjajbuxxksdoycev` (**nicht** die per-run „Supabase Preview"-refs).
- **Status-Vokabular** (CHECK `schadenkarten_status_check`): `bestellt · frei · gebunden · gesperrt · ersetzt`. **Kein neuer Wert** — `ersetzt` bleibt bewusst ungenutzt.
- **`createAdminClient()` ist UNGETYPT** → tsc prüft Select-Strings **nicht**. Jede neue Spalte/jeden neuen Select gegen die echte prod-DB proben (READ), sonst stiller PostgREST-400.
- **Arbeitsverzeichnis:** `.claude/worktrees/schadenkarte-nfc-sperren`

---

# PR 1 — URL-Fix · Zombie-Fix · Sperren (Tasks 1–5)

**Warum zuerst:** Die gedruckten Karten sind **heute tot** (404), und eine verlorene Karte ist nicht abschaltbar. Ohne den korrekten URL-Helper würde PR 2 eine **404-URL irreversibel auf Plastik brennen**.

---

### Task 1: URL-Helper — die Regressionssperre

**Files:**
- Create: `src/lib/schadenkarte/url.ts`
- Test: `src/lib/schadenkarte/url.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `buildSchadenkarteUrl(token: string): string` — wird von Task 2 (QR-PDF, Seiten-QR) und Task 8 (NFC-Schreiben) genutzt.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schadenkarte/url.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { buildSchadenkarteUrl } from './url'

const ORIG = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (ORIG === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = ORIG
})

describe('buildSchadenkarteUrl', () => {
  // REGRESSIONSSPERRE. Die alte URL (claimondo.de/schaden/...) liefert auf prod 404 --
  // das ist die Marketing-Seite (nginx :3006), die App laeuft auf app.claimondo.de (:3000).
  // Diese URL wird auf PHYSISCHES PLASTIK gedruckt/geschrieben und ist danach nicht mehr
  // aenderbar. Faellt dieser Test, ist jede produzierte Karte unbrauchbar.
  it('zeigt auf die APP-Domain, nicht auf die Marketing-Domain', () => {
    delete process.env.NEXT_PUBLIC_APP_URL // == prod: der Key ist auf dem VPS NICHT gesetzt
    const url = buildSchadenkarteUrl('SKT-ABCDEFGH23456789')

    expect(url).toBe('https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789')
    expect(url).not.toMatch(/^https:\/\/claimondo\.de/)
  })

  it('respektiert NEXT_PUBLIC_APP_URL, wenn gesetzt', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.staging.claimondo.de'
    expect(buildSchadenkarteUrl('SKT-ABCDEFGH23456789')).toBe(
      'https://app.staging.claimondo.de/schaden/SKT-ABCDEFGH23456789',
    )
  })

  it('erzeugt keinen doppelten Slash bei Trailing-Slash in der Env', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de/'
    expect(buildSchadenkarteUrl('SKT-ABCDEFGH23456789')).toBe(
      'https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/schadenkarte/url.test.ts
```
Expected: FAIL — `Failed to resolve import "./url"`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/schadenkarte/url.ts`:

```ts
// Die EINE Quelle fuer die Schadenkarte-URL. Verbraucher: QR-PDF, Seiten-QR, NFC-Chip.
//
// ⚠ Diese URL landet auf PHYSISCHEM PLASTIK (QR-Aufkleber + NFC-Chip) und ist danach nicht
// mehr aenderbar. Sie MUSS auf die App zeigen:
//   claimondo.de      -> Marketing-Seite (nginx :3006) -> /schaden/<t> = 404
//   app.claimondo.de  -> die App          (nginx :3000) -> /schaden/<t> = 200
// Beides curl-verifiziert 14.07. NEXT_PUBLIC_APP_URL ist in /etc/claimondo/.env.local NICHT
// gesetzt -> der Fallback unten entscheidet. Muster identisch zu lib/airdrop/gegner-invite.ts.
//
// Vor diesem Helper bauten drei Stellen die URL von Hand -- zwei davon falsch. Genau dieser
// Strukturdefekt ist der Grund fuer den Helper: eine Quelle => Chip == Aufkleber == PDF.
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

/** Die oeffentliche Gegner-Flow-URL einer Schadenkarte (QR-Inhalt == NDEF-Inhalt). */
export function buildSchadenkarteUrl(token: string): string {
  return `${baseUrl()}/schaden/${token}`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/schadenkarte/url.test.ts
```
Expected: PASS (3 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/schadenkarte/url.ts src/lib/schadenkarte/url.test.ts
git commit -m "feat(schadenkarte): buildSchadenkarteUrl als einzige URL-Quelle (Regressionssperre)"
```

---

### Task 2: Die drei URL-Bau-Stellen auf den Helper umstellen

Damit ist der 404 auf allen gedruckten Karten weg.

**Files:**
- Modify: `src/app/flotte/(shell)/karten/actions.ts:56` (QR-PDF)
- Modify: `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx:69` (Seiten-QR)
- Modify: `src/lib/schadenkarte/token.test.ts:11` (irreführender Test)

**Interfaces:**
- Consumes: `buildSchadenkarteUrl` aus Task 1
- Produces: nichts Neues

- [ ] **Step 1: QR-PDF umstellen**

In `src/app/flotte/(shell)/karten/actions.ts` — Import ergänzen:

```ts
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
```

Und den `entries`-Block in `baueKartenQrPdf` ersetzen:

```ts
    const entries = karten.map((k) => ({
      token: k.token,
      url: buildSchadenkarteUrl(k.token),
    }))
```

(vorher: `url: \`https://claimondo.de/schaden/${k.token}\`` — das ergab 404)

- [ ] **Step 2: Seiten-QR umstellen**

In `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx` — Import ergänzen:

```ts
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
```

Und den QR-Aufruf ersetzen:

```ts
  const qrSvg = karte
    ? await generateQrCodeSvg(buildSchadenkarteUrl(karte.karten_token), 160)
    : null
```

(vorher: `` generateQrCodeSvg(`https://claimondo.de/schaden/${karte.karten_token}`, 160) ``)

- [ ] **Step 3: Irreführenden Test korrigieren**

In `src/lib/schadenkarte/token.test.ts` Zeile 11 — `extractSchadenkarteToken` ist bewusst host-agnostisch, aber der Test suggerierte `claimondo.de` sei die richtige Domain. Ersetze die Zeile durch **beide** Fälle:

```ts
    // Host-agnostisch (der Parser matcht nur auf /schaden/<token>) -- aber der KANONISCHE
    // Host ist app.claimondo.de. claimondo.de ist die Marketing-Seite und liefert 404;
    // siehe lib/schadenkarte/url.ts.
    expect(extractSchadenkarteToken('https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789')).toBe('SKT-ABCDEFGH23456789')
    expect(extractSchadenkarteToken('https://claimondo.de/schaden/SKT-ABCDEFGH23456789')).toBe('SKT-ABCDEFGH23456789')
```

- [ ] **Step 4: Verify — keine tote URL mehr im Code**

```bash
grep -rn "claimondo.de/schaden" src/ --include=*.ts --include=*.tsx | grep -v "app.claimondo.de" | grep -v "url.ts" | grep -v "token.test.ts"
```
Expected: **keine Ausgabe** (die verbleibenden Treffer in `url.ts` + `token.test.ts` sind Kommentar bzw. bewusster Host-Agnostik-Test)

```bash
npx vitest run src/lib/schadenkarte/
npx tsc --noEmit --skipLibCheck
```
Expected: PASS / exit 0

- [ ] **Step 5: Commit**

```bash
git add "src/app/flotte/(shell)/karten/actions.ts" "src/app/flotte/(shell)/fahrzeug/[id]/page.tsx" src/lib/schadenkarte/token.test.ts
git commit -m "fix(schadenkarte): QR-URL zeigte auf claimondo.de (404) statt app.claimondo.de — jede gedruckte Karte war tot"
```

---

### Task 3: Zombie-Fix — Trigger (DDL via MCP)

Ein gelöschtes Fahrzeug ließ seine Karte als Untote zurück: `ON DELETE SET NULL` leert `fahrzeug_id`, **`status` bleibt `gebunden`** → die Karte ist weder nutzbar (Gegner-Flow lehnt ab) noch neu bindbar (`binde` verlangt `bestellt|frei`).

**Files:**
- Create: `supabase/migrations/<GETRACKTE_VERSION>_schadenkarte_freigeben_bei_fahrzeug_delete.sql`

**Interfaces:**
- Consumes: nichts
- Produces: DB-Trigger `trg_schadenkarte_freigeben_bei_fahrzeug_delete` auf `vehicles`

- [ ] **Step 1: Migration applizieren (MCP — Regel 2)**

Rufe `mcp__plugin_supabase_supabase__apply_migration` mit `project_id: "paizkjajbuxxksdoycev"`, `name: "schadenkarte_freigeben_bei_fahrzeug_delete"` und exakt dieser Query:

```sql
-- Zombie-Fix: Fahrzeug geloescht -> gebundene Karte freigeben statt als Untote zuruecklassen.
--
-- schadenkarten.fahrzeug_id -> vehicles ON DELETE SET NULL leert die Referenz, laesst status
-- aber auf 'gebunden' stehen. Ergebnis: die Karte ist weder nutzbar (resolveSchadenTokenContext
-- lehnt sie mit 'kein_fahrzeug' ab) noch neu bindbar (bindeSchadenkarteAnFahrzeug verlangt
-- 'bestellt' oder 'frei'). Die physische Karte existiert weiter -> sie gehoert auf 'frei'.
--
-- BEFORE DELETE (nicht AFTER): laeuft vor dem FK-SET-NULL, sieht fahrzeug_id also noch.
-- SECURITY DEFINER, weil schadenkarten RLS hat und der Loeschende kein UPDATE-Recht darauf
-- haben muss. search_path fixiert -> kein Schema-Hijack.
create or replace function public.schadenkarte_freigeben_bei_fahrzeug_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.schadenkarten
     set status = 'frei',
         fahrzeug_id = null,
         gebunden_am = null,
         gebunden_von = null
   where fahrzeug_id = old.id
     and status = 'gebunden';
  return old;
end $$;

drop trigger if exists trg_schadenkarte_freigeben_bei_fahrzeug_delete on public.vehicles;

create trigger trg_schadenkarte_freigeben_bei_fahrzeug_delete
  before delete on public.vehicles
  for each row
  execute function public.schadenkarte_freigeben_bei_fahrzeug_delete();

-- Einmalige Bereinigung bestehender Zombies (idempotent).
update public.schadenkarten
   set status = 'frei', gebunden_am = null, gebunden_von = null
 where status = 'gebunden'
   and fahrzeug_id is null;
```

- [ ] **Step 2: Getrackte Version ablesen (Regel 2, Schritt 3 — PFLICHT)**

Rufe `mcp__plugin_supabase_supabase__list_migrations` (`project_id: "paizkjajbuxxksdoycev"`).
Die Ausgabe ist groß — filtere gezielt:

```bash
# Die vom Plugin vergebene Version ist NICHT die, die du raten wuerdest.
# Notiere den Wert <V> zu name = schadenkarte_freigeben_bei_fahrzeug_delete.
```

Expected: eine Version wie `20260714XXXXXX`. **Diese exakte Zahl** ist der Dateiname in Step 3 — sonst Twin-Drift.

- [ ] **Step 3: Migration-File exakt nach der getrackten Version benennen**

Create `supabase/migrations/<V>_schadenkarte_freigeben_bei_fahrzeug_delete.sql` mit **exakt** der SQL aus Step 1.

- [ ] **Step 4: Verifizieren (execute_sql, READ)**

Rufe `mcp__plugin_supabase_supabase__execute_sql`:

```sql
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.vehicles'::regclass
  and tgname = 'trg_schadenkarte_freigeben_bei_fahrzeug_delete';
```
Expected: 1 Zeile, `tgenabled = 'O'`

```sql
select count(*) as zombies
from schadenkarten
where status = 'gebunden' and fahrzeug_id is null;
```
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "fix(schadenkarte): Trigger — Fahrzeug-Delete gibt gebundene Karte frei (Zombie-Fix)"
```

---

### Task 4: Lebenszyklus-Funktionen — sperren · entsperren · entbinden

**Files:**
- Modify: `src/lib/schadenkarte/schadenkarte.ts` (anhängen)
- Modify: `src/lib/schadenkarte/schadenkarte.test.ts` (anhängen)

**Interfaces:**
- Consumes: bestehender `AnyDb`-Typ + Muster aus `bindeSchadenkarteAnFahrzeug`
- Produces:
  - `sperreSchadenkarte(db: AnyDb, params: { token: string; firmaId: string }): Promise<{ ok: boolean; error?: string }>`
  - `entsperreSchadenkarte(db: AnyDb, params: { token: string; firmaId: string }): Promise<{ ok: boolean; error?: string }>`
  - `entbindeSchadenkarte(db: AnyDb, params: { token: string; firmaId: string }): Promise<{ ok: boolean; error?: string }>`
  → alle drei werden in Task 5 als Server-Actions verdrahtet.

- [ ] **Step 1: Write the failing tests**

An `src/lib/schadenkarte/schadenkarte.test.ts` anhängen. **Wichtig:** Der bestehende `makeDb`-Helper hat eine feste Chain-Tiefe. Die neuen Funktionen nutzen `.update().eq().eq().select().maybeSingle()` — identisch zu `bindeSchadenkarteAnFahrzeug` → `makeDb` passt unverändert.

```ts
import {
  sperreSchadenkarte,
  entsperreSchadenkarte,
  entbindeSchadenkarte,
} from './schadenkarte'

// ---------------------------------------------------------------------------
// Lebenszyklus: sperren / entsperren / entbinden
// ---------------------------------------------------------------------------

describe('sperreSchadenkarte', () => {
  it('sperrt eine gebundene Karte', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
  })

  it('ist IDEMPOTENT: eine bereits gesperrte Karte erneut zu sperren ist ok', async () => {
    // Notfall-Pfad (Karte verloren) -- muss Doppelklick/Retry ueberstehen.
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gesperrt', firma_id: 'f1', fahrzeug_id: 'v1' } },
    })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
  })

  it('weist eine Karte einer FREMDEN Firma ab', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'ANDERE', fahrzeug_id: 'v1' } },
    })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/andere Firma/i)
  })

  it('weist eine unbekannte Karte ab', async () => {
    const db = makeDb({ selectResult: { data: null } })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht gefunden/i)
  })
})

describe('entsperreSchadenkarte', () => {
  it('setzt eine gesperrte Karte auf FREI (nicht zurueck auf gebunden)', async () => {
    // Bewusst 'frei': das Fahrzeug hat evtl. schon eine Ersatzkarte -- ein automatisches
    // Zurueck-auf-gebunden wuerde den Partial-Unique verletzen bzw. zwei gueltige Karten
    // erzeugen. Die Karte muss BEWUSST neu gebunden werden.
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gesperrt', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await entsperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
  })

  it('weist eine NICHT gesperrte Karte ab (kein stiller No-op)', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
    })
    const res = await entsperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht gesperrt/i)
  })
})

describe('entbindeSchadenkarte', () => {
  it('loest eine gebundene Karte vom Fahrzeug (-> frei)', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await entbindeSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
  })

  it('weist eine NICHT gebundene Karte ab', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'f1', fahrzeug_id: null } },
    })
    const res = await entbindeSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht gebunden/i)
  })

  it('meldet einen Race (Karte wurde zwischenzeitlich geaendert)', async () => {
    // Optimistic-Guard .eq('status', alterStatus) matcht nicht mehr -> data === null
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: null, error: null },
    })
    const res = await entbindeSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/zwischenzeitlich/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/schadenkarte/schadenkarte.test.ts
```
Expected: FAIL — `sperreSchadenkarte is not a function` (bzw. Import-Fehler)

- [ ] **Step 3: Write minimal implementation**

An `src/lib/schadenkarte/schadenkarte.ts` anhängen:

```ts
// ─── Lebenszyklus: sperren · entsperren · entbinden ─────────────────────────
//
// Der Gegner-Flow oeffnet NUR bei status='gebunden' (lib/schadenkarte/gegner-flow.ts).
// Ein Statuswechsel weg von 'gebunden' toetet den Token daher SOFORT -- das ist das
// gesamte Sicherheitsfundament fuer "Karte verloren".

type KarteRow = { id: string; status: string; firma_id: string; fahrzeug_id: string | null }

/** Laedt die Karte und prueft die Firma-Zugehoerigkeit. Muster wie bindeSchadenkarteAnFahrzeug. */
async function ladeKarteFuerFirma(
  db: AnyDb,
  token: string,
  firmaId: string,
): Promise<KarteRow | { error: string }> {
  const { data } = await db
    .from('schadenkarten')
    .select('id, status, firma_id, fahrzeug_id')
    .eq('karten_token', token)
    .maybeSingle()

  const row = data as KarteRow | null
  if (!row) return { error: 'Karte nicht gefunden.' }
  if (row.firma_id !== firmaId) return { error: 'Karte gehört zu einer anderen Firma.' }
  return row
}

/** Setzt den Status mit Optimistic-Guard auf den Ausgangsstatus (Race-Schutz). */
async function setzeStatus(
  db: AnyDb,
  row: KarteRow,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('schadenkarten')
    .update(patch)
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Karte wurde zwischenzeitlich geändert.' }
  return { ok: true }
}

/**
 * Karte sperren (verloren/gestohlen). Der Token ist danach SOFORT tot.
 *
 * fahrzeug_id bleibt bewusst stehen (Historie: "diese Karte sass auf Fahrzeug X").
 * Der Partial-Unique greift nur WHERE status='gebunden' -> das Fahrzeug kann sofort eine
 * Ersatzkarte bekommen, ohne dass wir die Historie verlieren.
 *
 * IDEMPOTENT: eine bereits gesperrte Karte erneut zu sperren liefert ok:true. Das ist der
 * Notfall-Pfad -- er muss Doppelklick und Retry ueberstehen, statt einen Fehler zu werfen.
 */
export async function sperreSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }
  if (row.status === 'gesperrt') return { ok: true } // idempotent
  return setzeStatus(db, row, { status: 'gesperrt' })
}

/**
 * Karte entsperren -> 'frei', NICHT zurueck auf 'gebunden'.
 *
 * Grund: das Fahrzeug hat inzwischen evtl. eine Ersatzkarte. Ein automatisches
 * Zurueck-auf-gebunden wuerde entweder den Partial-Unique verletzen oder zwei gueltige
 * Karten fuer ein Fahrzeug erzeugen. Die wiedergefundene Karte muss BEWUSST neu gebunden
 * werden.
 */
export async function entsperreSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }
  if (row.status !== 'gesperrt') return { ok: false, error: 'Karte ist nicht gesperrt.' }
  return setzeStatus(db, row, {
    status: 'frei',
    fahrzeug_id: null,
    gebunden_am: null,
    gebunden_von: null,
  })
}

/** Karte vom Fahrzeug loesen (Fahrzeug verkauft / Karte umziehen) -> 'frei'. */
export async function entbindeSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }
  if (row.status !== 'gebunden') return { ok: false, error: 'Karte ist nicht gebunden.' }
  return setzeStatus(db, row, {
    status: 'frei',
    fahrzeug_id: null,
    gebunden_am: null,
    gebunden_von: null,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/schadenkarte/schadenkarte.test.ts
npx tsc --noEmit --skipLibCheck
```
Expected: PASS (alle bestehenden + 9 neue) / tsc exit 0

- [ ] **Step 5: Commit**

```bash
git add src/lib/schadenkarte/schadenkarte.ts src/lib/schadenkarte/schadenkarte.test.ts
git commit -m "feat(schadenkarte): sperren/entsperren/entbinden — verlorene Karte abschaltbar"
```

---

### Task 5: Server-Actions + UI im Flotten-Portal

**Files:**
- Modify: `src/app/flotte/(shell)/karten/actions.ts` (3 Actions anhängen)
- Modify: `src/app/flotte/(shell)/karten/page.tsx` (Actions durchreichen)
- Modify: `src/app/flotte/(shell)/karten/KartenClient.tsx` (Buttons + Status-Labels)

**Interfaces:**
- Consumes: `sperreSchadenkarte` / `entsperreSchadenkarte` / `entbindeSchadenkarte` (Task 4)
- Produces: Server-Actions `sperreKarte(token)` · `entsperreKarte(token)` · `entbindeKarte(token)`, je `Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Server-Actions anhängen**

An `src/app/flotte/(shell)/karten/actions.ts` — Imports ergänzen:

```ts
import { revalidatePath } from 'next/cache'
import {
  sperreSchadenkarte,
  entsperreSchadenkarte,
  entbindeSchadenkarte,
} from '@/lib/schadenkarte/schadenkarte'
```

Und anhängen (Muster exakt wie `bindeKarte` in `flotte/schadenkarte-actions.ts`):

```ts
/** Karte sperren (verloren/gestohlen) — der Token ist danach sofort tot. */
export async function sperreKarte(token: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await sperreSchadenkarte(db, { token, firmaId: firma.id })
  if (res.ok) {
    revalidatePath('/flotte/karten')
    revalidatePath('/flotte/flotte')
  }
  return res
}

/** Gesperrte Karte wieder freigeben — sie landet auf 'frei' und muss neu gebunden werden. */
export async function entsperreKarte(token: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await entsperreSchadenkarte(db, { token, firmaId: firma.id })
  if (res.ok) {
    revalidatePath('/flotte/karten')
    revalidatePath('/flotte/flotte')
  }
  return res
}

/** Karte vom Fahrzeug lösen (Fahrzeug verkauft) — sie wird wiederverwendbar. */
export async function entbindeKarte(token: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await entbindeSchadenkarte(db, { token, firmaId: firma.id })
  if (res.ok) {
    revalidatePath('/flotte/karten')
    revalidatePath('/flotte/flotte')
  }
  return res
}
```

- [ ] **Step 2: Actions durchreichen**

In `src/app/flotte/(shell)/karten/page.tsx` — Import + Props erweitern:

```ts
import { identifiziereKarte, baueKartenQrPdf, sperreKarte, entsperreKarte, entbindeKarte } from './actions'
```

```tsx
      <KartenClient
        karten={karten}
        onIdentify={identifiziereKarte}
        onQrPdf={baueKartenQrPdf}
        onSperren={sperreKarte}
        onEntsperren={entsperreKarte}
        onEntbinden={entbindeKarte}
      />
```

- [ ] **Step 3: UI — Buttons + lesbare Status**

In `src/app/flotte/(shell)/karten/KartenClient.tsx` — `Props` erweitern:

```tsx
type Aktion = (token: string) => Promise<{ ok: boolean; error?: string }>

type Props = {
  karten: Karte[]
  onIdentify: (token: string) => Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }>
  onQrPdf: () => Promise<{ ok: true; base64: string } | { ok: false; error: string }>
  onSperren: Aktion
  onEntsperren: Aktion
  onEntbinden: Aktion
}
```

Status-Label-Map (**reine Label-Map ohne Farbe** — vom status-registry-Ratchet ausdrücklich erlaubt) oberhalb der Komponente:

```tsx
const STATUS_LABEL: Record<string, string> = {
  bestellt: 'Bestellt',
  frei: 'Frei',
  gebunden: 'Gebunden',
  gesperrt: 'Gesperrt',
  ersetzt: 'Ersetzt',
}
```

Signatur + State in der Komponente:

```tsx
export default function KartenClient({
  karten, onIdentify, onQrPdf, onSperren, onEntsperren, onEntbinden,
}: Props) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  const [ladend, setLadend] = useState(false)
  const [pdfFehler, setPdfFehler] = useState<string | null>(null)
  const [pdfLadend, setPdfLadend] = useState(false)
  const [aktionToken, setAktionToken] = useState<string | null>(null)
  const [aktionFehler, setAktionFehler] = useState<string | null>(null)

  async function fuehreAus(token: string, aktion: Aktion) {
    setAktionFehler(null)
    setAktionToken(token)
    try {
      const res = await aktion(token)
      if (!res.ok) setAktionFehler(res.error ?? 'Aktion fehlgeschlagen.')
      else router.refresh()
    } finally {
      setAktionToken(null)
    }
  }
```

Und die Kartenliste (`<li>`) ersetzen:

```tsx
            <ul className="divide-y divide-claimondo-border">
              {karten.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-claimondo-navy">{k.token}</span>
                    <span className="text-xs text-claimondo-shield">
                      {STATUS_LABEL[k.status] ?? k.status}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {k.status === 'gebunden' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={aktionToken === k.token}
                        onClick={() => fuehreAus(k.token, onEntbinden)}
                      >
                        Vom Fahrzeug lösen
                      </Button>
                    )}
                    {k.status !== 'gesperrt' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={aktionToken === k.token}
                        onClick={() => fuehreAus(k.token, onSperren)}
                      >
                        Sperren
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={aktionToken === k.token}
                        onClick={() => fuehreAus(k.token, onEntsperren)}
                      >
                        Entsperren
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {aktionFehler && (
              <p className="mt-3 text-sm text-danger-strong">{aktionFehler}</p>
            )}
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit --skipLibCheck
npm run check:component-set
npm run check:status-registry
npm run check:token-audit
```
Expected: tsc exit 0; alle Ratchets exit 0

- [ ] **Step 5: Commit**

```bash
git add "src/app/flotte/(shell)/karten/"
git commit -m "feat(schadenkarte): Sperren/Entsperren/Entbinden im Flotten-Portal erreichbar"
```

- [ ] **Step 6: PR 1 öffnen**

```bash
git push -u origin kitta/schadenkarte-nfc-sperren
gh pr create --base staging --title "fix(schadenkarte): tote QR-URL + Zombie-Karte + Sperren" --body "..."
```

Der PR-Body **muss** enthalten: die 404-Belege (`claimondo.de` → 404, `app.claimondo.de` → 200), den Zombie-Mechanismus, und den **Prod-Smoke-Plan** aus Task 9.

---

# PR 2 — NFC-Beschreiben (Tasks 6–8)

**Setzt Task 1 zwingend voraus** — ohne den korrekten Helper würde eine 404-URL **irreversibel auf den Chip** geschrieben.

---

### Task 6: NFC-Kern — Feature-Detection + Verifikations-Logik

Die `NDEFReader`-Interaktion selbst ist nicht unit-testbar (Browser-Hardware). Die **Entscheidungslogik** ist es — und die ist der sicherheitskritische Teil.

**Files:**
- Create: `src/lib/schadenkarte/nfc.ts`
- Test: `src/lib/schadenkarte/nfc.test.ts`

**Interfaces:**
- Consumes: `extractSchadenkarteToken` (token.ts), `buildSchadenkarteUrl` (Task 1)
- Produces:
  - `nfcVerfuegbar(): boolean`
  - `chipTraegtToken(gelesen: string | null, erwartet: string): boolean`
  - Types `NdefReaderLike`, `NdefReadingEventLike` (für Task 7)

- [ ] **Step 1: Write the failing test**

Create `src/lib/schadenkarte/nfc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { chipTraegtToken, nfcVerfuegbar } from './nfc'

describe('chipTraegtToken', () => {
  // DIE Kern-Sicherung. Traegt der Chip einen ANDEREN Token als der Aufkleber, hat die Karte
  // zwei Identitaeten: Auflegen -> Fahrzeug A, Scannen -> Fahrzeug B. Ein stiller Datenfehler
  // auf physischem Material, der praktisch nicht auffindbar ist.
  it('akzeptiert die zurueckgelesene URL mit dem erwarteten Token', () => {
    expect(
      chipTraegtToken(
        'https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789',
        'SKT-ABCDEFGH23456789',
      ),
    ).toBe(true)
  })

  it('lehnt einen FREMDEN Token ab', () => {
    expect(
      chipTraegtToken(
        'https://app.claimondo.de/schaden/SKT-ZZZZZZZZ23456789',
        'SKT-ABCDEFGH23456789',
      ),
    ).toBe(false)
  })

  it('lehnt einen leeren/nicht lesbaren Chip ab', () => {
    expect(chipTraegtToken(null, 'SKT-ABCDEFGH23456789')).toBe(false)
    expect(chipTraegtToken('', 'SKT-ABCDEFGH23456789')).toBe(false)
    expect(chipTraegtToken('irgendwas', 'SKT-ABCDEFGH23456789')).toBe(false)
  })

  it('akzeptiert auch einen nackten Token (Chip ohne URL-Praefix)', () => {
    expect(chipTraegtToken('SKT-ABCDEFGH23456789', 'SKT-ABCDEFGH23456789')).toBe(true)
  })
})

describe('nfcVerfuegbar', () => {
  it('meldet false ohne NDEFReader (jsdom == iPhone/Desktop)', () => {
    expect(nfcVerfuegbar()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/schadenkarte/nfc.test.ts
```
Expected: FAIL — `Failed to resolve import "./nfc"`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/schadenkarte/nfc.ts`:

```ts
// Web NFC (NDEFReader) fuer das Beschreiben der physischen Schadenkarte.
//
// Plattform-Realitaet (wichtig, damit die UI ehrlich ist):
//   SCHREIBEN : nur Chrome/Android. Apple gibt Web NFC nicht frei -> iPhone kann NICHT schreiben.
//   ANTIPPEN  : iPhone UND Android. iOS liest NDEF-URI-Tags nativ ueber das OS (ohne App).
// Nur der Setup-Schritt braucht also Android; der Ernstfall funktioniert ueberall.
//
// NDEFReader ist nicht in den Standard-DOM-Types -- gleiches Muster wie BarcodeDetector
// in components/flotte/SchadenkarteScanner.tsx.
import { extractSchadenkarteToken } from './token'

export interface NdefReadingEventLike {
  serialNumber: string
  message: { records: ReadonlyArray<{ recordType: string; data?: DataView }> }
}

export interface NdefReaderLike {
  write(message: { records: Array<{ recordType: string; data: string }> }): Promise<void>
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: NdefReadingEventLike) => void) | null
  onreadingerror: ((event: Event) => void) | null
}

export type NdefReaderCtor = new () => NdefReaderLike

/**
 * NDEF-Record-Typ. MUSS 'url' sein: iPhones oeffnen beim Auflegen nur Well-Known-URI-Tags
 * automatisch ueber das OS. Ein Custom-MIME-Record wuerde auf iOS gar nicht aufpoppen --
 * die Karte waere fuer die Haelfte der Unfallgegner tot.
 */
export const NDEF_RECORD_TYPE = 'url' as const

/** Kann dieses Geraet NFC-Tags beschreiben? (Chrome/Android ja, iPhone/Desktop nein.) */
export function nfcVerfuegbar(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window
}

/**
 * Traegt der zurueckgelesene Chip wirklich den erwarteten Token?
 *
 * Das ist die Kern-Sicherung des Beschreib-Vorgangs. Wuerde der Chip einen anderen Token
 * tragen als der aufgeklebte QR, haette die physische Karte ZWEI Identitaeten
 * (Auflegen -> Fahrzeug A, Scannen -> Fahrzeug B). Deshalb wird nach dem Schreiben
 * zurueckgelesen und hier verglichen; schlaegt das fehl, gilt die Karte als NICHT beschrieben.
 *
 * extractSchadenkarteToken parst sowohl die volle /schaden/<token>-URL als auch einen
 * nackten Token -> beide Chip-Varianten werden akzeptiert.
 */
export function chipTraegtToken(gelesen: string | null, erwartet: string): boolean {
  if (!gelesen) return false
  return extractSchadenkarteToken(gelesen) === erwartet
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/schadenkarte/nfc.test.ts
```
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/schadenkarte/nfc.ts src/lib/schadenkarte/nfc.test.ts
git commit -m "feat(schadenkarte): NFC-Kern — Feature-Detection + Chip-Token-Verifikation"
```

---

### Task 7: `nfc_uid` persistieren

**Files:**
- Modify: `src/lib/schadenkarte/schadenkarte.ts` (anhängen)
- Modify: `src/lib/schadenkarte/schadenkarte.test.ts` (anhängen)
- Modify: `src/app/flotte/(shell)/karten/actions.ts` (Server-Action anhängen)

**Interfaces:**
- Consumes: `ladeKarteFuerFirma` (privat, Task 4)
- Produces: `speichereNfcUid(db, { token, firmaId, nfcUid }): Promise<{ ok: boolean; error?: string }>` + Server-Action `merkeNfcUid(token, nfcUid)`

- [ ] **Step 1: Write the failing test**

An `src/lib/schadenkarte/schadenkarte.test.ts` anhängen:

```ts
import { speichereNfcUid } from './schadenkarte'

describe('speichereNfcUid', () => {
  it('speichert die Chip-Seriennummer an der Karte', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await speichereNfcUid(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', nfcUid: '04:a2:24:bb',
    })
    expect(res.ok).toBe(true)
  })

  it('weist eine Karte einer fremden Firma ab', async () => {
    const db = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'ANDERE', fahrzeug_id: null } },
    })
    const res = await speichereNfcUid(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', nfcUid: '04:a2:24:bb',
    })
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/schadenkarte/schadenkarte.test.ts -t speichereNfcUid
```
Expected: FAIL — `speichereNfcUid is not a function`

- [ ] **Step 3: Write minimal implementation**

An `src/lib/schadenkarte/schadenkarte.ts` anhängen:

```ts
/**
 * Chip-Seriennummer an der Karte vermerken (nach erfolgreichem + VERIFIZIERTEM Beschreiben).
 *
 * Zweck: Nachweis "dieser Token sitzt auf diesem physischen Chip" + die Ops-Frage
 * "welche Karten sind noch nicht beschrieben?" (nfc_uid IS NULL).
 *
 * ⚠ KEIN Anti-Clone-Merkmal: beim Antippen uebergibt das Betriebssystem nur die URL,
 * nicht die Chip-UID -- eine Klon-Erkennung zur Tap-Zeit ist mit einem reinen URI-Tag
 * technisch nicht moeglich. Die Spalte ist Inventar, nicht Sicherheit.
 *
 * Bewusst OHNE Status-Guard: das Beschreiben ist unabhaengig davon, ob die Karte gerade
 * bestellt/frei/gebunden ist.
 */
export async function speichereNfcUid(
  db: AnyDb,
  params: { token: string; firmaId: string; nfcUid: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }

  // firma_id wird BEIM UPDATE erneut geprueft, nicht nur beim Lesen: schliesst die
  // TOCTOU-Luecke zwischen ladeKarteFuerFirma und dem Write.
  const { error } = await db
    .from('schadenkarten')
    .update({ nfc_uid: params.nfcUid })
    .eq('id', row.id)
    .eq('firma_id', params.firmaId)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

⚠️ **`createAdminClient()` ist ungetypt** → `tsc` prüft den Select/Update **nicht**. Probe die Spalte einmal gegen prod (READ):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'schadenkarten' and column_name = 'nfc_uid';
```
Expected: 1 Zeile.

- [ ] **Step 4: Server-Action anhängen**

An `src/app/flotte/(shell)/karten/actions.ts`:

```ts
import { speichereNfcUid } from '@/lib/schadenkarte/schadenkarte'

/** Nach erfolgreichem + verifiziertem NFC-Schreiben: Chip-Seriennummer vermerken. */
export async function merkeNfcUid(
  token: string,
  nfcUid: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await speichereNfcUid(db, { token, firmaId: firma.id, nfcUid })
  if (res.ok) revalidatePath('/flotte/karten')
  return res
}
```

- [ ] **Step 5: Run tests + commit**

```bash
npx vitest run src/lib/schadenkarte/
npx tsc --noEmit --skipLibCheck
git add src/lib/schadenkarte/ "src/app/flotte/(shell)/karten/actions.ts"
git commit -m "feat(schadenkarte): nfc_uid persistieren (Beschreib-Nachweis, kein Anti-Clone)"
```

---

### Task 8: NFC-Beschreiben-UI (scan-first)

**Files:**
- Create: `src/components/flotte/NfcKarteBeschreiben.tsx`
- Modify: `src/app/flotte/(shell)/karten/KartenClient.tsx` (Sektion einhängen)
- Modify: `src/app/flotte/(shell)/karten/page.tsx` (`merkeNfcUid` durchreichen)

**Interfaces:**
- Consumes: `nfcVerfuegbar` · `chipTraegtToken` · `NDEF_RECORD_TYPE` · `NdefReaderCtor` (Task 6), `buildSchadenkarteUrl` (Task 1), `merkeNfcUid` (Task 7), `SchadenkarteScanner` (bestehend)
- Produces: `<NfcKarteBeschreiben onGespeichert={...} />`

- [ ] **Step 1: Komponente schreiben**

Create `src/components/flotte/NfcKarteBeschreiben.tsx`:

```tsx
'use client'

// NFC-Karte beschreiben — SCAN-FIRST.
//
// Der Operator scannt ZUERST den aufgeklebten QR der Karte. Erst dann wird genau DIESER
// Token auf den Chip geschrieben. Wuerde man stattdessen einen Token aus einer Liste waehlen
// und auf die gerade aufliegende Karte schreiben, koennte Token X auf die Karte mit Aufkleber Y
// landen -- die Karte haette zwei Identitaeten (Auflegen -> Fahrzeug A, Scannen -> Fahrzeug B).
// Indem die Karte sich SELBST identifiziert, ist Chip == Aufdruck per Konstruktion.
import { useState } from 'react'
import { SchadenkarteScanner } from '@/components/flotte/SchadenkarteScanner'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
import {
  nfcVerfuegbar,
  chipTraegtToken,
  NDEF_RECORD_TYPE,
  type NdefReaderCtor,
  type NdefReadingEventLike,
} from '@/lib/schadenkarte/nfc'

type Props = {
  onNfcUid: (token: string, nfcUid: string) => Promise<{ ok: boolean; error?: string }>
}

type Phase = 'scannen' | 'auflegen' | 'fertig'

export function NfcKarteBeschreiben({ onNfcUid }: Props) {
  const [phase, setPhase] = useState<Phase>('scannen')
  const [token, setToken] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const unterstuetzt = nfcVerfuegbar()

  async function beschreibe(t: string) {
    setFehler(null)
    setLaeuft(true)
    try {
      const Ctor = (window as unknown as { NDEFReader: NdefReaderCtor }).NDEFReader
      const url = buildSchadenkarteUrl(t)

      // 1) Schreiben
      const writer = new Ctor()
      await writer.write({ records: [{ recordType: NDEF_RECORD_TYPE, data: url }] })

      // 2) Zurueck lesen + verifizieren. Ohne bestaetigten Rueckweg gilt die Karte als NICHT
      //    beschrieben -- lieber einmal zu viel schreiben als eine unverifizierte Karte ausliefern.
      const reader = new Ctor()
      const controller = new AbortController()
      const gelesen = await new Promise<{ url: string | null; uid: string | null }>((resolve) => {
        const timeout = setTimeout(() => {
          controller.abort()
          resolve({ url: null, uid: null })
        }, 10_000)

        reader.onreading = (ev: NdefReadingEventLike) => {
          clearTimeout(timeout)
          const rec = ev.message.records.find((r) => r.recordType === NDEF_RECORD_TYPE)
          const text = rec?.data ? new TextDecoder().decode(rec.data) : null
          controller.abort()
          resolve({ url: text, uid: ev.serialNumber ?? null })
        }
        reader.onreadingerror = () => {
          clearTimeout(timeout)
          controller.abort()
          resolve({ url: null, uid: null })
        }
        void reader.scan({ signal: controller.signal })
      })

      if (!chipTraegtToken(gelesen.url, t)) {
        setFehler(
          'Die Karte konnte nicht verifiziert werden. Bitte erneut auflegen — sie gilt als nicht beschrieben.',
        )
        return
      }

      // 3) Chip-Seriennummer vermerken (Nachweis „beschrieben")
      if (gelesen.uid) {
        const res = await onNfcUid(t, gelesen.uid)
        if (!res.ok) {
          setFehler(res.error ?? 'Chip-Kennung konnte nicht gespeichert werden.')
          return
        }
      }

      setPhase('fertig')
    } catch (err) {
      setFehler(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'NFC-Zugriff wurde abgelehnt. Bitte erlauben und erneut versuchen.'
          : 'Beschreiben fehlgeschlagen. Karte länger auflegen und erneut versuchen.',
      )
    } finally {
      setLaeuft(false)
    }
  }

  if (!unterstuetzt) {
    return (
      <SectionCard title="Karte beschreiben (NFC)">
        <p className="text-sm text-claimondo-shield">
          NFC-Beschreiben braucht ein Android-Gerät mit Chrome. Auf dem iPhone ist das technisch
          nicht möglich.{' '}
          <strong className="text-claimondo-navy">
            Die Karte funktioniert trotzdem — über den aufgeklebten QR-Code.
          </strong>
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Karte beschreiben (NFC)"
      subtitle="Zuerst den aufgeklebten QR-Code der Karte scannen, dann die Karte an das Gerät halten."
    >
      {phase === 'scannen' && (
        <SchadenkarteScanner
          disabled={laeuft}
          onToken={(t) => {
            setToken(t)
            setPhase('auflegen')
          }}
        />
      )}

      {phase === 'auflegen' && token && (
        <div className="space-y-3">
          <p className="text-sm text-claimondo-ondo">
            Karte <span className="font-mono">{token}</span> jetzt an das Gerät halten.
          </p>
          <Button variant="ondo" loading={laeuft} onClick={() => beschreibe(token)}>
            Karte beschreiben
          </Button>
        </div>
      )}

      {phase === 'fertig' && (
        <div className="space-y-3">
          <p className="text-sm text-success-strong">
            Karte beschrieben und verifiziert.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setToken(null)
              setFehler(null)
              setPhase('scannen')
            }}
          >
            Nächste Karte
          </Button>
        </div>
      )}

      {fehler && <p className="mt-3 text-sm text-danger-strong">{fehler}</p>}
    </SectionCard>
  )
}
```

- [ ] **Step 2: Einhängen**

In `src/app/flotte/(shell)/karten/page.tsx`:

```ts
import { identifiziereKarte, baueKartenQrPdf, sperreKarte, entsperreKarte, entbindeKarte, merkeNfcUid } from './actions'
```
…und `onNfcUid={merkeNfcUid}` an `KartenClient` durchreichen.

In `KartenClient.tsx` — Import + Prop + Rendern der Sektion **oberhalb** der Kartenliste:

```tsx
import { NfcKarteBeschreiben } from '@/components/flotte/NfcKarteBeschreiben'
```
```tsx
      <NfcKarteBeschreiben onNfcUid={onNfcUid} />
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit --skipLibCheck
npx vitest run src/lib/schadenkarte/
npm run check:component-set && npm run check:token-audit && npm run check:status-registry
```
Expected: alles exit 0

- [ ] **Step 4: Commit + PR 2**

```bash
git add src/components/flotte/NfcKarteBeschreiben.tsx "src/app/flotte/(shell)/karten/"
git commit -m "feat(schadenkarte): NFC-Beschreiben (scan-first, Rueckles-Verifikation, iPhone-Hinweis)"
git push
gh pr create --base staging --title "feat(schadenkarte): NFC-Chip beschreiben (Web NFC)" --body "..."
```

---

### Task 9: Prod-Smoke (Regel 4) — nach Deploy

**Files:** keine (Verifikation)

- [ ] **Step 1: Automatisierbarer Teil (Playwright + DB)**

Test-Flotte: `flotte.test@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`, Firma `dafc57ee-0d27-4d7e-8e1a-4a11edd6f713`.

```
1. /flotte/karten laden               → Karten-Liste rendert, Status lesbar
2. QR-PDF herunterladen               → PDF enthaelt app.claimondo.de (NICHT claimondo.de)
3. curl die Karten-URL                → 200 (vorher 404)
4. „Sperren" klicken                  → DB: status='gesperrt'
5. /schaden/<token> anonym laden      → Flow wird ABGEWIESEN (nicht_gebunden)
6. „Entsperren" klicken               → DB: status='frei', fahrzeug_id IS NULL
7. neu binden                         → DB: status='gebunden'
```

⚠️ **Bei Schritt 5 den Wizard NICHT absenden.** `VS_MELDUNG_ENABLED` ist auf prod scharf und **kein** Versicherer-Empfänger dort ist intern (0 von 85) — ein vollständiger Durchlauf schreibt einen **echten** Versicherer an. Siehe `COORDINATION-firmen-flotte-live-auf-prod-vs-meldung-scharf`.

- [ ] **Step 2: NICHT automatisierbarer Teil — ehrlich benennen**

**Web NFC lässt sich nicht per Playwright smoken** (echte Hardware nötig). Manueller Check durch Aaron mit einem Android-Gerät:

```
1. /flotte/karten auf Android-Chrome  → „Karte beschreiben (NFC)" ist sichtbar
2. QR der Karte scannen               → Token erkannt
3. Karte auflegen                     → „Karte beschrieben und verifiziert."
4. DB: nfc_uid ist gesetzt
5. Karte mit einem IPHONE antippen    → /schaden/<token> oeffnet sich (OS-nativ)
6. Auf einem iPhone /flotte/karten    → Hinweis „braucht Android", KEIN toter Button
```

Im PR **so** dokumentieren — **nicht** als „gesmoked" ausgeben.

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| §4.1 Zustandsmaschine (sperren/entsperren/entbinden + Semantik-Tabelle) | 4 |
| §4.2 Eine URL, drei Verbraucher | 1, 2 |
| §4.3 NFC-Beschreiben (scan-first, URI-Record, Rückles-Verifikation, iPhone-Fallback, Fehlerfälle) | 6, 7, 8 |
| §4.4 Sperren/Entsperren/Entbinden + UI | 4, 5 |
| §4.5 Zombie-Fix (Trigger + Bereinigung, SECURITY DEFINER + search_path) | 3 |
| §4.6 ZB1-Fahrzeuganlage | **eigener Plan** (Scope-Schnitt, s. u.) |
| §8 Sicherheit (Firma-Scoping in jeder Action) | 4, 5, 7 |
| §9 Tests + ehrliche Web-NFC-Grenze | 1, 4, 6, 9 |

**Scope-Schnitt:** §4.6 (ZB1-OCR-Fahrzeuganlage) ist ein **eigenes Subsystem** (Vehicle-Write-Path + OCR) und bekommt einen **eigenen Plan** — es produziert unabhängig lauffähige Software und würde diesen Plan sonst verwässern. Dieser Plan liefert die **Karte**; der ZB1-Plan liefert die **Fahrzeug-Anlage**.

**Typ-Konsistenz geprüft:** `buildSchadenkarteUrl` (T1) → T2, T6, T8 · `sperreSchadenkarte`/`entsperreSchadenkarte`/`entbindeSchadenkarte` (T4) → T5 · `ladeKarteFuerFirma` (T4, privat) → T7 · `speichereNfcUid` (T7) → T8 · `nfcVerfuegbar`/`chipTraegtToken`/`NDEF_RECORD_TYPE`/`NdefReaderCtor`/`NdefReadingEventLike` (T6) → T8. Alle Namen und Signaturen stimmen überein.

**Keine Platzhalter:** Jeder Code-Step enthält vollständigen, lauffähigen Code. Jeder Verify-Step nennt den exakten Befehl + die erwartete Ausgabe.
