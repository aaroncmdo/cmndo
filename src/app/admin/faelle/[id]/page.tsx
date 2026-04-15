// AAR-162 / W2: Fallakte Server-Page.
// Lädt alle Fall-Daten und delegiert an FallakteShell.
// AAR-172: Der 210-KB-Monolith FallakteClient.old.tsx wurde gelöscht, nachdem
// die neue Shell-Architektur alle W2-W5-Tickets abdeckt.

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import FallakteShell from './FallakteShell'
import type { FallakteRolle } from '@/lib/fall/field-permissions'

export default async function FallaktePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: fall } = await supabase.from('faelle').select('*').eq('id', id).single()
  if (!fall) notFound()

  // Rolle des eingeloggten Users für field-permissions
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const userRolle = ((profile?.rolle as FallakteRolle | null) ?? 'kunde') as FallakteRolle

  // Die schweren Abhängigkeits-Queries (Timeline, Dokumente, Parteien, etc.)
  // werden weiterhin hier geladen und als Props an die Tabs durchgereicht.
  // Der Shell + die Übersicht brauchen nur fall + lead + sv + kundenbetreuer.
  const [
    { data: dokumente },
    { data: timeline },
    { data: pflichtdokumente },
    { data: qcCheckliste },
    leadResult,
    svResult,
    kundenbetreuerResult,
  ] = await Promise.all([
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, datei_groesse, created_at, kategorie, hochgeladen_von, hochgeladen_von_rolle, quelle, sichtbar_fuer')
      .eq('fall_id', id)
      .order('created_at'),
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
    // AAR-170: QC-Checkliste für Dokumente-Tab-Integration
    supabase
      .from('qc_checkliste')
      .select('*')
      .eq('fall_id', id)
      .maybeSingle(),
    fall.lead_id
      ? supabase
          .from('leads')
          .select('id, vorname, nachname, email, telefon')
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
  ])

  // SV-Profil normalisieren (Supabase liefert nested FK als Array oder Objekt)
  let sv: Parameters<typeof FallakteShell>[0]['sv'] = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profileNormalized = (Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null) as Parameters<typeof FallakteShell>[0]['sv'] extends infer T
      ? T extends { profile: infer P } ? P : null
      : null
    sv = { id: raw.id as string, paket: raw.paket as string, profile: profileNormalized }
  }

  // AAR-103 + W2-Audit-Fix: Banner für andere offene Fälle desselben Kunden.
  // War im alten page.tsx oberhalb des Monolithen — beim Shell-Refactor
  // versehentlich rausgefallen.
  let otherKundeFaelle: Array<{
    id: string
    fall_nummer: string | null
    kennzeichen: string | null
    status: string | null
  }> = []
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
            {otherKundeFaelle.map((f) => (
              <a
                key={f.id}
                href={`/admin/faelle/${f.id}`}
                className="text-[#4573A2] hover:underline font-medium text-sm"
              >
                {f.fall_nummer ?? f.id.slice(0, 8)}
                {f.kennzeichen && ` (${f.kennzeichen})`}
              </a>
            ))}
          </div>
        </div>
      )}
      <FallakteShell
        fall={fall}
        lead={leadResult.data}
        userRolle={userRolle}
        kundenbetreuer={kundenbetreuerResult.data}
        sv={sv}
        timeline={timeline ?? []}
        dokumenteTabProps={{
          fallId: id,
          pflichtdokumente: (pflichtdokumente ?? []) as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['pflichtdokumente'],
          dokumente: (dokumente ?? []) as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['dokumente'],
          fallAS: {
            anschlussschreiben_url: (fall.anschlussschreiben_url as string | null) ?? null,
            anschlussschreiben_sendedatum: (fall.anschlussschreiben_sendedatum as string | null) ?? null,
            anschlussschreiben_unterschrift: (fall.anschlussschreiben_unterschrift as boolean | null) ?? null,
            anschlussschreiben_ocr_am: (fall.anschlussschreiben_ocr_am as string | null) ?? null,
          },
          // AAR-170: QC-Checkliste direkt im Dokumente-Tab (vorher im Monolithen)
          qcCheckliste: (qcCheckliste ?? null) as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['qcCheckliste'],
        }}
      />
    </>
  )
}
