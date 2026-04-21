// AAR-112: Dispatch-Portal Sachverständige-Detail (Read-Only)
// Minimal-Ansicht fuer Dispatch: Profil + Standort + Auslastung + aktuelle Faelle.
// Keine Admin-Actions (Bearbeiten, Löschen, Deaktivieren).
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon, MapPinIcon, PhoneIcon, MailIcon, PackageIcon,
  AlertTriangleIcon, UserIcon, CheckCircleIcon,
} from 'lucide-react'
import { getSvStatus } from '@/lib/sv-status'
import PhoneButton from '@/components/shared/PhoneButton'
import FallStatusBadge from '@/components/shared/FallStatusBadge'

export default async function DispatchSvDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, paket, offene_faelle, ist_aktiv, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_adresse, standort_plz, gutachter_typ, werbebudget_guthaben_netto, anzahlung_status, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, gebiet_plz, urlaub_von, urlaub_bis, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email, telefon)')
    .eq('id', id)
    .is('geloescht_am', null)
    .maybeSingle()

  if (!sv) notFound()

  const profileRaw = (sv as { profiles: unknown }).profiles
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    vorname: string | null; nachname: string | null; email: string | null; telefon: string | null
  } | null
  const name = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : 'Unbekannt'

  const { data: faelle } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select('id, fall_nummer, status, schadens_ursache, sv_termin, created_at, leads(vorname, nachname)')
    .eq('sv_id', id)
    .not('status', 'in', '("abgeschlossen","storniert")')
    .order('created_at', { ascending: false })
    .limit(20)

  const svRec = sv as Record<string, unknown>
  const status = getSvStatus({
    portal_zugang_freigeschaltet: svRec.portal_zugang_freigeschaltet as boolean | null,
    vertrag_unterschrieben: svRec.vertrag_unterschrieben as boolean | null,
    gesperrt_seit: svRec.gesperrt_seit as string | null,
  })
  const paketFaelleGesamt = Number(svRec.paket_faelle_gesamt) || 10
  const paketFaelleGenutzt = Number(svRec.paket_faelle_genutzt) || Number(svRec.offene_faelle) || 0
  const auslastungProzent = paketFaelleGesamt > 0 ? Math.round((paketFaelleGenutzt / paketFaelleGesamt) * 100) : 0
  const istUrlaub = svRec.urlaub_von && svRec.urlaub_bis
    ? new Date(svRec.urlaub_von as string) <= new Date() && new Date() <= new Date(svRec.urlaub_bis as string)
    : false

  return (
    <div className="py-6 space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/dispatch/sachverstaendige" className="text-gray-400 hover:text-gray-600">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-[#4573A2]" /> {name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.bg} ${status.text}`}>
              {status.label}
            </span>
            {istUrlaub && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                Urlaub
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profil + Standort + Auslastung */}
        <div className="lg:col-span-2 space-y-4">
          {/* Kontakt */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Kontaktdaten</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                {profile?.telefon ? (
                  <PhoneButton nummer={profile.telefon} variant="inline" label={profile.telefon} />
                ) : (
                  <><PhoneIcon className="w-4 h-4 text-gray-400" /><span className="text-gray-400">—</span></>
                )}
              </div>
              <div className="flex items-center gap-2">
                <MailIcon className="w-4 h-4 text-gray-400" />
                {profile?.email ? (
                  <a href={`mailto:${profile.email}`} className="text-[#4573A2] hover:underline">{profile.email}</a>
                ) : <span className="text-gray-400">—</span>}
              </div>
            </div>
          </div>

          {/* Standort */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MapPinIcon className="w-4 h-4 text-gray-400" /> Standort & Gebiet
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Adresse</p>
                <p className="font-medium">{(svRec.standort_adresse as string) || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">PLZ</p>
                <p className="font-medium">{(svRec.standort_plz as string) || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Radius</p>
                <p className="font-medium">{Number(svRec.paket_umkreis_km) || 40} km</p>
              </div>
            </div>
            {Array.isArray(svRec.gebiet_plz) && (svRec.gebiet_plz as string[]).length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase mb-1">Gebiet PLZ</p>
                <div className="flex flex-wrap gap-1">
                  {(svRec.gebiet_plz as string[]).slice(0, 20).map((plz, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{plz}</span>
                  ))}
                  {(svRec.gebiet_plz as string[]).length > 20 && (
                    <span className="text-[10px] text-gray-400">+{(svRec.gebiet_plz as string[]).length - 20} weitere</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Aktuelle Fälle */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Offene Fälle ({faelle?.length ?? 0})</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {(faelle ?? []).map((f) => {
                const leadRaw = (f as { leads: unknown }).leads
                const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as { vorname: string | null; nachname: string | null } | null
                const kundeName = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
                return (
                  <div key={f.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{kundeName}</p>
                      <p className="text-[10px] text-gray-400">Fall {f.fall_nummer ?? f.id.slice(0, 8)}</p>
                    </div>
                    <FallStatusBadge status={f.status} size="sm" />
                    {f.sv_termin && (
                      <span className="text-[10px] text-gray-500 tabular-nums">
                        {new Date(f.sv_termin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>
                )
              })}
              {(!faelle || faelle.length === 0) && (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">Keine offenen Fälle</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Paket + Auslastung */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
              <PackageIcon className="w-3.5 h-3.5" /> Paket
            </h3>
            <p className="text-sm font-semibold text-gray-900">{(svRec.paket as string) ?? '—'}</p>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[10px] text-gray-500 uppercase">Auslastung</p>
                <p className={`text-xs font-semibold tabular-nums ${auslastungProzent >= 80 ? 'text-red-600' : 'text-gray-900'}`}>
                  {paketFaelleGenutzt} / {paketFaelleGesamt}
                </p>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${auslastungProzent >= 80 ? 'bg-red-500' : auslastungProzent >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, auslastungProzent)}%` }}
                />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase">Guthaben</p>
              <p className="text-sm font-semibold text-gray-900">{Number(svRec.werbebudget_guthaben_netto || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Status</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                {(svRec.vertrag_unterschrieben as boolean) ? (
                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="text-gray-700">Vertrag {svRec.vertrag_unterschrieben ? 'unterschrieben' : 'offen'}</span>
              </div>
              <div className="flex items-center gap-2">
                {(svRec.portal_zugang_freigeschaltet as boolean) ? (
                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="text-gray-700">Portal-Zugang {svRec.portal_zugang_freigeschaltet ? 'frei' : 'gesperrt'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Anzahlung: {(svRec.anzahlung_status as string) ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
