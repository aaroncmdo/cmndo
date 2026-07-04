// AAR-698: Termin-Detail-View für Kunden — alles was vor dem Termin
// interessiert: Datum, Status, Gutachter-Karte, Karte/Route, Live-Tracking-
// Hinweis (wenn SV unterwegs), Quick-Link in die Fallakte.
//
// Pfad-Konvention: `/kunde/termine/<id>` — auth-required (im Gegensatz zur
// public `/kunde/termin/<token>` Tracking-Page für Drittpersonen).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSvKontakt } from '@/lib/kunde/get-kontakt'
import { redirect, notFound } from 'next/navigation'
import KundeTerminDetailClient from './KundeTerminDetailClient'

export const dynamic = 'force-dynamic'

export default async function KundeTerminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Termin laden — Ownership wird via Fall-Lookup geprüft.
  // Single-line SELECT-String wegen Supabase-Type-Inferenz (multi-line concat
  // wird als GenericStringError typisiert und alle .property-Zugriffe brechen).
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine selbst (SSoT).
  const { data: termin } = await admin
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id statt sv_id (value-identisch für SV-Termine).
    .select('id, status, start_zeit, end_zeit, assignee_id, fall_id, lead_id, kanal, typ, kunden_tracking_token, sv_unterwegs_seit, sv_eta_minuten, sv_angekommen_am, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, ablehnen_token, besichtigungsort_adresse')
    .eq('id', id)
    .maybeSingle()
  if (!termin) notFound()

  // Ownership: kunde_id auf Fall ODER lead-email
  if (!termin.fall_id) notFound()
  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (Termin selbst, SSoT).
  // CMM-49 (Entity-Sweep): faelle -> v_claim_full (claim-anchored SSoT). fahrzeug_*/
  // kennzeichen/kunde_id/lead_id flach aus der View (value-identisch, div=0); schadenort_*/
  // claim_nummer flach statt claims-Embed. id:fall_id-Alias hält fall.id == frühere faelle.id.
  const { data: fall } = await admin
    .from('v_claim_full')
    .select('id:fall_id, kunde_id, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadenort_adresse, schadenort_plz, schadenort_ort, claim_nummer')
    .eq('fall_id', termin.fall_id)
    .single()
  if (!fall) notFound()
  const fallClaim = fall

  const owned = fall.kunde_id === user.id
  if (!owned) {
    if (fall.lead_id) {
      const { data: lead } = await admin
        .from('leads')
        .select('email')
        .eq('id', fall.lead_id)
        .single()
      if (lead?.email !== user.email) notFound()
    } else {
      notFound()
    }
  }

  // SV-Profil + verifiziert-Badge (geteilter get-kontakt-Loader statt inline sachverstaendige->profiles-Join)
  const svK = await getSvKontakt(admin, termin.assignee_id ?? null)
  const svName: string | null = svK ? svK.anzeigename || svK.name : null
  const svTelefon: string | null = svK?.telefon ?? null
  const svAvatarUrl: string | null = svK?.avatarUrl ?? null
  const svVerifiziert = svK?.verifiziert ?? false

  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || null
  const adresse =
    (termin as { besichtigungsort_adresse?: string | null }).besichtigungsort_adresse ||
    [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ') ||
    null

  return (
    <KundeTerminDetailClient
      termin={{
        id: termin.id,
        status: termin.status,
        start_zeit: termin.start_zeit,
        end_zeit: termin.end_zeit,
        kanal: termin.kanal as string | null,
        typ: termin.typ as string | null,
        kunden_tracking_token: (termin.kunden_tracking_token as string | null) ?? null,
        ablehnen_token: (termin.ablehnen_token as string | null) ?? null,
        sv_unterwegs_seit: (termin.sv_unterwegs_seit as string | null) ?? null,
        sv_eta_minuten: (termin.sv_eta_minuten as number | null) ?? null,
        sv_angekommen_am: (termin.sv_angekommen_am as string | null) ?? null,
        vorgeschlagenes_datum: (termin.vorgeschlagenes_datum as string | null) ?? null,
        gegenvorschlag_von: (termin.gegenvorschlag_von as string | null) ?? null,
        gegenvorschlag_grund: (termin.gegenvorschlag_grund as string | null) ?? null,
      }}
      fall={{
        id: fall.id as string,
        claim_nummer: (fallClaim?.claim_nummer as string | null) ?? null,
        kennzeichen: (fall.kennzeichen as string | null) ?? null,
        fahrzeug,
        adresse,
      }}
      sv={{
        name: svName,
        telefon: svTelefon,
        avatarUrl: svAvatarUrl,
        verifiziert: svVerifiziert,
      }}
    />
  )
}
