'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import { updateProfil } from './actions'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { MapPinIcon } from 'lucide-react'

type Profile = { vorname: string | null; nachname: string | null; telefon: string | null; rolle: string }
type SV = { id: string; paket: string; gebiet_plz: string | null; ist_aktiv: boolean; max_faelle_monat: number; offene_faelle: number; kalender_typ: string; kalender_sync_aktiv: boolean; kalender_sync_letzte: string | null; qualifikationen: string[] | null; standort_adresse: string | null; standort_plz: string | null; standort_lat: number | null; standort_lng: number | null; standort_place_id: string | null }

const QUALIFIKATION_OPTIONS = [
  { value: 'sf-01', label: 'Haftpflichtschaden (SF-01)' },
  { value: 'sf-02', label: 'Kasko-Schaden (SF-02)' },
  { value: 'sf-03', label: 'Diebstahl (SF-03)' },
  { value: 'sf-04', label: 'Elementarschaden (SF-04)' },
  { value: 'sf-05', label: 'Oldtimer (SF-05)' },
  { value: 'sf-06', label: 'LKW / Nutzfahrzeug (SF-06)' },
]

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard (10 Faelle/Monat)', 'starter-10': 'Standard (10 Faelle/Monat)',
  pro: 'Pro (25 Faelle/Monat)', 'standard-25': 'Pro (25 Faelle/Monat)',
  premium: 'Premium (50 Faelle/Monat)', 'premium-50': 'Premium (50 Faelle/Monat)',
}
type PendingTermin = { id: string; fall_id: string; start_zeit: string; end_zeit: string; fall_nummer?: string }

