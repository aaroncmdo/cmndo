import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect, notFound } from 'next/navigation'
import StellungnahmeClient from './StellungnahmeClient'

// AAR-559 (C10): Dedizierte Seite für technische Stellungnahme-Einreichung.
// Nur zugänglich wenn technische_stellungnahme_status = 'beauftragt' und
// der eingeloggte SV = sv_id des Falls.

export default async function StellungnahmePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) notFound()

  const { data: fall } = await supabase
    .from('faelle')
    .select(
      'id, fall_nummer, technische_stellungnahme_status, technische_stellungnahme_beauftragt_am, vs_kuerzung_grund, kuerzungs_betrag',
    )
    .eq('id', id)
    .eq('sv_id', sv.id)
    .maybeSingle()

  if (!fall) notFound()

  if (fall.technische_stellungnahme_status === 'hochgeladen' || fall.technische_stellungnahme_status === 'freigegeben') {
    redirect(`/gutachter/fall/${id}`)
  }

  if (fall.technische_stellungnahme_status !== 'beauftragt') {
    notFound()
  }

  // Kürzungs-Positionen für Kontext laden
  let kuerzungen: {
    id: string
    typ: string | null
    bezeichnung: string | null
    betrag_gefordert: number | null
    betrag_reguliert: number | null
    betrag_gekuerzt: number | null
  }[] = []

  try {
    const { data: fp } = await supabase
      .from('forderungspositionen')
      .select('id, typ, bezeichnung, betrag_gefordert, betrag_reguliert, betrag_gekuerzt')
      .eq('fall_id', id)
      .order('erstellt_am', { ascending: true })
    kuerzungen = (fp ?? []).map((p) => ({
      id: p.id as string,
      typ: (p.typ as string | null) ?? null,
      bezeichnung: (p.bezeichnung as string | null) ?? null,
      betrag_gefordert: p.betrag_gefordert != null ? Number(p.betrag_gefordert) : null,
      betrag_reguliert: p.betrag_reguliert != null ? Number(p.betrag_reguliert) : null,
      betrag_gekuerzt: p.betrag_gekuerzt != null ? Number(p.betrag_gekuerzt) : null,
    }))
  } catch {
    /* forderungspositionen kann fehlen — UI fällt auf vs_kuerzung_grund zurück */
  }

  return (
    <StellungnahmeClient
      fallId={id}
      fallNummer={(fall.fall_nummer as string | null) ?? null}
      beauftragAm={(fall.technische_stellungnahme_beauftragt_am as string | null) ?? null}
      vsKuerzungGrund={(fall.vs_kuerzung_grund as string | null) ?? null}
      kuerzungsBetrag={fall.kuerzungs_betrag != null ? Number(fall.kuerzungs_betrag) : null}
      kuerzungen={kuerzungen}
    />
  )
}
