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
          'id, telefon_normalisiert, gezogen_am, nachweis_datei_pfad, nachweis_hochgeladen_am, nachweis_token, gewaehlte_praemie_id, anfrage_id, lead_id',
        )
        .eq('kampagne_id', aktive.id)
        .eq('status', 'nachweis_offen')
        .order('gezogen_am', { ascending: true })
    : { data: [] }

  const praemienListe = praemien ?? []
  const praemienNamen = new Map(praemienListe.map((p) => [p.id, p.name]))

  // Bereits entschiedene Gewinner — der Betreiber kontaktiert und kauft manuell
  // (Aaron 23.08.), also muss er sehen, wer schon dran war. Das ist zugleich die
  // Dubletten-Kontrolle: dieselbe Person mit einer ZWEITEN Nummer faellt am Namen
  // auf, was kein Dedup-Schluessel leisten kann.
  const { data: historie } = aktive
    ? await admin
        .from('gewinnspiel_teilnahmen')
        .select('id, telefon_normalisiert, status, gezogen_am, gutschein_code, anfrage_id, lead_id')
        .eq('kampagne_id', aktive.id)
        .in('status', ['bestaetigt', 'abgelehnt'])
        .order('gezogen_am', { ascending: false })
        .limit(50)
    : { data: [] }

  // Namen und E-Mails aus der jeweiligen Quelle nachladen. Zwei getrennte
  // Queries statt eines verschachtelten Selects: bei zwei optionalen FKs waere
  // das Ergebnis je nach Cardinality Array oder Objekt (AGENTS.md §Nested-FK),
  // und diese Fallunterscheidung ist teurer als der zweite Roundtrip.
  const alle = [...(queue ?? []), ...(historie ?? [])]
  const anfrageIds = alle.map((t) => t.anfrage_id).filter((v): v is string => Boolean(v))
  const leadIds = alle.map((t) => t.lead_id).filter((v): v is string => Boolean(v))

  const kontakte = new Map<string, { name: string; email: string | null }>()

  if (anfrageIds.length > 0) {
    const { data } = await admin
      .from('gutachter_finder_anfragen')
      .select('id, vorname, nachname, email')
      .in('id', anfrageIds)
    for (const a of data ?? []) {
      kontakte.set(a.id, {
        name: `${a.vorname ?? ''} ${a.nachname ?? ''}`.trim() || '—',
        email: a.email || null,
      })
    }
  }

  if (leadIds.length > 0) {
    const { data } = await admin
      .from('leads')
      .select('id, vorname, nachname, email')
      .in('id', leadIds)
    for (const l of data ?? []) {
      kontakte.set(l.id, {
        name: `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—',
        email: l.email || null,
      })
    }
  }

  function kontaktVon(t: { anfrage_id: string | null; lead_id: string | null }) {
    const id = t.anfrage_id ?? t.lead_id
    return (id ? kontakte.get(id) : null) ?? { name: '—', email: null }
  }

  // Signierte Links auf die Nachweise. Ohne sie steht in der Queue nur
  // "hochgeladen" — der Betreiber soll das Dokument aber PRUEFEN, nicht glauben.
  const nachweisLinks = new Map<string, string>()
  for (const t of queue ?? []) {
    if (!t.nachweis_datei_pfad) continue
    const { data } = await admin.storage
      .from('fall-dokumente')
      .createSignedUrl(t.nachweis_datei_pfad, 60 * 30)
    if (data?.signedUrl) nachweisLinks.set(t.id, data.signedUrl)
  }

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
          id: q.id,
          telefon_normalisiert: q.telefon_normalisiert,
          gezogen_am: q.gezogen_am,
          nachweis_hochgeladen_am: q.nachweis_hochgeladen_am,
          nachweisUrl: nachweisLinks.get(q.id) ?? null,
          praemieName: q.gewaehlte_praemie_id
            ? (praemienNamen.get(q.gewaehlte_praemie_id) ?? null)
            : null,
          ...kontaktVon(q),
        }))}
        historie={(historie ?? []).map((h) => ({
          id: h.id,
          telefon_normalisiert: h.telefon_normalisiert,
          status: h.status,
          gezogen_am: h.gezogen_am,
          gutschein_code: h.gutschein_code,
          ...kontaktVon(h),
        }))}
      />
    </div>
  )
}
