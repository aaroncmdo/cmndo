// B2B Content-Pipeline Orchestrierung.
//
// Verantwortlich fuer:
//   1. Crawlen aller B2B_CRAWL_SOURCES (RSS-Feeds)
//   2. Deduplication via source_hash in wissen_themen
//   3. Getierte AI-Generierung (Crawl -> Manuell -> Evergreen) mit garantiertem Tages-Boden
//   4. Validierungs-Gate (validateForAutoPublish) -> auto-publish oder in_review
//
// Evergreen-Autopilot: reicht der frische Crawl nicht fuer den Tages-Boden, fuellt
// ein KI-Themen-Planer (proposeGapTopics) eine ai_gap-Queue auf -> garantiert taegliche
// Artikel, KI-autonom, ohne Kuratierpflicht. Manuelle Vorschlaege (quelle='manuell')
// werden vor Evergreen bevorzugt.
//
// NICHT 'use server' — normale lib-Funktion, aufrufbar aus Cron-Route.
// Alle DB-Ops via service-role (createAdminClient).

import { createAdminClient } from '@/lib/supabase/admin'
import { B2B_CRAWL_SOURCES } from '@/lib/wissen/crawl/sources'
import { crawlSource, sourceHash } from '@/lib/wissen/crawl/index'
import { isRelevantB2B } from '@/lib/wissen/crawl/relevance'
import { generateArtikelDraft } from '@/lib/wissen/generate'
import { validateForAutoPublish } from '@/lib/wissen/validate'
import { proposeGapTopics } from '@/lib/wissen/propose'
import {
  orderCandidates,
  evergreenRefillCount,
  shouldStopEvergreen,
  articleQuelleForThema,
  type PlanThema,
} from '@/lib/wissen/pipeline-plan'

const CRAWL_CAP = 16 // Maximale neue Themen pro Lauf (global) — hoch fuer mehr frische News
const PER_SOURCE_CAP = 5 // Maximale neue Themen pro Quelle/Lauf — Gold-Quellen (Captain-HUK) nicht aushungern; verhindert, dass eine
// breite Quelle (z.B. allg. Rechtsnews) das Crawl-Budget frisst und Kfz-Feeds verhungern.
const DAILY_MAX = 5 // Maximale PUBLIZIERTE Artikel pro Lauf (Deckel) — Crawl-Prioritaet hoch
const DAILY_MIN = 2 // Garantierter Tages-Boden — via Evergreen aufgefuellt, falls Crawl/Manuell nicht reichen.
const CRAWL_ATTEMPT_CAP = 10 // KI-Versuche fuer tagesaktuelle Crawl+Manuell-Themen (Kosten-/Zeitgrenze).
const EVERGREEN_ATTEMPT_CAP = 6 // Eigenes KI-Budget fuer den Evergreen-Boden — unabhaengig von Phase 2a,
// damit in_review-Artikel aus 2a den garantierten Boden nicht aushungern (Gesamt-Budget = 12, wie zuvor).
const EVERGREEN_TARGET = 6 // Vorrats-Queue voraus (>= DAILY_MIN) — haelt das Veto-Fenster im Admin offen.

type Db = ReturnType<typeof createAdminClient>

// Titel + primary_keyword aller B2B-Artikel + offener ai_gap/manuell-Themen — fuer die
// Coverage-Avoidance des Themen-Planers (verhindert Wiederholungen).
async function ladeCovered(supabase: Db): Promise<{ titles: string[]; keywords: string[] }> {
  const titles: string[] = []
  const keywords: string[] = []

  const { data: artikel } = await supabase
    .from('wissen_artikel')
    .select('title, primary_keyword')
    .eq('audience', 'b2b')
    .limit(500)
  for (const a of artikel ?? []) {
    if (a.title) titles.push(a.title)
    if (a.primary_keyword) keywords.push(a.primary_keyword)
  }

  const { data: themen } = await supabase
    .from('wissen_themen')
    .select('titel, primary_keyword')
    .eq('audience', 'b2b')
    .in('status', ['freigegeben', 'entwurf_erstellt'])
    .limit(500)
  for (const t of themen ?? []) {
    if (t.titel) titles.push(t.titel)
    if (t.primary_keyword) keywords.push(t.primary_keyword)
  }

  return { titles, keywords }
}