export default function ProfilClient({
  email,
  profile,
  sv,
  faelleCount,
  pendingTermine,
}: {
  email: string
  profile: Profile
  sv: SV
  faelleCount: number
  pendingTermine: PendingTermin[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [mapsReady, setMapsReady] = useState(
    typeof window !== 'undefined' && typeof google !== 'undefined' && !!google.maps?.places,
  )
  const [standort, setStandort] = useState({
    adresse: sv.standort_adresse ?? '',
    plz: sv.standort_plz ?? '',
    lat: sv.standort_lat,
    lng: sv.standort_lng,
    place_id: sv.standort_place_id ?? '',
  })

  const onPlaceSelect = useCallback((result: PlaceResult) => {
    setStandort({
      adresse: result.adresse,
      plz: result.plz,
      lat: result.lat,
      lng: result.lng,
      place_id: result.place_id,
    })
  }, [])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('standort_adresse', standort.adresse)
      fd.set('standort_plz', standort.plz)
      fd.set('standort_lat', standort.lat?.toString() ?? '')
      fd.set('standort_lng', standort.lng?.toString() ?? '')
      fd.set('standort_place_id', standort.place_id)
      await updateProfil(fd)
      setEditing(false)
      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const initials = `${(profile.vorname?.[0] ?? '').toUpperCase()}${(profile.nachname?.[0] ?? '').toUpperCase()}`
  const fullName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || '—'

  return (
    <div className="h-full flex flex-col">
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`}
          strategy="lazyOnload"
          onReady={() => setMapsReady(true)}
        />
      )}
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Mein Profil</h1>
          {!editing && (
            <button
              onClick={() => { setEditing(true); setSuccess(false) }}
              className="px-4 py-2 text-xs font-medium text-[#7BA3CC] hover:text-[#7BA3CC] hover:bg-gray-100 rounded-xl transition-colors"
            >
              Bearbeiten
            </button>
          )}
        </div>

        {success && (
          <div className="bg-green-50 border border-green-800 rounded-xl p-3 mb-4">
            <p className="text-green-300 text-sm">Profil gespeichert.</p>
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="bg-white rounded-2xl p-6 border border-gray-200 space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xl font-semibold">
                {initials}
              </div>
              <div>
                <p className="text-gray-900 font-medium text-lg">{fullName}</p>
                <p className="text-gray-500 text-sm">Sachverständiger</p>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-0">
              <FieldRow label="E-Mail" value={email} />

              {editing ? (
                <>
                  <EditRow label="Vorname" name="vorname" defaultValue={profile.vorname ?? ''} />
                  <EditRow label="Nachname" name="nachname" defaultValue={profile.nachname ?? ''} />
                  <EditRow label="Telefon" name="telefon" defaultValue={profile.telefon ?? ''} type="tel" />
                  <EditRow label="Gebiet (PLZ)" name="gebiet_plz" defaultValue={sv.gebiet_plz ?? ''} placeholder="z.B. 10115,10117,10119" />
                  <div className="flex gap-2 py-2 border-b border-gray-200/50">
                    <span className="text-gray-500 text-sm w-36 shrink-0 pt-2">Standort</span>
                    <div className="flex-1 space-y-2">
                      {mapsReady ? (
                        <GooglePlaceAutocomplete
                          defaultValue={standort.adresse}
                          placeholder="Büro-/Wohnadresse eingeben"
                          onSelect={onPlaceSelect}
                          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={standort.adresse}
                          onChange={e => setStandort(prev => ({ ...prev, adresse: e.target.value }))}
                          placeholder="Büro-/Wohnadresse eingeben"
                          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                        />
                      )}
                      {standort.lat != null && (
                        <p className="text-green-500 text-xs flex items-center gap-1">
                          <MapPinIcon className="w-3 h-3" />
                          Koordinaten erfasst ({standort.lat.toFixed(4)}, {standort.lng?.toFixed(4)})
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 py-2.5 border-b border-gray-200/50">
                    <span className="text-gray-500 text-sm w-36 shrink-0">Verfügbar</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="verfuegbar"
                        defaultChecked={sv.ist_aktiv}
                        className="w-4 h-4 rounded bg-gray-100 border-gray-300 text-[#4573A2] focus:ring-[#1E3A5F] focus:ring-offset-0"
                      />
                      <span className="text-gray-700 text-sm">Neue Aufträge annehmen</span>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <FieldRow label="Vorname" value={profile.vorname ?? '—'} />
                  <FieldRow label="Nachname" value={profile.nachname ?? '—'} />
                  <FieldRow label="Telefon" value={profile.telefon ?? '—'} />
                  <FieldRow label="Gebiet (PLZ)" value={sv.gebiet_plz ?? '—'} />
                  <FieldRow label="Standort" value={sv.standort_adresse ?? '—'} />
                  <FieldRow label="Verfügbar" value={sv.ist_aktiv ? 'Ja' : 'Nein'} />
                </>
              )}

              <FieldRow label="Paket" value={PAKET_LABELS[sv.paket] ?? sv.paket ?? '—'} />
              <FieldRow label="Offene Faelle" value={`${sv.offene_faelle} / ${sv.max_faelle_monat}`} />
              <FieldRow label="Zugewiesene Fälle gesamt" value={String(faelleCount)} />
            </div>

            {/* Actions */}
            {editing && (
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#1E3A5F] hover:bg-[#4573A2] text-white transition-colors disabled:opacity-40"
                >
                  {saving ? 'Wird gespeichert...' : 'Speichern'}
                </button>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        </form>

        {/* Kalender-Verbindung */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 mt-5">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Kalender verbinden</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-800 text-sm font-medium">
                  {sv.kalender_sync_aktiv
                    ? `${sv.kalender_typ === 'google' ? 'Google' : 'Outlook'} Kalender verbunden`
                    : 'Nicht verbunden'}
                </p>
                {sv.kalender_sync_letzte && (
                  <p className="text-gray-500 text-xs mt-0.5">
                    Letzte Sync: {new Date(sv.kalender_sync_letzte).toLocaleString('de-DE')}
                  </p>
                )}
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${sv.kalender_sync_aktiv ? 'bg-green-500' : 'bg-zinc-600'}`} />
            </div>

            {!sv.kalender_sync_aktiv && (
              <div className="flex gap-2">
                <button
                  onClick={() => alert('Google OAuth2 wird konfiguriert. Bitte Admin kontaktieren.')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 transition-colors"
                >
                  Google Kalender
                </button>
                <button
                  onClick={() => alert('Outlook OAuth2 wird konfiguriert. Bitte Admin kontaktieren.')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 transition-colors"
                >
                  Outlook Kalender
                </button>
              </div>
            )}

            <p className="text-gray-400 text-xs">
              Ohne Kalender-Sync keine automatische Terminvergabe möglich.
            </p>
          </div>
        </div>

        {/* Qualifikationen */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 mt-5">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Qualifikationen</h2>
          <QualifikationenSection svId={sv.id} initialQualifikationen={sv.qualifikationen ?? []} />
        </div>

        {/* Offene Terminanfragen */}
        {pendingTermine.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-gray-200 mt-5">
            <h2 className="text-sm font-medium text-gray-500 mb-4">
              Offene Terminanfragen ({pendingTermine.length})
            </h2>
            <div className="space-y-3">
              {pendingTermine.map(termin => (
                <TerminAnfrage key={termin.id} termin={termin} svId={sv.id} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TerminAnfrage({ termin, svId }: { termin: PendingTermin; svId: string }) {
  const [responding, setResponding] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [gegenvorschlag, setGegenvorschlag] = useState('')
  const [ablehnungsgrund, setAblehnungsgrund] = useState('')
  const router = useRouter()

  async function handleAccept() {
    setResponding(true)
    const supabase = createClient()
    await supabase
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', termin.id)
    router.refresh()
  }

  async function handleReject() {
    if (!gegenvorschlag) return
    setResponding(true)
    const supabase = createClient()
    await supabase
      .from('gutachter_termine')
      .update({
        status: 'abgelehnt',
        ablehnungsgrund,
        gegenvorschlag_zeit: gegenvorschlag,
      })
      .eq('id', termin.id)
    router.refresh()
  }

  const start = new Date(termin.start_zeit)
  const end = new Date(termin.end_zeit)

  return (
    <div className="bg-gray-100/50 rounded-xl p-4 border border-gray-300">
      <div className="flex items-center justify-between mb-2">
        <p className="text-gray-800 text-sm font-medium">
          {start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
          {' '}
          {start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          –
          {end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <span className="text-amber-400 text-[10px] font-medium bg-amber-50 px-2 py-0.5 rounded-full">Anfrage</span>
      </div>

      {!showReject ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleAccept}
            disabled={responding}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40"
          >
            Bestätigen
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={responding}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-900 hover:bg-red-800 text-red-200 transition-colors disabled:opacity-40"
          >
            Ablehnen
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={ablehnungsgrund}
            onChange={e => setAblehnungsgrund(e.target.value)}
            placeholder="Grund (optional)"
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
          />
          <input
            type="datetime-local"
            value={gegenvorschlag}
            onChange={e => setGegenvorschlag(e.target.value)}
            required
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
          />
          <p className="text-gray-500 text-xs">Gegenvorschlag ist Pflicht</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            >
              Zurück
            </button>
            <button
              onClick={handleReject}
              disabled={responding || !gegenvorschlag}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
            >
              Ablehnen + Gegenvorschlag
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function QualifikationenSection({ svId, initialQualifikationen }: { svId: string; initialQualifikationen: string[] }) {
  const [quals, setQuals] = useState<string[]>(initialQualifikationen)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function toggleQual(value: string) {
    const newQuals = quals.includes(value)
      ? quals.filter(q => q !== value)
      : [...quals, value]
    setQuals(newQuals)
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('sachverstaendige')
      .update({ qualifikationen: newQuals })
      .eq('id', svId)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {QUALIFIKATION_OPTIONS.map(opt => {
        const active = quals.includes(opt.value)
        return (
          <button
            key={opt.value}
            onClick={() => toggleQual(opt.value)}
            disabled={saving}
            className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border text-sm transition-all ${
              active
                ? 'border-[#4573A2]/50 bg-[#4573A2]/10 text-[#7BA3CC]'
                : 'border-gray-300 bg-gray-100/50 text-gray-500 hover:border-gray-300'
            }`}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
              active ? 'border-[#4573A2] bg-[#4573A2]' : 'border-gray-300'
            }`}>
              {active && (
                <svg className="w-3 h-3 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
            {opt.label}
          </button>
        )
      })}
      {saving && <p className="text-gray-500 text-xs">Wird gespeichert...</p>}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-2.5 border-b border-gray-200/50 last:border-0">
      <span className="text-gray-500 text-sm w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-sm">{value}</span>
    </div>
  )
}

function EditRow({ label, name, defaultValue, type = 'text', placeholder }: {
  label: string; name: string; defaultValue: string; type?: string; placeholder?: string
}) {
  return (
    <div className="flex gap-2 py-2 border-b border-gray-200/50">
      <span className="text-gray-500 text-sm w-36 shrink-0 pt-2">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
    </div>
  )
}
