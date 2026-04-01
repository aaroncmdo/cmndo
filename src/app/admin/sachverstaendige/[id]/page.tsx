import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SvDetailClient from './SvDetailClient'
import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'

const STATUS_LABEL = FALL_STATUS_LABELS
const STATUS_COLOR = FALL_STATUS_COLORS

export default async function SvDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, radius_km, paket, max_faelle_monat, offene_faelle, partner_seit, ist_aktiv, notizen, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_adresse, standort_plz, gutachter_typ, guthaben, anzahlung_status, profiles(vorname, nachname, email, telefon)')
    .eq('id', id)
    .single()

  if (!sv) notFound()

  const profileRaw = sv.profiles as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    vorname: string | null; nachname: string | null; email: string | null; telefon: string | null
  } | null

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_termin, created_at')
    .eq('sv_id', id)
    .order('created_at', { ascending: false })

  const name = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : ''
  const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
  const genutzt = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const pct = maxFaelle > 0 ? Math.round((genutzt / maxFaelle) * 100) : 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sticky Header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex-shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <Link href="/admin/sachverstaendige" className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-1.5 inline-block">
            &larr; Gutachter-Übersicht
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{name || 'Sachverständiger'}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                {profile?.email && <span>{profile.email}</span>}
                {sv.gutachter_typ && <span className="bg-[#4573A2]/5 text-[#4573A2] px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.gutachter_typ}</span>}
                {sv.paket && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.paket}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Auslastung compact */}
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 tabular-nums">{genutzt}/{maxFaelle}</span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5">
                  <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-[#4573A2]'}`}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
              {sv.ist_aktiv ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-600">Aktiv</span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-red-50 text-red-500">Inaktiv</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Auslastung Detail */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Auslastung & Paket</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{genutzt}</p>
                <p className="text-[10px] text-gray-500">Aktive Fälle</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{maxFaelle}</p>
                <p className="text-[10px] text-gray-500">Max. Kapazität</p>
              </div>
              <div>
                <p className={`text-2xl font-bold tabular-nums ${pct > 80 ? 'text-red-500' : pct > 50 ? 'text-amber-500' : 'text-[#4573A2]'}`}>{pct}%</p>
                <p className="text-[10px] text-gray-500">Auslastung</p>
              </div>
            </div>
            {sv.standort_adresse && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Standort</p>
                <p className="text-sm text-gray-700">{sv.standort_adresse}{sv.standort_plz ? ` · ${sv.standort_plz}` : ''}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Einsatzgebiet wird per Isochrone berechnet (Fahrzeitradius: {sv.paket_umkreis_km ?? sv.radius_km ?? 15} km)</p>
              </div>
            )}
          </div>

          {/* Edit form — KEIN gebiet_plz mehr */}
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
              notizen: sv.notizen ?? '',
            }}
          />

          {/* Zugewiesene Fälle */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-gray-500 mb-4">
              Zugewiesene Fälle ({faelle?.length ?? 0})
            </h2>
            {!faelle?.length ? (
              <p className="text-gray-400 text-sm">Keine Fälle zugewiesen.</p>
            ) : (
              <div className="space-y-2">
                {faelle.map((fall) => (
                  <Link key={fall.id} href={`/admin/faelle/${fall.id}`}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-100/50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[#7BA3CC] font-mono text-xs shrink-0">{fall.fall_nummer ?? fall.id.slice(0, 8)}</span>
                      <span className="text-gray-500 text-xs truncate">{fall.schadens_ursache ?? '—'} · {fall.schadens_ort ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[fall.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABEL[fall.status] ?? fall.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
