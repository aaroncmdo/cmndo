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
  // Golden-Path-Fund (08.07.): SV liest die Claim-Daten über v_claim_base (SECURITY-DEFINER,
  // claim_sichtbar_fuer_aktuellen_user-gated — die Fn HAT einen sv_id-Pfad), NICHT über einen rohen
  // faelle_claim_bridge->claims!inner-Embed. Grund: die *claims-Tabellen*-RLS hat KEINEN SV-Pfad
  // (nur kunde/dispatch/party/admin/kb) → der !inner-Join lieferte für den SV leer → notFound →
  // der seit #3816 wieder erreichbare "Stellungnahme einreichen"-CTA führte für JEDEN SV ins Leere.
  // v_claim_base ist SV-lesbar (wie die Fallseite) und projiziert alle benötigten Felder flach.
  const { data: fallRaw } = await supabase
    .from('v_claim_base')
    .select(
      'sv_id, claim_nummer, technische_stellungnahme_status, technische_stellungnahme_beauftragt_am, vs_kuerzung_grund, kuerzungs_betrag',
    )
    .eq('fall_id', id)
    .eq('sv_id', sv.id)
    .maybeSingle()
  const fall = fallRaw as unknown as {
    sv_id: string | null
    claim_nummer: string | null
    technische_stellungnahme_status: string | null
    technische_stellungnahme_beauftragt_am: string | null
    vs_kuerzung_grund: string | null
    kuerzungs_betrag: number | null
  } | null

  if (!fall) notFound()

  const stStatus = fall.technische_stellungnahme_status
  if (stStatus === 'hochgeladen' || stStatus === 'freigegeben') {
    redirect(`/gutachter/fall/${id}`)
  }
  if (stStatus !== 'beauftragt') {
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
      fallNummer={fall.claim_nummer}
      beauftragAm={fall.technische_stellungnahme_beauftragt_am}
      vsKuerzungGrund={fall.vs_kuerzung_grund}
      kuerzungsBetrag={fall.kuerzungs_betrag != null ? Number(fall.kuerzungs_betrag) : null}
      kuerzungen={kuerzungen}
    />
  )
}
