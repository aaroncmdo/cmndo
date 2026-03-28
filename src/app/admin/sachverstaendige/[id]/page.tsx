import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SvDetailClient from './SvDetailClient'

const STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV Termin',
  'gutachten-eingegangen': 'Gutachten eingeg.',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

const STATUS_COLOR: Record<string, string> = {
  ersterfassung: 'bg-zinc-800 text-zinc-300',
  'sv-zugewiesen': 'bg-blue-950 text-blue-300',
  'sv-termin': 'bg-blue-900 text-blue-200',
  'gutachten-eingegangen': 'bg-violet-950 text-violet-300',
  filmcheck: 'bg-yellow-950 text-yellow-300',
  'kanzlei-uebergeben': 'bg-green-950 text-green-300',
  anschlussschreiben: 'bg-green-900 text-green-200',
  regulierung: 'bg-emerald-950 text-emerald-300',
  abgeschlossen: 'bg-emerald-900 text-emerald-200',
  storniert: 'bg-red-950 text-red-300',
}

export default async function SvDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, gebiet_plz, radius_km, paket, max_faelle_monat, offene_faelle, partner_seit, ist_aktiv, notizen, profiles(vorname, nachname, email, telefon)')
    .eq('id', id)
    .single()

  if (!sv) notFound()

  // Normalize profile join
  const profileRaw = sv.profiles as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
  } | null

  // Fetch assigned cases
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_termin, created_at')
    .eq('sv_id', id)
    .order('created_at', { ascending: false })

  const name = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : ''

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin/sachverstaendige"
          className="text-sm text-zinc-400 hover:text-white transition-colors mb-6 inline-block"
        >
          ← Zurück
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white">{name || 'Sachverständiger'}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{profile?.email ?? '—'}</p>
          </div>
          {sv.ist_aktiv ? (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-950 text-green-300">Aktiv</span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-950 text-red-300">Inaktiv</span>
          )}
        </div>

        {/* Auslastung */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Auslastung</h2>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-white text-2xl font-bold tabular-nums">
              {sv.offene_faelle ?? 0}
              <span className="text-zinc-500 text-sm font-normal"> / {sv.max_faelle_monat}</span>
            </span>
            <span className="text-zinc-500 text-sm">
              {sv.max_faelle_monat > 0
                ? `${Math.round(((sv.offene_faelle ?? 0) / sv.max_faelle_monat) * 100)}%`
                : '—'}
            </span>
          </div>
          <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (sv.offene_faelle ?? 0) / sv.max_faelle_monat > 0.8
                  ? 'bg-red-500'
                  : (sv.offene_faelle ?? 0) / sv.max_faelle_monat > 0.5
                  ? 'bg-yellow-500'
                  : 'bg-blue-500'
              }`}
              style={{
                width: `${Math.min(100, sv.max_faelle_monat > 0 ? ((sv.offene_faelle ?? 0) / sv.max_faelle_monat) * 100 : 0)}%`,
              }}
            />
          </div>
        </div>

        {/* Edit form */}
        <SvDetailClient
          sv={{
            id: sv.id,
            profileId: sv.profile_id!,
            vorname: profile?.vorname ?? '',
            nachname: profile?.nachname ?? '',
            telefon: profile?.telefon ?? '',
            paket: sv.paket,
            maxFaelleMonat: sv.max_faelle_monat,
            istAktiv: sv.ist_aktiv ?? true,
            gebietPlz: (sv.gebiet_plz ?? []) as string[],
            notizen: sv.notizen ?? '',
          }}
        />

        {/* Zugewiesene Fälle */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mt-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">
            Zugewiesene Fälle ({faelle?.length ?? 0})
          </h2>
          {!faelle?.length ? (
            <p className="text-zinc-600 text-sm">Keine Fälle zugewiesen.</p>
          ) : (
            <div className="space-y-2">
              {faelle.map((fall) => (
                <Link
                  key={fall.id}
                  href={`/admin/faelle/${fall.id}`}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-blue-400 font-mono text-xs shrink-0">
                      {fall.fall_nummer ?? fall.id.slice(0, 8)}
                    </span>
                    <span className="text-zinc-400 text-xs truncate">
                      {fall.schadens_ursache ?? '—'} · {fall.schadens_ort ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[fall.status] ?? 'bg-zinc-800 text-zinc-300'}`}>
                      {STATUS_LABEL[fall.status] ?? fall.status}
                    </span>
                    <span className="text-zinc-600 text-xs hidden sm:block">
                      {fall.created_at ? new Date(fall.created_at).toLocaleDateString('de-DE') : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
