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
  const user = (await supabase.auth.getUser())?.data?.user ?? null
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
    { data: forderungspositionen },
    { data: regulierungsKlassifizierung },
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
      .select('id, typ, titel, beschreibung, erstellt_von, metadata, lead_id, created_at')
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
      .select('id, typ, titel, beschreibung, status, faellig_am, erledigt_am, zugewiesen_an, prioritaet, auto_erstellt, created_at, task_code')
      .eq('fall_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('termine')
      .select('id, typ, datum, dauer_minuten, betreff, notiz, meet_link, status, ergebnis_notiz, erstellt_am')
      .eq('fall_id', id)
      .order('datum', { ascending: true }),
    supabase
      .from('forderungspositionen')
      .select('id, typ, bezeichnung, betrag_gefordert, betrag_reguliert, betrag_gekuerzt, quelle, erstellt_am')
      .eq('fall_id', id)
      .order('erstellt_am', { ascending: true }),
    supabase
      .from('regulierungs_klassifizierung')
      .select('*')
      .eq('fall_id', id)
      .maybeSingle(),
    fall.lead_id
      ? supabase
          .from('leads')
          .select('id, vorname, nachname, email, telefon, schadenfall_typ, kunden_konstellation, personenschaden_flag, mietwagen_flag, polizeibericht_pflicht, gutachter_termin, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, mandatstyp, vollmacht_unterschrieben')
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

  // KFZ-193: KB-Beratungstermine laden
  const { data: kbTermineRaw } = await supabase
    .from('gutachter_termine')
    .select('id, start_zeit, end_zeit, kanal, video_link, notiz_kunde, notiz_intern, status, cancelled_at')
    .eq('fall_id', id)
    .eq('typ', 'kb_beratung')
    .order('start_zeit', { ascending: false })
  const kbTermine = kbTermineRaw ?? []

  // KFZ-172: Lade fall_dokumente (neue Tabelle, kann noch nicht existieren)
  let fallDokumente: { id: string; dokument_typ: string; ist_pflicht: boolean; ab_phase: string | null; storage_path: string; original_filename: string | null; ocr_status: string | null; hochgeladen_am: string }[] = []
  try {
    const { data: fd } = await supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, ist_pflicht, ab_phase, storage_path, original_filename, ocr_status, ocr_extracted_data, hochgeladen_am')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am')
    fallDokumente = (fd ?? []) as typeof fallDokumente
  } catch {
    // Tabelle existiert noch nicht — Phase 2 Migration pending
  }

  // Fetch mitarbeiter for task assignment
  const { data: mitarbeiterList } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, rolle')
    .in('rolle', ['admin', 'kundenbetreuer', 'leadbearbeiter', 'sachverstaendiger'])
    .order('vorname')

  const mitarbeiter = (mitarbeiterList ?? []).map(m => ({
    id: m.id as string,
    name: [m.vorname, m.nachname].filter(Boolean).join(' ') || m.id.slice(0, 8),
    rolle: m.rolle as string,
  }))

  // Normalize the SV profile join
  let sv = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null
    sv = { id: raw.id as string, paket: raw.paket as string, profile }
  }

  // KFZ-129: Chat-Teilnehmer laden
  const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
  const chatTeilnehmer = await getChatTeilnehmer(id)

  // KFZ-133: Versicherungs-Kontaktdaten laden
  let versicherungKontakt: { name: string; schaden_telefon: string | null; schaden_email: string | null; hotline_telefon: string | null; webseite: string | null } | null = null
  if (fall.versicherung_id) {
    const { data: vk } = await supabase.from('versicherungen').select('name, schaden_telefon, schaden_email, hotline_telefon, webseite').eq('id', fall.versicherung_id).single()
    versicherungKontakt = vk
  } else if (fall.gegner_versicherung || fall.versicherung_name) {
    // Fallback: nach Name suchen
    const vName = (fall.gegner_versicherung as string) ?? (fall.versicherung_name as string)
    if (vName) {
      const { data: vk } = await supabase.from('versicherungen').select('name, schaden_telefon, schaden_email, hotline_telefon, webseite').ilike('name', `%${vName}%`).limit(1).maybeSingle()
      versicherungKontakt = vk
    }
  }

  // KFZ-140: Fall-Finanzen berechnen
  const { getFallFinanzen } = await import('@/lib/finance/fall-finanzen')
  const fallFinanzen = await getFallFinanzen(id)

  // AAR-103: Andere offene Faelle desselben Kunden fuer Banner
  let otherKundeFaelle: Array<{ id: string; fall_nummer: string | null; kennzeichen: string | null; status: string | null }> = []
  if (fall.kunde_id) {
    const { data: others } = await supabase
      .from('faelle')
      .select('id, fall_nummer, kennzeichen, status')
      .eq('kunde_id', fall.kunde_id)
      .neq('id', id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false })
    otherKundeFaelle = others ?? []
  }

  return (
    <>
      {otherKundeFaelle.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-amber-900">
            Dieser Kunde hat {otherKundeFaelle.length} weitere{otherKundeFaelle.length > 1 ? '' : 'n'} aktiven Fall:
          </span>
          <div className="flex gap-2 flex-wrap">
            {otherKundeFaelle.map(f => (
              <a key={f.id} href={`/admin/faelle/${f.id}`}
                className="text-[#4573A2] hover:underline font-medium text-sm">
                {f.fall_nummer ?? f.id.slice(0, 8)}
                {f.kennzeichen && ` (${f.kennzeichen})`}
              </a>
            ))}
          </div>
        </div>
      )}
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
      mitarbeiter={mitarbeiter}
      forderungspositionen={forderungspositionen ?? []}
      chatTeilnehmer={chatTeilnehmer}
      versicherungKontakt={versicherungKontakt}
      fallFinanzen={fallFinanzen}
      fallDokumente={fallDokumente}
      regulierungsKlassifizierung={regulierungsKlassifizierung ?? null}
      kbTermine={kbTermine}
    />
    </>
  )
}
