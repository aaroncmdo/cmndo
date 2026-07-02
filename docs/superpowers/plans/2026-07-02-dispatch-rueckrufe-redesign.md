# Dispatch „Rückrufe" — Genuine Rebuild (Queue-IA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the Dispatch callback queue (`/dispatch/rueckrufe`) from a flat list into a prioritized "Rückruf-Queue" that mirrors the shipped "Zeitplan" design language — overdue escalated on top, upcoming grouped by relative day, Zeit-Rail rows, StatBar summary — while preserving the data layer 1:1.

**Architecture:** Single Next.js 15 server component (`page.tsx`). The data layer (Supabase `admin_termine` query + AAR-724 mark-seen update + array normalization) stays byte-for-byte. Only the presentation is rebuilt: derive `overdue`/`upcoming`/`dayGroups`/`nextId` inline (same technique as the shipped `mitarbeiter/termine` "Zeitplan"), render an Überfällig `<section>` + relative-day `<section>`s of Zeit-Rail rows, and a `StatBar` header. Interactive `RueckrufActions` (client) and `RueckrufeRealtimeRefresher` are re-used untouched.

**Tech Stack:** Next.js 15 (App Router, server components), TypeScript, Tailwind v4 (Claimondo design tokens), Supabase JS. Shared: `@/components/shared/StatBar`, `@/components/shared/EmptyState`, `@/components/shared/PhoneButton`, `@/lib/google-calendar/timezone`.

## Global Constraints

- **Data layer verbatim:** the `admin_termine` select (typ=rueckruf, status=offen, lead-embed), the `Array.isArray(t.lead) ? t.lead[0] : t.lead` normalization, and the AAR-724 mark-seen `UPDATE` block must not change in behavior.
- **Umlauts:** all user-visible strings use real `ä/ö/ü/ß` (`Rückrufe`, `Überfällig`, `Als Nächstes`).
- **Design tokens only:** colors from `success/warning/danger` + `claimondo-*` tokens (never raw `green/red/amber/blue` scales — Status/Accent ratchets). Radii `rounded-ios-*` (+ `rounded-full`). Typo `text-heading-*/body-*/caption` (never `text-[10px]`).
- **Branch/PR:** work on `kitta/dispatch-rueckrufe-redesign` in worktree `.claude/worktrees/dispatch-rueckrufe-redesign` (off `origin/staging`). One PR against **staging**. Never push `main`.
- **Scope:** ONLY `src/app/dispatch/rueckrufe/page.tsx` changes (this plan doc is the only other committed file). `RueckrufActions.tsx` is already status-tokenized on staging → leave untouched.

---

## Design & Context (embedded spec — Aaron-approved 02.07. „das passt")

**Diagnosis (staging base):** `dispatch/rueckrufe` is the dispatcher's most time-critical queue (callback SLA < 15 min) but is a flat, undifferentiated list: `PageHeader` + rows with only an `(überfällig)` text suffix, no urgency IA, `text-[10px]` typo, and a latent bug — times rendered via `toLocaleString('de-DE')` **without** a timeZone (renders in the runtime TZ, i.e. UTC on Vercel). Dead `openParam` read from `searchParams`, unused in render.