// Proponiert bis zu `count` Evergreen-Themen (coverage-aware) und legt sie als ai_gap/freigegeben an.
// Gibt die neu angelegten Zeilen zurueck (fuer den Evergreen-Pool des laufenden Laufs).
async function proposeUndInsert(supabase: Db, count: number): Promise<PlanThema[]> {
  if (count <= 0) return []
  const covered = await ladeCovered(supabase)
  const r = await proposeGapTopics(count, covered)
  if (!r.ok) {
    console.error('[b2b-pipeline] proposeGapTopics fehlgeschlagen:', r.error)
    return []
  }
  const inserted: PlanThema[] = []
  for (const topic of r.data.slice(0, count)) {
    const { data, error } = await supabase
      .from('wissen_themen')
      .insert({
        titel: topic.titel,
        kurzbrief: topic.kurzbrief,
        begruendung: null,
        audience: 'b2b',
        quelle: 'ai_gap',
        primary_keyword: topic.primary_keyword,
        cluster: topic.cluster,
        artikel_typ: topic.artikel_typ ?? null,
        status: 'freigegeben',
      })
      .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ, source_url, quelle, created_at')
      .single()
    if (error) {
      console.error('[b2b-pipeline] ai_gap-Thema-Insert fehlgeschlagen:', error.message)
      continue
    }
    if (data) inserted.push(data as PlanThema)
  }
  return inserted
}

// Generiert einen Draft fuer EIN Thema, validiert und speichert ihn. Reused von Phase 2a + 2b.
// Rueckgabe = Outcome; der Caller zaehlt die Counter (published/review) je nach Ergebnis.
async function generiereUndSpeichere(
  supabase: Db,
  thema: PlanThema,
): Promise<'published' | 'review' | 'rejected' | 'error'> {
  const r = await generateArtikelDraft(
    {
      titel: thema.titel,
      kurzbrief: thema.kurzbrief ?? undefined,
      primary_keyword: thema.primary_keyword ?? undefined,
      cluster: thema.cluster ?? undefined,
      artikel_typ: thema.artikel_typ ?? undefined,
    },
    'b2b',
  )

  if (!r.ok) {
    // KI-Relevanz-Backstop: themenfremdes Thema ablehnen, damit es nicht taeglich neu generiert wird.
    if (r.error === 'nicht_relevant') {
      await supabase.from('wissen_themen').update({ status: 'abgelehnt' }).eq('id', thema.id)
    }
    console.error(`[b2b-pipeline] generateArtikelDraft fehlgeschlagen (thema ${thema.id}):`, r.error)
    return 'rejected'
  }

  const draft = r.data
  const v = validateForAutoPublish({ body: draft.body })
  const now = new Date().toISOString()
  const artikelStatus = v.autopublish ? 'veroeffentlicht' : 'in_review'
  const artikelQuelle = articleQuelleForThema(thema.quelle)

  // Artikel einfuegen — bei Slug-Kollision (23505) einmal mit '-2' Suffix retry
  async function insertArtikel(slug: string): Promise<{ error: { code: string; message: string } | null }> {
    return supabase.from('wissen_artikel').insert({
      thema_id: thema.id,
      slug,
      title: draft.title,
      body: draft.body,
      excerpt: draft.excerpt,
      key_facts: draft.keyFacts,
      meta_description: draft.metaDescription,
      primary_keyword: draft.primaryKeyword,
      cluster: draft.cluster,
      tags: draft.tags,
      audience: 'b2b',
      quelle: artikelQuelle,
      source_url: thema.source_url,
      author: 'claimondo-redaktion',
      ai_model: draft.ai_model,
      ai_generated: true,
      status: artikelStatus,
      veroeffentlicht_am: v.autopublish ? now : null,
      last_modified: v.autopublish ? now.slice(0, 10) : null,
    })
  }

  let insertResult = await insertArtikel(draft.slug)
  if (insertResult.error?.code === '23505') {
    // Slug-Suffix: Laenge auf max. 80 Zeichen kappen (Constraint ^[a-z0-9-]{3,80}$).
    insertResult = await insertArtikel(`${draft.slug.slice(0, 78)}-2`)
  }
  if (insertResult.error) {
    console.error(`[b2b-pipeline] Artikel-Insert fehlgeschlagen (thema ${thema.id}):`, insertResult.error.message)
    return 'error'
  }

  // Thema-Status aktualisieren — non-critical (kein Abbruch bei Fehler)
  const { error: themaUpdateErr } = await supabase
    .from('wissen_themen')
    .update({ status: 'entwurf_erstellt' })
    .eq('id', thema.id)
  if (themaUpdateErr) {
    console.error(`[b2b-pipeline] Thema-Status-Update fehlgeschlagen (thema ${thema.id}):`, themaUpdateErr.message)
  }

  return v.autopublish ? 'published' : 'review'
}

