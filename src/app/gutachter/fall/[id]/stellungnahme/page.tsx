import { createClient } from '@/lib/supabase/server'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
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
  // CMM-49 (faelle-Drop-Runway): Anchor faelle_claim_bridge + claims!inner; sv-Filter via embedded
  // claims.sv_id (SSoT div=0).
  // Golden-Path-Fund (08.07.): Read über die claims-TABELLE (faelle_claim_bridge->claims!inner),
  // NICHT über v_claim_base — v_claim_base ist NICHT an `authenticated` granted (permission denied für
  // den SV; die Fallseite nutzt v_faelle_mit_aktuellem_termin, DAS ist granted). Der frühere SV-Bug
  // (leer -> notFound, seit #3816 sichtbar) lag an der claims-TABELLEN-RLS OHNE SV-Pfad — behoben durch
  // die additive Policy claims_sv_own_select (Mig 20260708081102). Damit liefert claims!inner für den SV.
  const { data: fallRaw } = await supabase
    .from('faelle_claim_bridge')
    .select(
      'claims:claims!fk_bridge_claim!inner(sv_id, claim_nummer, auftraege(technische_stellungnahme_status, technische_stellungnahme_beauftragt_am), kanzlei_faelle(vs_kuerzung_grund, kuerzungs_betrag))',
    )
    .eq('fall_id', id)
    .eq('claims.sv_id', sv.id)
    .maybeSingle()
  const fall = fallRaw as unknown as { claims: Record<string, unknown> | Record<string, unknown>[] | null } | null

  if (!fall) notFound()

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
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
    // CMM-49: forderungspositionen ist claim-gekeyt; interim faelle.claim_id-Lookup
    // (oben wird claim_id nur als Nested-Embed geladen, nicht als Flat-Spalte).
    const fpClaimId = await resolveClaimId(supabase, id)
    const { data: fp } = await supabase
      .from('forderungspositionen')
      .select('id, typ, bezeichnung, betrag_gefordert, betrag_reguliert, betrag_gekuerzt')
      .eq('claim_id', fpClaimId ?? '00000000-0000-0000-0000-000000000000')
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
