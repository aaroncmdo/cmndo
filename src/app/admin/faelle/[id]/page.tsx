import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import FallakteClient from './FallakteClient'

export default async function FallaktePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .single()

  if (!fall) notFound()

  const [
    { data: dokumente },
    { data: parteien },
    { data: timeline },
    { data: pflichtdokumente },
    { data: nachrichten },
    { data: qcCheckliste },
    { data: tasks },
    { data: termine },
    leadResult,
    svResult,
    kundenbetreuerResult,
    leadbearbeiterResult,
  ] = await Promise.all([
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, datei_groesse, created_at, kategorie, hochgeladen_von, hochgeladen_von_rolle, quelle, sichtbar_fuer')
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
      .from('pflichtdokumente')
      .select('id, dokument_typ, status, pflicht, quelle, dokument_url, hochgeladen_am, created_at')
      .eq('fall_id', id)
      .order('created_at'),
    supabase
      .from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('qc_checkliste')
      .select('*')
      .eq('fall_id', id)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('id, typ, titel, beschreibung, status, faellig_am, erledigt_am, zugewiesen_an, prioritaet, auto_erstellt, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('termine')
      .select('id, typ, datum, dauer_minuten, betreff, notiz, meet_link, status, ergebnis_notiz, erstellt_am')
      .eq('fall_id', id)
      .order('datum', { ascending: true }),
    fall.lead_id
      ? supabase
          .from('leads')
          .select('id, vorname, nachname, email, telefon, schadenfall_typ, kunden_konstellation, personenschaden_flag, mietwagen_flag, polizeibericht_pflicht, gutachter_termin, kennzeichen, fahrzeug_hersteller, fahrzeug_modell')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.sv_id
      ? supabase
          .from('sachverstaendige')
          .select('id, paket, profiles(vorname, nachname, telefon, email)')
          .eq('id', fall.sv_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.kundenbetreuer_id
      ? supabase
          .from('profiles')
          .select('id, vorname, nachname, email, telefon')
          .eq('id', fall.kundenbetreuer_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.leadbearbeiter_id
      ? supabase
          .from('profiles')
          .select('id, vorname, nachname, email, telefon')
          .eq('id', fall.leadbearbeiter_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  // Normalize the SV profile join
  let sv = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null
    sv = { id: raw.id as string, paket: raw.paket as string, profile }
  }

  return (
    <FallakteClient
      fall={fall}
      lead={leadResult.data}
      sv={sv}
      kundenbetreuer={kundenbetreuerResult.data}
      leadbearbeiter={leadbearbeiterResult.data}
      dokumente={dokumente ?? []}
      parteien={parteien ?? []}
      timeline={timeline ?? []}
      pflichtdokumente={pflichtdokumente ?? []}
      nachrichten={nachrichten ?? []}
      qcCheckliste={qcCheckliste ?? null}
      tasks={tasks ?? []}
      termine={termine ?? []}
    />
  )
}
