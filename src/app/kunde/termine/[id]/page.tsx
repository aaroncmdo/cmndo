// AAR-698: Termin-Detail-View für Kunden — alles was vor dem Termin
// interessiert: Datum, Status, Gutachter-Karte, Karte/Route, Live-Tracking-
// Hinweis (wenn SV unterwegs), Quick-Link in die Fallakte.
//
// Pfad-Konvention: `/kunde/termine/<id>` — auth-required (im Gegensatz zur
// public `/kunde/termin/<token>` Tracking-Page für Drittpersonen).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, sv_id, fall_id, lead_id, kanal, typ, kunden_tracking_token, sv_unterwegs_seit, sv_eta_minuten, sv_angekommen_am, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, ablehnen_token')
    .eq('id', id)
    .maybeSingle()
  if (!termin) notFound()

  // Ownership: kunde_id auf Fall ODER lead-email
  if (!termin.fall_id) notFound()
  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  const { data: fall } = await admin
    .from('faelle')
    .select('id, fall_nummer, kunde_id, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, besichtigungsort_adresse, claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort)')
    .eq('id', termin.fall_id)
    .single()
  if (!fall) notFound()
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

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

  // SV-Profil + verifiziert-Badge
  let svName: string | null = null
  let svTelefon: string | null = null
  let svAvatarUrl: string | null = null
  let svVerifiziert = false
  if (termin.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id, verifizierung_status')
      .eq('id', termin.sv_id)
      .single()
    if (sv?.profile_id) {
      const { data: p } = await admin
        .from('profiles')
        .select('vorname, nachname, telefon, anzeigename, avatar_url')
        .eq('id', sv.profile_id)
        .single()
      if (p) {
        svName =
          (p.anzeigename as string | null) ||
          [p.vorname, p.nachname].filter(Boolean).join(' ') ||
          null
        svTelefon = (p.telefon as string | null) ?? null
        svAvatarUrl = (p.avatar_url as string | null) ?? null
      }
    }
    svVerifiziert = sv?.verifizierung_status === 'geprueft'
  }

  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || null
  const adresse =
    (fall.besichtigungsort_adresse as string | null) ||
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
        fall_nummer: (fall.fall_nummer as string | null) ?? null,
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
