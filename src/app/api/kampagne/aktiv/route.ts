import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/kampagne/aktiv — oeffentlicher Kampagnen-Stand.
 *
 * Eine Quelle fuer alle sieben Builds (Spec B2/E9): die Landingpage holt hier
 * den Praemien-Katalog fuer die Auswahl, die Topbar spaeter Text und An/Aus.
 * Ohne diese Route muesste der Katalog auf jeder Seite hartkodiert werden — und
 * eine Liste, die an zwei Stellen gepflegt wird, driftet garantiert.
 *
 * CORS offen (GET): die Cluster-Domains und autounfall.io sind eigene Origins.
 * Ausgeliefert werden ausschliesslich Kampagnen-Stammdaten, keine
 * personenbezogenen Daten — deshalb ist das unbedenklich.
 *
 * Kurzes s-maxage: Kampagnen-Parameter aendern sich per Admin-Klick, und ein
 * abgeschaltetes Gewinnspiel darf nicht minutenlang weiterbeworben werden.
 */

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  const supabase = createAdminClient()

  const { data: kampagne, error } = await supabase
    .from('gewinnspiel_kampagnen')
    .select('id, preise_pro_tag, preis_betrag_eur, topbar_text, topbar_cta_text, topbar_aktiv, ende_am')
    .eq('aktiv', true)
    .maybeSingle()

  if (error) {
    console.error('[kampagne/aktiv] Kampagne lesen:', error)
    // Kein 500: die Konsumenten sind Seiten-Renderings. Ein Fehler hier darf
    // eine Landingpage nicht zerlegen — sie zeigt dann eben keine Kampagne.
    return NextResponse.json({ aktiv: false }, { status: 200, headers: { ...CORS, ...CACHE } })
  }

  if (!kampagne) {
    return NextResponse.json({ aktiv: false }, { status: 200, headers: { ...CORS, ...CACHE } })
  }

  // Abgelaufene Kampagne gilt als inaktiv, auch wenn das Flag noch steht.
  // Sonst wirbt die Topbar nach dem Enddatum weiter — das ist ein
  // Rechtsproblem, kein Schoenheitsfehler.
  if (kampagne.ende_am && new Date(kampagne.ende_am) < new Date(new Date().toDateString())) {
    return NextResponse.json({ aktiv: false }, { status: 200, headers: { ...CORS, ...CACHE } })
  }

  const { data: praemien } = await supabase
    .from('gewinnspiel_praemien')
    .select('id, name, beschreibung, bild_pfad, betrag_eur')
    .eq('kampagne_id', kampagne.id)
    .eq('aktiv', true)
    .order('sortierung', { ascending: true })

  return NextResponse.json(
    {
      aktiv: true,
      preiseProTag: kampagne.preise_pro_tag,
      betragEur: Number(kampagne.preis_betrag_eur),
      topbar: {
        aktiv: kampagne.topbar_aktiv,
        text: kampagne.topbar_text,
        ctaText: kampagne.topbar_cta_text,
      },
      praemien: (praemien ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        beschreibung: p.beschreibung,
        bildPfad: p.bild_pfad,
        betragEur: Number(p.betrag_eur),
      })),
    },
    { status: 200, headers: { ...CORS, ...CACHE } },
  )
}
