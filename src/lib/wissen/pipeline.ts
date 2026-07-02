// B2B Content-Pipeline Orchestrierung.
//
// Verantwortlich fuer:
//   1. Crawlen aller B2B_CRAWL_SOURCES (RSS-Feeds)
//   2. Deduplication via source_hash in wissen_themen
//   3. AI-Generierung von Artikeln fuer freigegbene Themen (audience='b2b')
//   4. Validierungs-Gate (validateForAutoPublish) -> auto-publish oder in_review
//
// NICHT 'use server' — normale lib-Funktion, aufrufbar aus Cron-Route.
// Alle DB-Ops via service-role (createAdminClient).

import { createAdminClient } from '@/lib/supabase/admin'
import { B2B_CRAWL_SOURCES } from '@/lib/wissen/crawl/sources'
import { crawlSource, sourceHash } from '@/lib/wissen/crawl/index'
import { isRelevantB2B } from '@/lib/wissen/crawl/relevance'
import { generateArtikelDraft } from '@/lib/wissen/generate'
import { validateForAutoPublish } from '@/lib/wissen/validate'

const CRAWL_CAP = 10 // Maximale neue Themen pro Lauf
const GENERATE_LIMIT = 3 // Maximale neue Artikel pro Lauf

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

      let items
      try {
        items = await crawlSource(source)
      } catch (err) {
        console.error(`[b2b-pipeline] crawlSource(${source.name}) fehlgeschlagen:`, err)
        continue
      }

      for (const item of items) {
        if (newThemenThisRun >= CRAWL_CAP) break

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
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2+3: Generate, Validate, Insert Artikel
    // -----------------------------------------------------------------------

    // Schritt 1: Kandidaten-Themen laden (neueste zuerst, bounded auf 20).
    // "Newest first" stellt sicher, dass frisch gecrawlte Themen vorne stehen.
    const { data: kandidaten, error: themenErr } = await supabase
      .from('wissen_themen')
      .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ, source_url')
      .eq('audience', 'b2b')
      .eq('status', 'freigegeben')
      .order('created_at', { ascending: false })
      .limit(20)

    if (themenErr) {
      console.error('[b2b-pipeline] Themen-Query fehlgeschlagen:', themenErr.message)
      return { ok: true, crawled, generated, published, review }
    }

    // Schritt 2: Belegte Themen-IDs nur aus dem Kandidaten-Set abfragen (IN-list <= 20).
    // Scoped-Query verhindert unbounded SELECT auf wissen_artikel.
    // Der Normalfall (status='entwurf_erstellt' nach Artikel-Insert) schirmt doppeltes
    // Verarbeiten schon im .eq('status','freigegeben')-Filter ab; diese Set-Pruefung
    // sichert den seltenen Fehlerfall ab (Status-Update fehlgeschlagen).
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

    // Schritt 3: Kandidaten ohne Artikel filtern, auf GENERATE_LIMIT begrenzen.
    const themen = (kandidaten ?? []).filter((t) => !belegteSet.has(t.id)).slice(0, GENERATE_LIMIT)

    for (const thema of themen ?? []) {
      // AI-Draft generieren
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
        console.error(`[b2b-pipeline] generateArtikelDraft fehlgeschlagen (thema ${thema.id}):`, r.error)
        continue
      }

      const draft = r.data
      const v = validateForAutoPublish({ body: draft.body })

      const now = new Date().toISOString()
      const artikelStatus = v.autopublish ? 'veroeffentlicht' : 'in_review'

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
          quelle: 'crawl',
          source_url: thema.source_url,
          author: 'claimondo-redaktion',
          ai_model: draft.ai_model,
          ai_generated: true,
          status: artikelStatus,
          veroeffentlicht_am: v.autopublish ? now : null,
        })
      }

      let insertResult = await insertArtikel(draft.slug)

      if (insertResult.error?.code === '23505') {
        // Slug-Suffix: Laenge auf max. 80 Zeichen kappen (Constraint ^[a-z0-9-]{3,80}$).
        insertResult = await insertArtikel(`${draft.slug.slice(0, 78)}-2`)
      }

      if (insertResult.error) {
        console.error(
          `[b2b-pipeline] Artikel-Insert fehlgeschlagen (thema ${thema.id}):`,
          insertResult.error.message,
        )
        continue
      }

      generated++
      if (v.autopublish) {
        published++
      } else {
        review++
      }

      // Thema-Status aktualisieren — non-critical (kein Abbruch bei Fehler)
      const { error: themaUpdateErr } = await supabase
        .from('wissen_themen')
        .update({ status: 'entwurf_erstellt' })
        .eq('id', thema.id)

      if (themaUpdateErr) {
        console.error(
          `[b2b-pipeline] Thema-Status-Update fehlgeschlagen (thema ${thema.id}):`,
          themaUpdateErr.message,
        )
      }
    }

    return { ok: true, crawled, generated, published, review }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[b2b-pipeline] Unerwarteter Fehler:', err)
    return { ok: false, crawled, generated, published, review, error: msg }
  }
}