export async function runB2BPipeline(): Promise<{
  ok: boolean
  crawled: number
  generated: number
  published: number
  review: number
  error?: string
}> {
  let crawled = 0
  let generated = 0
  let published = 0
  let review = 0

  const supabase = createAdminClient()

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Crawl
    // -----------------------------------------------------------------------
    let newThemenThisRun = 0

    for (const source of B2B_CRAWL_SOURCES) {
      if (newThemenThisRun >= CRAWL_CAP) break
      let sourceCount = 0

      let items
      try {
        items = await crawlSource(source)
      } catch (err) {
        console.error(`[b2b-pipeline] crawlSource(${source.name}) fehlgeschlagen:`, err)
        continue
      }

      for (const item of items) {
        if (newThemenThisRun >= CRAWL_CAP || sourceCount >= PER_SOURCE_CAP) break

        const hash = sourceHash(item.link)

        // Relevanz-Filter: themenfremde Items (Medienrecht, Steuern, ...) ueberspringen
        if (!isRelevantB2B({ title: item.title, summary: item.summary })) continue

        // Deduplizieren: existiert dieser Hash bereits?
        const { data: existing, error: checkErr } = await supabase
          .from('wissen_themen')
          .select('id')
          .eq('source_hash', hash)
          .maybeSingle()

        if (checkErr) {
          console.error(`[b2b-pipeline] Dedup-Check fehlgeschlagen (${item.link}):`, checkErr.message)
          continue
        }
        if (existing) continue // Bereits bekannt

        // Neues Thema anlegen
        const { error: insertErr } = await supabase.from('wissen_themen').insert({
          titel: item.title,
          kurzbrief: `${item.summary}\n\nQuelle: ${item.link}`,
          begruendung: null,
          audience: 'b2b',
          quelle: 'crawl',
          source_url: item.link,
          source_name: item.sourceName,
          source_hash: hash,
          cluster: item.sourceName,
          status: 'freigegeben',
        })

        if (insertErr) {
          // 23505 = unique constraint (race condition) — kein echter Fehler
          if (insertErr.code === '23505') continue
          console.error(`[b2b-pipeline] Thema-Insert fehlgeschlagen (${item.link}):`, insertErr.message)
          continue
        }

        crawled++
        newThemenThisRun++
        sourceCount++
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2: Generate (getiert Crawl -> Manuell -> Evergreen, mit garantiertem Tages-Boden)
    // -----------------------------------------------------------------------

    // Kandidaten-Themen laden (freigegeben, b2b, bounded auf 40).
    const { data: kandidaten, error: themenErr } = await supabase
      .from('wissen_themen')
      .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ, source_url, quelle, created_at')
      .eq('audience', 'b2b')
      .eq('status', 'freigegeben')
      .order('created_at', { ascending: false })
      .limit(40)

    if (themenErr) {
      console.error('[b2b-pipeline] Themen-Query fehlgeschlagen:', themenErr.message)
      return { ok: true, crawled, generated, published, review }
    }

    // Belegte Themen ausschliessen (scoped IN-list) — schirmt seltenen Status-Update-Fehlerfall ab.
    const kandidatenIds = (kandidaten ?? []).map((t) => t.id)
    let belegteSet = new Set<string>()
    if (kandidatenIds.length > 0) {
      const { data: belegteThemen, error: belegteErr } = await supabase
        .from('wissen_artikel')
        .select('thema_id')
        .in('thema_id', kandidatenIds)

      if (belegteErr) {
        console.error('[b2b-pipeline] Belegte-Themen-Query fehlgeschlagen:', belegteErr.message)
        return { ok: true, crawled, generated, published, review }
      }

      belegteSet = new Set(
        (belegteThemen ?? [])
          .map((r: { thema_id: string | null }) => r.thema_id)
          .filter((id): id is string => id !== null),
      )
    }

    const offen = ((kandidaten ?? []) as PlanThema[]).filter((t) => !belegteSet.has(t.id))
    const byDesc = (a: PlanThema, b: PlanThema) => (a.created_at < b.created_at ? 1 : -1)
    const byAsc = (a: PlanThema, b: PlanThema) => (a.created_at < b.created_at ? -1 : 1)
    const crawlPool = offen.filter((t) => t.quelle === 'crawl').sort(byDesc)
    const manuellPool = offen.filter((t) => t.quelle === 'manuell').sort(byAsc)
    let evergreenPool = offen.filter((t) => t.quelle === 'ai_gap').sort(byAsc)

    // Evergreen-Queue auffuellen: deckt den Boden UND haelt Vorrat voraus (Veto-Fenster).
    // Konsumiert wird von vorne (FIFO) -> frisch Proponiertes hinten publiziert erst an Folgetagen.
    const refill = evergreenRefillCount(evergreenPool.length, EVERGREEN_TARGET)
    if (refill > 0) {
      const neu = await proposeUndInsert(supabase, refill)
      evergreenPool = [...evergreenPool, ...neu]
    }

    // Phase 2a: Crawl + Manuell (tagesaktuell) — opportunistisch bis DAILY_MAX publiziert.
    const order2a = orderCandidates({ crawl: crawlPool, manuell: manuellPool, evergreen: [] })
    let crawlAttempts = 0
    for (const thema of order2a) {
      if (published >= DAILY_MAX || crawlAttempts >= CRAWL_ATTEMPT_CAP) break
      crawlAttempts++
      const outcome = await generiereUndSpeichere(supabase, thema)
      if (outcome === 'published') {
        published++
        generated++
      } else if (outcome === 'review') {
        review++
        generated++
      }
    }

    // Phase 2b: Evergreen-Boden — GARANTIERT bis published >= DAILY_MIN, mit eigenem Budget.
    // Unabhaengig von Phase 2a: in_review-Artikel aus 2a duerfen den Boden nicht aushungern.
    let evergreenAttempts = 0
    for (const thema of evergreenPool) {
      if (published >= DAILY_MAX || evergreenAttempts >= EVERGREEN_ATTEMPT_CAP) break
      // Evergreen nur bis zum Tages-Boden ziehen (nicht ueberpublizieren).
      if (shouldStopEvergreen(thema.quelle, published, DAILY_MIN)) break
      evergreenAttempts++
      const outcome = await generiereUndSpeichere(supabase, thema)
      if (outcome === 'published') {
        published++
        generated++
      } else if (outcome === 'review') {
        review++
        generated++
      }
    }

    return { ok: true, crawled, generated, published, review }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[b2b-pipeline] Unerwarteter Fehler:', err)
    return { ok: false, crawled, generated, published, review, error: msg }
  }
}
