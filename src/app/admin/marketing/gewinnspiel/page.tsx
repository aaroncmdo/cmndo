// Gewinnspiel-Verwaltung — der taegliche Ein-Klick-Betrieb (Spec E4).
//
// Pattern: force-dynamic + Auth-Guard + createAdminClient(), wie
// src/app/admin/marketing/lokal-content/page.tsx.
//
// Drei Bereiche in dieser Reihenfolge, weil das die taegliche Arbeit abbildet:
// zuerst "Heute" (Kennzahlen, Welcomes, Ziehen, Pruef-Queue), dann die
// Kampagne, dann der Praemien-Katalog. Wer taeglich hier reinschaut, will
// nicht erst an Stammdaten vorbeiscrollen.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/shared/PageHeader'
import GewinnspielClient from './GewinnspielClient'

export const dynamic = 'force-dynamic'

export default async function GewinnspielAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const admin = createAdminClient()

  const { data: kampagnen } = await admin
    .from('gewinnspiel_kampagnen')
    .select('*')
    .order('start_am', { ascending: false })

  const aktive = (kampagnen ?? []).find((k) => k.aktiv) ?? null

  const { data: praemien } = aktive
    ? await admin
        .from('gewinnspiel_praemien')
        .select('*')
        .eq('kampagne_id', aktive.id)
        .order('sortierung', { ascending: true })
    : { data: [] }

  // Kennzahlen der aktiven Kampagne. head+count statt Zeilen zu laden: die
  // Zahlen sind alles, was die Oberflaeche davon braucht.
  const kampagneId = aktive?.id ?? null

  const [offen, verifiziert, unversandt, bestaetigt] = kampagneId
    ? await Promise.all([
        admin
          .from('gewinnspiel_teilnahmen')
          .select('id', { count: 'exact', head: true })
          .eq('kampagne_id', kampagneId)
          .eq('status', 'offen')
          .then((r) => r.count ?? 0),
        admin
          .from('gewinnspiel_teilnahmen')
          .select('id', { count: 'exact', head: true })
          .eq('kampagne_id', kampagneId)
          .eq('status', 'offen')
          .not('whatsapp_verifiziert_am', 'is', null)
          .then((r) => r.count ?? 0),
        admin
          .from('gewinnspiel_teilnahmen')
          .select('id', { count: 'exact', head: true })
          .eq('kampagne_id', kampagneId)
          .eq('status', 'offen')
          .is('whatsapp_gesendet_am', null)
          .then((r) => r.count ?? 0),
        admin
          .from('gewinnspiel_teilnahmen')
          .select('id', { count: 'exact', head: true })
          .eq('kampagne_id', kampagneId)
          .eq('status', 'bestaetigt')
          .then((r) => r.count ?? 0),
      ])
    : [0, 0, 0, 0]

  // Pruef-Queue: gezogene Gewinner, deren Nachweis noch offen ist.
  const { data: queue } = aktive
    ? await admin
        .from('gewinnspiel_teilnahmen')
        .select(
          'id, telefon_normalisiert, gezogen_am, nachweis_datei_pfad, nachweis_hochgeladen_am, nachweis_token, gewaehlte_praemie_id',
        )
        .eq('kampagne_id', aktive.id)
        .eq('status', 'nachweis_offen')
        .order('gezogen_am', { ascending: true })
    : { data: [] }

  const praemienListe = praemien ?? []
  const praemienNamen = new Map(praemienListe.map((p) => [p.id, p.name]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gewinnspiel"
        description="Tägliche Verlosung: Kampagne, Prämien und Ziehung"
      />
      <GewinnspielClient
        kampagnen={kampagnen ?? []}
        aktive={aktive}
        praemien={praemienListe}
        kennzahlen={{ offen, verifiziert, unversandt, bestaetigt }}
        queue={(queue ?? []).map((q) => ({
          ...q,
          praemieName: q.gewaehlte_praemie_id
            ? (praemienNamen.get(q.gewaehlte_praemie_id) ?? null)
            : null,
        }))}
      />
    </div>
  )
}
