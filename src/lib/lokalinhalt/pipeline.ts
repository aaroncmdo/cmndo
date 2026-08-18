import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLokalinhaltDraft } from './generate'
import { pruefeLokalinhalt } from './gate'
import { STAEDTE_STAMMDATEN, getStadtKontext, getStadtStammdaten } from './staedte'

// Erzeugt hyperlokale Ortsinhalte im Batch — die Automatik hinter dem
// Auto-Publish.
//
// WARUM DIESE DATEI: Nach dem Auto-Publish-Umbau (18.08.) konnte ein Inhalt
// zwar ohne Freigabe live gehen — ausgeloest wurde er aber weiterhin von einem
// Klick je Stadt im Admin. Bei 173 Staedten ist das kein "automatischer
// Content", und die Tabelle blieb bei 0 Zeilen. Dieselbe Luecke wie zuvor,
// nur eine Stufe frueher: alles gebaut, niemand ruft es auf.
//
// Die Logik lag in der Server-Action und war dort an `requireRole(['admin'])`
// gebunden — ein Cron hat keinen eingeloggten Nutzer. Sie liegt jetzt hier,
// ohne Auth; wer sie aufruft, bringt seine eigene mit (Admin-Guard bzw.
// Cron-Secret). Muster: `runB2BPipeline` fuer die Wissen-Artikel.

/** Wie viele Staedte ein Lauf hoechstens bearbeitet. Jede kostet einen
 *  KI-Aufruf, deshalb bewusst klein — die B2B-Pipeline faehrt aus demselben
 *  Grund "taeglich 2-3 Artikel". Bei taeglichem Lauf sind 173 Staedte in gut
 *  zwei Monaten durch. */
const STANDARD_LIMIT = 3

export type PipelineErgebnis = {
  ok: boolean
  /** Staedte ohne veroeffentlichten Inhalt VOR diesem Lauf. */
  offen: number
  versucht: number
  veroeffentlicht: string[]
  /** Gate nicht bestanden -> liegt im Review, mit Begruendung. */
  imReview: Array<{ slug: string; grund: string }>
  fehler: Array<{ slug: string; grund: string }>
}

/**
 * Ein Lauf: die naechsten `limit` Staedte ohne Inhalt erzeugen und — sofern das
 * Gate haelt — direkt veroeffentlichen.
 *
 * Reihenfolge nach Einwohnerzahl absteigend. Das ist keine Feinheit: die
 * grossen Orte tragen das meiste Suchvolumen, und viele von ihnen sind zugleich
 * Spokes der Cluster-Domains — dort wirkt derselbe Inhalt doppelt, weil beide
 * Seiten ihn lesen.
 */
export async function runLokalinhaltePipeline(
  limit = STANDARD_LIMIT,
): Promise<PipelineErgebnis> {
  const supabase = createAdminClient()
  const ergebnis: PipelineErgebnis = {
    ok: true,
    offen: 0,
    versucht: 0,
    veroeffentlicht: [],
    imReview: [],
    fehler: [],
  }

  // Welche Staedte haben schon etwas? Ein offener Entwurf zaehlt mit — sonst
  // erzeugt der naechste Lauf einen zweiten daneben und der Reviewer weiss
  // nicht, welcher gilt.
  const { data: belegt, error: ladeErr } = await supabase
    .from('stadt_lokalinhalte')
    .select('stadt_slug')
    .in('status', ['entwurf', 'in_review', 'veroeffentlicht'])
  if (ladeErr) {
    return { ...ergebnis, ok: false, fehler: [{ slug: '-', grund: ladeErr.message }] }
  }

  const hatInhalt = new Set((belegt ?? []).map((z) => z.stadt_slug))
  const offen = [...STAEDTE_STAMMDATEN]
    .filter((s) => !hatInhalt.has(s.slug))
    .sort((a, b) => einwohner(b.bevoelkerung) - einwohner(a.bevoelkerung) || a.slug.localeCompare(b.slug))

  ergebnis.offen = offen.length

  for (const stadt of offen.slice(0, Math.max(limit, 0))) {
    ergebnis.versucht++
    const treffer = await erzeugeFuerEineStadt(supabase, stadt.slug)
    if (treffer.art === 'veroeffentlicht') ergebnis.veroeffentlicht.push(stadt.slug)
    else if (treffer.art === 'review') ergebnis.imReview.push({ slug: stadt.slug, grund: treffer.grund })
    else ergebnis.fehler.push({ slug: stadt.slug, grund: treffer.grund })
  }

  return ergebnis
}

