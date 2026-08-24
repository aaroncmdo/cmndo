// Gewinner-Seite: /gewinn/[token]
//
// Oeffentlich per Token, kein Login (Muster: src/app/upload/dokumente/[token]).
// Der Gewinner kommt genau einmal hierher, praktisch immer am Handy.
//
// Kein SV-Branding: das Gewinnspiel ist eine Claimondo-Aktion, kein
// Whitelabel-Vorgang. Kein next-intl: deutsche Kampagne, harte Texte.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import GewinnClient from './GewinnClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ihr Gewinn | Claimondo',
  // Eine tokenisierte Personen-Seite gehoert nie in den Index.
  robots: { index: false, follow: false },
}

export default async function GewinnPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: teilnahme } = await supabase
    .from('gewinnspiel_teilnahmen')
    .select('id, status, kampagne_id, gewaehlte_praemie_id, nachweis_datei_pfad')
    .eq('nachweis_token', token)
    .maybeSingle()

  if (!teilnahme) notFound()

  const { data: kampagne } = await supabase
    .from('gewinnspiel_kampagnen')
    .select('preis_betrag_eur')
    .eq('id', teilnahme.kampagne_id)
    .maybeSingle()

  const betrag = Number(kampagne?.preis_betrag_eur ?? 50)

  // Bereits abgeschlossen? Dann kein Formular, sondern eine Einordnung — der
  // Gewinner hat seinen Teil getan bzw. der Fall ist entschieden.
  if (teilnahme.status !== 'nachweis_offen') {
    const text =
      teilnahme.status === 'bestaetigt'
        ? 'Ihr Nachweis wurde bestätigt und Ihr Gutschein ist unterwegs.'
        : teilnahme.status === 'abgelehnt'
          ? 'Dieser Gewinn wurde bereits abgeschlossen. Bei Fragen melden Sie sich gerne bei uns.'
          : 'Dieser Link ist nicht mehr gültig.'
    return (
      <main className="flex min-h-screen items-center justify-center bg-claimondo-bg p-6">
        <div className="max-w-sm rounded-ios-lg border border-claimondo-border bg-white p-7 text-center">
          <p className="text-heading-md font-bold text-claimondo-navy">Danke!</p>
          <p className="mt-3 text-body-sm leading-relaxed text-claimondo-shield/80">{text}</p>
        </div>
      </main>
    )
  }

  // Prämien nur laden, wenn noch keine gewählt wurde. Der Regelfall ist, dass
  // die Wahl schon bei der Teilnahme gefallen ist (Spec E12); dieser Zweig
  // faengt Leads aus Kanaelen ohne Auswahl-Formular ab.
  const { data: praemien } = teilnahme.gewaehlte_praemie_id
    ? { data: [] }
    : await supabase
        .from('gewinnspiel_praemien')
        .select('id, name, beschreibung')
        .eq('kampagne_id', teilnahme.kampagne_id)
        .eq('aktiv', true)
        .order('sortierung', { ascending: true })

  return (
    <GewinnClient
      token={token}
      betrag={betrag}
      hatPraemie={Boolean(teilnahme.gewaehlte_praemie_id)}
      praemien={praemien ?? []}
      hatNachweis={Boolean(teilnahme.nachweis_datei_pfad)}
    />
  )
}