**New IA (mirrors shipped `mitarbeiter/termine` "Zeitplan", #3429):**
- **Header:** inline `<h1 text-heading-lg>Rückrufe</h1>` + `body-sm` purpose subtitle (no `PageHeader`).
- **StatBar** (`Offen · Überfällig · Ungesehen`), tone applied only when hot (`danger`/`warning` > 0); hidden when empty.
- **Überfällig band** on top: `border-danger/30`, `bg-danger-soft/50` header, oldest-first (most overdue = most urgent).
- **Relative day groups** (Heute/Morgen/Wochentag, Berlin TZ) for upcoming, each a bordered `rounded-ios-md` section with a `divide-y` body.
- **Zeit-Rail row:** `w-12` time column (tabular; overdue rows also show the date, since they're pulled out of day-context) | `border-l` node with: AAR-724 unseen red dot (`bg-danger`), name → `/dispatch/leads/{id}`, **„Als Nächstes"** marker on the single most-urgent item, `PhoneButton`, call history (`Versuche` / `Letzter`), notes. `RueckrufActions` sits right on desktop, wraps below on mobile as a **single** instance (no full-row `<Link>` — the row holds interactive buttons).

**Preserved verbatim:** query + normalization + AAR-724 mark-seen, `RueckrufeRealtimeRefresher`, `RueckrufActions` behavior, lead link.
**Fixed in passing:** TZ bug (`formatBerlin` → correct Berlin time) and dead `openParam`/`searchParams` removed.

**Why single-file / no unit test:** presentation-only change, data layer unchanged, and the grouping logic is copied from the shipped, working "Zeitplan" sibling (which itself is inlined + untested). Extracting a pure util + vitest would diverge from the sibling and add a file for near-zero risk (YAGNI). Verification = `tsc` + `token-audit` + visual render + staging PR-preview runtime smoke.

## File Structure

- **Modify:** `src/app/dispatch/rueckrufe/page.tsx` — the entire deliverable (full replacement below).
- **Untouched (documented):** `RueckrufActions.tsx`, `RueckrufeRealtimeRefresher.tsx`, `actions.ts`.

---

## Task 1: Rebuild `page.tsx` (Queue-IA) + static gates

**Files:**
- Modify (full replace): `src/app/dispatch/rueckrufe/page.tsx`

**Interfaces:**
- Consumes: `StatBar`, `StatBarItem` from `@/components/shared/StatBar`; `formatBerlin` from `@/lib/google-calendar/timezone`; `EmptyState`, `PhoneButton` (shared); local `RueckrufActions`, `RueckrufeRealtimeRefresher`.
- Produces: the default-exported `DispatchRueckrufe` async server component (route `/dispatch/rueckrufe`). No exported symbols consumed elsewhere.

- [ ] **Step 1: Replace the file with the new implementation**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RueckrufActions from './RueckrufActions'
import { RueckrufeRealtimeRefresher } from './RueckrufeRealtimeRefresher'
import PhoneButton from '@/components/shared/PhoneButton'
import EmptyState from '@/components/shared/EmptyState'
import { StatBar, type StatBarItem } from '@/components/shared/StatBar'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { PhoneOffIcon, PhoneCallIcon } from 'lucide-react'

// AAR-637: Rückrufe aus admin_termine (typ='rueckruf') lesen statt aus
// leads.rueckruf_*. Die Legacy-Spalten wurden gedroppt. Admin-Kalender-
// Rückrufe und Dispatch-Rückrufe sind jetzt dieselbe Liste.
//
// Redesign (02.07.): flache Liste -> Rückruf-Queue. Überfällige oben in einem
// eskalierten danger-Band, Kommende relativ nach Tag gruppiert (Heute/Morgen/
// Wochentag) als Zeit-Rail-Liste mit "Als Nächstes"-Marker — spiegelt die
// "Zeitplan"-Sprache aus mitarbeiter/termine. Datenschicht (Query + AAR-724
// mark-seen) unverändert; Zeiten jetzt Berlin-TZ (formatBerlin) statt naked
// toLocaleString (runtime-TZ-abhängig).

type RueckrufRow = {
  id: string
  start_zeit: string
  notizen: string | null
  lead_id: string | null
  // AAR-724: Noch nicht vom Dispatcher angesehen → roter Punkt.
  gesehen_am: string | null
  lead: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    email: string | null
    qualifizierungs_phase: string | null
    anruf_versuche: number | null
    letzter_anruf_am: string | null
    letzter_anruf_status: string | null
  } | null
}

export default async function DispatchRueckrufe() {
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('admin_termine')
    .select(
      'id, start_zeit, notizen, lead_id, gesehen_am, lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon, email, qualifizierungs_phase, anruf_versuche, letzter_anruf_am, letzter_anruf_status)',
    )
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .not('lead_id', 'is', null)
    .order('start_zeit', { ascending: true })

  const termine: RueckrufRow[] = ((raw ?? []) as unknown as RueckrufRow[]).map((t) => ({
    ...t,
    lead: Array.isArray(t.lead) ? t.lead[0] ?? null : t.lead,
  }))

  // AAR-724: Sobald der Dispatcher die Rückrufliste öffnet, markieren wir
  // alle ungesehenen Rückrufe als „gesehen". Die Render-Daten kommen aus
  // dem bereits gelesenen `termine`-Snapshot — die roten Punkte bleiben
  // für diesen Aufruf sichtbar und verschwinden beim nächsten Reload.
  const ungesehenIds = termine.filter((t) => !t.gesehen_am).map((t) => t.id)
  if (ungesehenIds.length > 0) {
    try {
      await supabase
        .from('admin_termine')
        .update({ gesehen_am: new Date().toISOString() })
        .in('id', ungesehenIds)
    } catch (err) {
      console.error('[AAR-724] mark-seen rueckrufe failed:', err)
    }
  }

  // ── Präsentation: nur Rückrufe mit Lead; Überfällige abtrennen; Rest relativ nach Tag ──
  const rows = termine.filter(
    (t): t is RueckrufRow & { lead: NonNullable<RueckrufRow['lead']> } => !!t.lead,
  )
  const now = Date.now()
  const berlinDay = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  const todayKey = berlinDay(new Date(now).toISOString())
  const tomorrowKey = berlinDay(new Date(now + 86_400_000).toISOString())

  const overdue = rows.filter((t) => new Date(t.start_zeit).getTime() < now)
  const upcoming = rows.filter((t) => new Date(t.start_zeit).getTime() >= now)
  // "Als Nächstes" = dringendstes Item: ältester Überfälliger, sonst nächster Anstehender.
  const nextId = overdue[0]?.id ?? upcoming[0]?.id ?? null
  const ungesehenCount = rows.filter((t) => !t.gesehen_am).length

  const dayGroups: { key: string; rows: typeof rows }[] = []
  for (const t of upcoming) {
    const k = berlinDay(t.start_zeit)
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.key === k) last.rows.push(t)
    else dayGroups.push({ key: k, rows: [t] })
  }
  const dayLabel = (key: string) => {
    if (key === todayKey) return 'Heute'
    if (key === tomorrowKey) return 'Morgen'
    return new Date(key + 'T12:00:00').toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  }

  const stats: StatBarItem[] = [
    { label: 'Offen', value: rows.length, icon: PhoneCallIcon },
    { label: 'Überfällig', value: overdue.length, tone: overdue.length ? 'danger' : 'default' },
    { label: 'Ungesehen', value: ungesehenCount, tone: ungesehenCount ? 'warning' : 'default' },
  ]

  // Eine Rückruf-Zeile: Zeit-Rail links (tabular), Node + Inhalt, Aktion rechts.
  // KEIN Full-Row-Link (die Zeile enthält interaktive Aktionen) — nur der Name linkt.
  function RueckrufZeile(t: (typeof rows)[number]) {
    const lead = t.lead
    const isOverdue = new Date(t.start_zeit).getTime() < now
    const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Lead'
    return (
      <div key={t.id} className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-stretch gap-3 sm:gap-4">
          {/* Zeit-Rail */}
          <div className="flex w-12 shrink-0 flex-col items-end pt-px text-right">
            <span
              className={`text-body-sm font-semibold tabular-nums ${
                isOverdue ? 'text-danger-strong' : 'text-claimondo-navy'
              }`}
            >
              {formatBerlin(t.start_zeit, { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isOverdue && (
              <span className="text-caption tabular-nums text-danger/70">
                {formatBerlin(t.start_zeit, { day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>
          {/* Node + Inhalt */}
          <div className="min-w-0 flex-1 border-l border-claimondo-border pl-3 sm:pl-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* AAR-724: Roter Punkt für noch nicht gesehene Rückrufe. */}
              {!t.gesehen_am && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-danger"
                  aria-label="Neu, noch nicht angesehen"
                />
              )}
              <Link
                href={`/dispatch/leads/${lead.id}`}
                className="truncate text-body-sm font-medium text-claimondo-navy hover:text-claimondo-ondo"
              >
                {name}
              </Link>
              {t.id === nextId && (
                <span className="rounded-full bg-claimondo-navy px-2 py-0.5 text-caption font-medium text-white">
                  Als Nächstes
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-claimondo-ondo">
              {lead.telefon && (
                <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
              )}
              {isOverdue && <span className="font-medium text-danger">überfällig</span>}
              <span>Versuche: {lead.anruf_versuche ?? 0}</span>
              {lead.letzter_anruf_am && (
                <span className="text-claimondo-ondo/70">
                  Letzter: {new Date(lead.letzter_anruf_am).toLocaleDateString('de-DE')}
                  {lead.letzter_anruf_status ? ` (${lead.letzter_anruf_status})` : ''}
                </span>
              )}
            </div>
            {t.notizen && (
              <p className="mt-0.5 truncate text-body-xs text-claimondo-ondo/70">{t.notizen}</p>
            )}
          </div>
        </div>
        {/* Aktion — mobil unter der Zeile (eine Instanz), Desktop rechts */}
        <div className="shrink-0 sm:self-center">
          <RueckrufActions leadId={lead.id} anrufVersuche={lead.anruf_versuche ?? 0} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 py-6">
      <RueckrufeRealtimeRefresher />

      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Rückrufe</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">
          Rückrufe, die auf einen Anruf warten — überfällige zuerst.
        </p>
      </div>

      {rows.length > 0 && <StatBar items={stats} />}

      {rows.length === 0 && <EmptyState icon={PhoneOffIcon} title="Keine offenen Rückrufe" />}

      {/* Überfällig — abgetrennt + priorisiert */}
      {overdue.length > 0 && (
        <section className="overflow-hidden rounded-ios-md border border-danger/30 bg-white">
          <div className="flex items-center justify-between border-b border-danger/20 bg-danger-soft/50 px-4 py-2.5">
            <h2 className="text-heading-sm font-semibold text-danger-strong">Überfällig</h2>
            <span className="text-body-sm font-medium text-danger-strong">{overdue.length}</span>
          </div>
          <div className="divide-y divide-claimondo-border">{overdue.map(RueckrufZeile)}</div>
        </section>
      )}

      {/* Kommende Rückrufe — relativ nach Tag */}
      {dayGroups.map((g) => {
        const isToday = g.key === todayKey
        return (
          <section
            key={g.key}
            className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white"
          >
            <div className="flex items-center justify-between border-b border-claimondo-border px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-heading-sm capitalize text-claimondo-navy">
                <span className={isToday ? 'font-semibold' : ''}>{dayLabel(g.key)}</span>
                {isToday && <span className="h-1.5 w-1.5 rounded-full bg-claimondo-ondo" aria-hidden />}
              </h2>
              <span className="text-body-sm text-claimondo-ondo">{g.rows.length}</span>
            </div>
            <div className="divide-y divide-claimondo-border">{g.rows.map(RueckrufZeile)}</div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Dead-code guard — confirm no consumer relies on `?open=`**

Run (from worktree): `git grep -n "rueckrufe?open" -- src/ ; git grep -n "rueckrufe\`?open" -- src/`
Expected: no matches (the removed `openParam` was never read by any linker). If a match appears, keep `searchParams` and re-open the row it referenced.

- [ ] **Step 3: Typecheck**

Run (in worktree): `npx tsc --noEmit`
Expected: exit 0, no errors referencing `rueckrufe/page.tsx`.

- [ ] **Step 4: Token-audit**

Run (in worktree): `npm run check:token-audit`
Expected: exit 0 / no NEW violations. (New code uses only `success/warning/danger` + `claimondo-*` tokens, `rounded-ios-*`/`rounded-full`, `text-heading/body/caption`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/dispatch/rueckrufe/page.tsx
git commit -m "feat(dispatch): Rueckrufe neu — Queue-IA (Ueberfaellig-Band + Tag-Gruppen + Zeit-Rail + StatBar)"
```
(Full 7-point audit block goes in the final ship commit / PR body — see Task 3.)

---

## Task 2: Visual verification (desktop + mobile)

**Files:** none committed (throwaway mockup under a temp dir).

- [ ] **Step 1: Build a faithful HTML mockup**

Because `test-dispatch`/`test-kb` fixtures may have 0 open callbacks (live route would only show the empty state) and the worktree has no `.env.local` for a real dev-server render, replicate the exact JSX class output in a standalone HTML file with representative data: ≥1 **overdue** row (danger band, „Als Nächstes", unseen dot, date sub-line), a **Heute** group, and a **Morgen** group; include the StatBar with `Überfällig`/`Ungesehen` toned. Load the app's compiled CSS so tokens resolve.

- [ ] **Step 2: Screenshot with Playwright at 1280px and 390px**

Expected: overdue band visually escalated on top; Zeit-Rail aligned/tabular; „Als Nächstes" on exactly one item; StatBar tones correct; mobile reflow keeps a single `RueckrufActions` per row; **0 console errors**. Save both screenshots for the PR.

- [ ] **Step 3: Note runtime smoke**

Definitive runtime verification = the **staging PR-preview** deploy, smoked as a real Dispatch role (per repo practice — worktree local build is env-blocked). Record this as the post-merge smoke step.

---

## Task 3: Ship — 7-point audit, PR against staging

**Files:** none new.

- [ ] **Step 1: Run the 7-point self-audit** (Build/tsc · UI-Erreichbarkeit · Redundanz · Dead-Code · Spec-Treue · Inkonsistenz · Regression) and capture the status lines.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin kitta/dispatch-rueckrufe-redesign
```

- [ ] **Step 3: Open the PR against staging** with the audit block + the 2 screenshots.

```bash
gh pr create --base staging --head kitta/dispatch-rueckrufe-redesign \
  --title "feat(dispatch): Rueckrufe-Redesign — Queue-IA (Ueberfaellig-Band, Tag-Gruppen, Zeit-Rail, StatBar)" \
  --body "<description + Audit block + screenshots>"
```

Expected: PR created; CI runs the full `next build` + ratchets. Watch the checks; ground any red `Supabase Preview` against `gh api repos/aaroncmdo/cmndo/commits/<sha>/check-runs` (known systemic-noise per memory).

---

## Self-Review

1. **Spec coverage:** Überfällig band ✓ (section), relative day groups ✓ (`dayGroups`+`dayLabel`), Zeit-Rail ✓ (`RueckrufZeile`), StatBar ✓ (`stats`), „Als Nächstes" ✓ (`nextId`), unseen dot ✓ (AAR-724 preserved), data layer verbatim ✓ (query + mark-seen unchanged), TZ fix ✓ (`formatBerlin`), dead `openParam` removed ✓. No gaps.
2. **Placeholder scan:** none — full code in Task 1; PR body placeholder is intentional (filled at ship time).
3. **Type consistency:** `rows` narrowed via type guard → `RueckrufZeile(t: (typeof rows)[number])` sees non-null `lead`; `dayGroups.rows: typeof rows`; `overdue.map(RueckrufZeile)` matches Zeitplan's proven `.map(fn)` pattern. `StatBarItem` shape (`label/value/icon?/tone?`) matches the shared component.