export type EinzelErgebnis =
  | { art: 'veroeffentlicht'; verworfen: string[]; substanzScore: number }
  | { art: 'review'; grund: string; verworfen: string[]; substanzScore: number }
  | { art: 'fehler'; grund: string }

/**
 * Eine Stadt: generieren, pruefen, ablegen.
 *
 * Genau der Weg, den auch die Admin-Action nimmt — dieselbe Reihenfolge,
 * dasselbe Gate, dieselbe Archivierung. Zwei Implementierungen davon waeren
 * die Sorte Redundanz, die spaeter auseinanderlaeuft.
 */
export async function erzeugeFuerEineStadt(
  supabase: ReturnType<typeof createAdminClient>,
  stadtSlug: string,
): Promise<EinzelErgebnis> {
  const stadt = getStadtStammdaten(stadtSlug)
  const kontext = getStadtKontext(stadtSlug)
  if (!stadt || !kontext) return { art: 'fehler', grund: `Unbekannte Stadt: ${stadtSlug}` }

  const erzeugt = await generateLokalinhaltDraft(kontext)
  if (!erzeugt.ok) return { art: 'fehler', grund: erzeugt.error }

  const befund = pruefeLokalinhalt(erzeugt.data, stadt.name)
  const jetzt = new Date().toISOString()

  const zeile = {
    stadt_slug: stadtSlug,
    stadtbezirke: befund.bereinigt.stadtbezirke,
    hauptachsen: befund.bereinigt.hauptachsen,
    unfall_hotspots: befund.bereinigt.unfallHotspots,
    lokale_faqs: befund.bereinigt.lokaleFaqs,
    hero_anker: befund.bereinigt.heroAnker ?? null,
    topografie_anker: befund.bereinigt.topografieAnker ?? null,
    substanz_score: befund.substanzScore,
    ai_generated: true,
    ai_model: erzeugt.data.ai_model,
  }

  if (!befund.ok) {
    const { error } = await supabase
      .from('stadt_lokalinhalte')
      .insert({ ...zeile, status: 'in_review' })
    if (error) return { art: 'fehler', grund: error.message }
    return {
      art: 'review',
      grund: befund.gruende.join(' · '),
      verworfen: befund.verworfen,
      substanzScore: befund.substanzScore,
    }
  }

  // Der partielle Unique-Index laesst nur EINE veroeffentlichte Zeile je Stadt
  // zu — die alte muss vorher weichen.
  const { error: archivErr } = await supabase
    .from('stadt_lokalinhalte')
    .update({ status: 'archiviert', updated_at: jetzt })
    .eq('stadt_slug', stadtSlug)
    .eq('status', 'veroeffentlicht')
  if (archivErr) return { art: 'fehler', grund: archivErr.message }

  const { error } = await supabase
    .from('stadt_lokalinhalte')
    .insert({ ...zeile, status: 'veroeffentlicht', veroeffentlicht_am: jetzt })
  if (error) return { art: 'fehler', grund: error.message }
  return { art: 'veroeffentlicht', verworfen: befund.verworfen, substanzScore: befund.substanzScore }
}

/** Einwohnerzahl aus dem gepflegten Anzeigestring ("165 Tsd.", "1,1 Mio."). */
function einwohner(bevoelkerung: string): number {
  const t = bevoelkerung.match(/^\s*([\d.,]+)\s*(Tsd|Mio)/)
  if (!t) return 0
  const zahl = Number.parseFloat(t[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(zahl) ? zahl * (t[2] === 'Mio' ? 1_000_000 : 1_000) : 0
}
