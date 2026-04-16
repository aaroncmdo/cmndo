import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect, notFound } from 'next/navigation'
import FallDetailClient from './FallDetailClient'

export default async function GutachterFallPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Verify this gutachter has an SV profile
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) notFound()

  // Fetch case and verify sv_id match
  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) notFound()

  // Fetch all related data in parallel
  const [
    { data: lead },
    { data: dokumente },
    { data: pflichtdokumente },
    { data: parteien },
    { data: timeline },
    { data: abrechnung },
    { data: nachrichten },
  ] = await Promise.all([
    fall.lead_id
      ? supabase
          .from('leads')
          .select('vorname, nachname, email, telefon')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, datei_groesse, kategorie, quelle, sichtbar_fuer, hochgeladen_von_rolle, created_at')
      .eq('fall_id', id)
      .contains('sichtbar_fuer', ['sachverstaendiger'])
      .order('created_at'),
    supabase
      .from('pflichtdokumente')
      .select('id, dokument_typ, status, pflicht, quelle, dokument_url, hochgeladen_am, created_at')
      .eq('fall_id', id)
      .order('created_at'),
    supabase
      .from('parteien')
      .select('id, rolle, name, versicherung_name, versicherung_nr, telefon, email')
      .eq('fall_id', id),
    supabase
      .from('timeline')
      .select('id, typ, titel, beschreibung, erstellt_von, metadata, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('gutachter_abrechnungen')
      .select('leadpreis, preistyp, ausgezahlt_am')
      .eq('fall_id', id)
      .eq('sv_id', sv.id)
      .maybeSingle(),
    supabase
      .from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .eq('kanal', 'portal-kunde-gutachter')
      .order('created_at', { ascending: true }),
  ])

  // Fetch kundenbetreuer profile
  let kundenbetreuer: {
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
  } | null = null
  if (fall.kundenbetreuer_id) {
    const { data: kbProfile } = await supabase
      .from('profiles')
      .select('vorname, nachname, email, telefon')
      .eq('id', fall.kundenbetreuer_id as string)
      .single()
    kundenbetreuer = kbProfile
  }

  // Attach leadpreis to fall object for display
  const fallWithAbrechnung = {
    ...fall,
    _leadpreis: abrechnung?.leadpreis ? Number(abrechnung.leadpreis) : null,
    _preistyp: abrechnung?.preistyp ?? null,
  }

  // KFZ-172: fall_dokumente laden
  let fallDokumente: { id: string; dokument_typ: string; ist_pflicht: boolean; ab_phase: string | null; storage_path: string; original_filename: string | null; ocr_status: string | null; hochgeladen_am: string }[] = []
  try {
    const { data: fd } = await supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, ist_pflicht, ab_phase, storage_path, original_filename, ocr_status, ocr_extracted_data, hochgeladen_am')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am')
    fallDokumente = (fd ?? []) as typeof fallDokumente
  } catch { /* Tabelle kann noch nicht existieren */ }

  // KFZ-129: Chat-Teilnehmer laden
  const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
  const chatTeilnehmer = await getChatTeilnehmer(id)

  // KFZ-134: Aktiven gutachter_termine Eintrag laden
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data: aktiverTermin } = await admin
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund')
    .eq('fall_id', id)
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <FallDetailClient
      fall={fallWithAbrechnung}
      lead={lead}
      dokumente={dokumente ?? []}
      pflichtdokumente={(pflichtdokumente ?? []) as unknown as Parameters<typeof FallDetailClient>[0]['pflichtdokumente']}
      parteien={parteien ?? []}
      timeline={(timeline ?? []) as unknown as Parameters<typeof FallDetailClient>[0]['timeline']}
      nachrichten={nachrichten ?? []}
      kundenbetreuer={kundenbetreuer}
      chatTeilnehmer={chatTeilnehmer}
      aktiverTermin={aktiverTermin}
      fallDokumente={fallDokumente}
      abrechnungAusgezahltAm={(abrechnung as { ausgezahlt_am?: string | null } | null)?.ausgezahlt_am ?? null}
    />
  )
}
