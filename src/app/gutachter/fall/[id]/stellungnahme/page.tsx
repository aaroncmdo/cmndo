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

  // CMM-44 SP-H PR2: technische_stellungnahme_status/_beauftragt_am leben auf
  // auftraege (aktueller Auftrag) — via Nested-Embed unter claims. Pre-launch
  // <=1 Auftrag pro Claim.
  const { data: fall } = await supabase
    .from('faelle')
    .select(
      // CMM-44 SP-I3: vs_kuerzung_grund + kuerzungs_betrag leben auf kanzlei_faelle (1:1) — Nested-Embed unter claims.
      'id, claims:claim_id(claim_nummer, auftraege(technische_stellungnahme_status, technische_stellungnahme_beauftragt_am), kanzlei_faelle(vs_kuerzung_grund, kuerzungs_betrag))',
    )
    .eq('id', id)
    .eq('sv_id', sv.id)
    .maybeSingle()

  if (!fall) notFound()

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  // CMM-44 SP-I3: vs_kuerzung_grund + kuerzungs_betrag aus dem kanzlei_faelle-Embed (1:1, Array-normalisiert).
  const fallKf = Array.isArray((fallClaim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle)
    ? (fallClaim as { kanzlei_faelle: unknown[] }).kanzlei_faelle[0]
    : (fallClaim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle
  const fallAuftraege = Array.isArray(
    (fallClaim as { auftraege?: unknown } | null)?.auftraege,
  )
    ? ((fallClaim as { auftraege: unknown[] }).auftraege)
    : ((fallClaim as { auftraege?: unknown } | null)?.auftraege
        ? [(fallClaim as { auftraege: unknown }).auftraege]
        : [])
  const aktAuftrag =
    (fallAuftraege[0] as
      | { technische_stellungnahme_status?: string | null; technische_stellungnahme_beauftragt_am?: string | null }
      | undefined) ?? null

  if (aktAuftrag?.technische_stellungnahme_status === 'hochgeladen' || aktAuftrag?.technische_stellungnahme_status === 'freigegeben') {
    redirect(`/gutachter/fall/${id}`)
  }

  if (aktAuftrag?.technische_stellungnahme_status !== 'beauftragt') {
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
      fallNummer={((fallClaim as { claim_nummer?: string | null } | null)?.claim_nummer) ?? null}
      beauftragAm={(aktAuftrag?.technische_stellungnahme_beauftragt_am as string | null) ?? null}
      vsKuerzungGrund={((fallKf as { vs_kuerzung_grund?: string | null } | null)?.vs_kuerzung_grund) ?? null}
      kuerzungsBetrag={(fallKf as { kuerzungs_betrag?: number | null } | null)?.kuerzungs_betrag != null ? Number((fallKf as { kuerzungs_betrag: number }).kuerzungs_betrag) : null}
      kuerzungen={kuerzungen}
    />
  )
}
