'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import { updateOwnProfile } from '@/lib/actions/sv/update-own-profile'
import { ANREDE_OPTIONEN, TITEL_OPTIONEN, QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN } from '@/app/admin/sachverstaendige/anlegen/constants'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { LoadingButton } from '@/components/ui/loading-button'
import { MapPinIcon, InfoIcon } from 'lucide-react'

type Profile = { anrede: string | null; titel: string | null; vorname: string | null; nachname: string | null; telefon: string | null; rolle: string }
type SV = { id: string; paket: string; gebiet_plz: string | null; ist_aktiv: boolean; max_faelle_monat: number; offene_faelle: number; kalender_typ: string; kalender_sync_aktiv: boolean; kalender_sync_letzte: string | null; qualifikationen_neu: string[] | null; spezifikationen: string[] | null; schadenarten: string[] | null; standort_adresse: string | null; standort_plz: string | null; standort_lat: number | null; standort_lng: number | null; standort_place_id: string | null; firmenname: string | null; rechtsform: string | null; steuernummer: string | null; ust_id: string | null; hrb: string | null }

// BUG-91: Klassische deutsche Rechtsformen + 'Einzelunternehmen' als Default
// fuer Solo-SVs ohne eigene GmbH/UG.
const RECHTSFORM_OPTIONEN = [
  '',
  'Einzelunternehmen',
  'Freiberufler',
  'GbR',
  'OHG',
  'KG',
  'GmbH',
  'GmbH & Co. KG',
  'UG (haftungsbeschränkt)',
  'AG',
] as const

// KFZ-154: Qualifikationen / Spezifikationen / Schadenarten kommen jetzt aus
// /admin/sachverstaendige/anlegen/constants.ts (single source of truth).
// Die alten SF-01..SF-06 Codes wurden ersetzt durch die 3 sauberen Listen.

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)',
  pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)',
  premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)',
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

  // BUG-91: Lokaler Form-State fuer alle editierbaren Felder.
  // Email ist read-only und wird via prop reingereicht.
  const [form, setForm] = useState({
    anrede: profile.anrede ?? '',
    titel: profile.titel ?? '',
    vorname: profile.vorname ?? '',
    nachname: profile.nachname ?? '',
    telefon: profile.telefon ?? '',
    firmenname: sv.firmenname ?? '',
    rechtsform: sv.rechtsform ?? '',
    steuernummer: sv.steuernummer ?? '',
    ust_id: sv.ust_id ?? '',
    hrb: sv.hrb ?? '',
  })

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

  function updateField<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await updateOwnProfile({
        anrede: form.anrede || null,
        titel: form.titel || null,
        vorname: form.vorname,
        nachname: form.nachname,
        telefon: form.telefon || null,
        firmenname: form.firmenname || null,
        rechtsform: form.rechtsform || null,
        steuernummer: form.steuernummer || null,
        ust_id: form.ust_id || null,
        hrb: form.hrb || null,
        standort_adresse: standort.adresse || null,
        standort_plz: standort.plz || null,
        standort_lat: standort.lat,
        standort_lng: standort.lng,
        standort_place_id: standort.place_id || null,
      })
      if (!result.success) {
        setError(result.error ?? 'Fehler beim Speichern')
        return
      }
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

      {/* BUG-91: Sticky Header — bleibt beim Scrollen oben sichtbar */}
      <div className="flex-shrink-0 sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Mein Profil</h1>
          <p className="text-gray-500 text-xs">Stammdaten + Firma + Standort</p>
        </div>
        {!editing && (
          <button
            onClick={() => { setEditing(true); setSuccess(false) }}
            className="px-4 py-2 text-xs font-medium text-white bg-[#1E3A5F] hover:bg-[#4573A2] rounded-xl transition-colors"
          >
            Bearbeiten
          </button>
        )}
      </div>

      {/* BUG-91: Scroll-Container, max-w-full Page-Content
          BUG-98 Folge-Cleanup: Form von max-w-3xl auf max-w-4xl angehoben
          damit Desktop/Tablet quer den Platz nutzen. 4xl (~896px) bleibt
          fuer das einspaltige Profil-Form gut lesbar. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-full">
        {success && (
          <div className="bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-xl p-3 mb-4 max-w-4xl">
            <p className="text-[#0D1B3E] text-sm">Profil gespeichert.</p>
          </div>
        )}

        <form onSubmit={handleSave} className="max-w-4xl">
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
              {/* E-Mail read-only mit Hinweis */}
              <div className="flex gap-2 py-2.5 border-b border-gray-200/50">
                <span className="text-gray-500 text-sm w-36 shrink-0">E-Mail</span>
                <div className="flex-1">
                  <span className="text-gray-800 text-sm">{email}</span>
                  <p className="text-gray-400 text-[10px] mt-0.5 flex items-center gap-1">
                    <InfoIcon className="w-3 h-3" />
                    Email-Änderung via Support: <span className="text-[#4573A2]">support@claimondo.de</span>
                  </p>
                </div>
              </div>

              {editing ? (
                <>
                  {/* Anrede + Titel als Dropdowns */}
                  <SelectRow
                    label="Anrede"
                    value={form.anrede}
                    onChange={v => updateField('anrede', v)}
                    options={['', ...ANREDE_OPTIONEN].map(o => ({ value: o, label: o || '— wählen —' }))}
                  />
                  <SelectRow
                    label="Titel"
                    value={form.titel}
                    onChange={v => updateField('titel', v)}
                    options={TITEL_OPTIONEN.map(o => ({ value: o, label: o || '— kein Titel —' }))}
                  />
                  <ControlledRow label="Vorname" value={form.vorname} onChange={v => updateField('vorname', v)} />
                  <ControlledRow label="Nachname" value={form.nachname} onChange={v => updateField('nachname', v)} />
                  <ControlledRow label="Telefon" type="tel" value={form.telefon} onChange={v => updateField('telefon', v)} />
                  <div className="flex gap-2 py-2 border-b border-gray-200/50">
                    <span className="text-gray-500 text-sm w-36 shrink-0 pt-2">Anschrift</span>
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
                        <p className="text-green-600 text-xs flex items-center gap-1">
                          <MapPinIcon className="w-3 h-3" />
                          Koordinaten erfasst ({standort.lat.toFixed(4)}, {standort.lng?.toFixed(4)}) — Einsatzgebiet wird neu berechnet
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Firmen-Stammdaten */}
                  <div className="pt-3 mt-3 border-t border-gray-200">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 px-1">Firma / Steuerliches</p>
                  </div>
                  <ControlledRow label="Firmenname" value={form.firmenname} onChange={v => updateField('firmenname', v)} />
                  <SelectRow
                    label="Rechtsform"
                    value={form.rechtsform}
                    onChange={v => updateField('rechtsform', v)}
                    options={RECHTSFORM_OPTIONEN.map(o => ({ value: o, label: o || '— wählen —' }))}
                  />
                  <ControlledRow label="Steuernummer" value={form.steuernummer} onChange={v => updateField('steuernummer', v)} />
                  <ControlledRow label="USt-IdNr" value={form.ust_id} onChange={v => updateField('ust_id', v)} placeholder="z.B. DE123456789" />
                  <ControlledRow label="HRB" value={form.hrb} onChange={v => updateField('hrb', v)} placeholder="z.B. HRB 12345 (Berlin)" />
                </>
              ) : (
                <>
                  <FieldRow label="Anrede" value={profile.anrede ?? '—'} />
                  <FieldRow label="Titel" value={profile.titel || '—'} />
                  <FieldRow label="Vorname" value={profile.vorname ?? '—'} />
                  <FieldRow label="Nachname" value={profile.nachname ?? '—'} />
                  <FieldRow label="Telefon" value={profile.telefon ?? '—'} />
                  <FieldRow label="Anschrift" value={sv.standort_adresse ?? '—'} />
                  <div className="pt-3 mt-3 border-t border-gray-200">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 px-1">Firma / Steuerliches</p>
                  </div>
                  <FieldRow label="Firmenname" value={sv.firmenname ?? '—'} />
                  <FieldRow label="Rechtsform" value={sv.rechtsform ?? '—'} />
                  <FieldRow label="Steuernummer" value={sv.steuernummer ?? '—'} />
                  <FieldRow label="USt-IdNr" value={sv.ust_id ?? '—'} />
                  <FieldRow label="HRB" value={sv.hrb ?? '—'} />
                </>
              )}

              <div className="pt-3 mt-3 border-t border-gray-200">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 px-1">Vertrag</p>
              </div>
              <FieldRow label="Paket" value={PAKET_LABELS[sv.paket] ?? sv.paket ?? '—'} />
              <FieldRow label="Offene Fälle" value={`${sv.offene_faelle} / ${sv.max_faelle_monat}`} />
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
                <LoadingButton
                  type="submit"
                  isLoading={saving}
                  loadingText="Wird gespeichert..."
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#1E3A5F] hover:bg-[#4573A2] text-white transition-colors disabled:opacity-40"
                >
                  Speichern
                </LoadingButton>
              </div>
            )}

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl p-3 mt-2">{error}</p>
            )}
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

        {/* KFZ-154: 3 Spezialisierungs-Listen */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 mt-5">
          <h2 className="text-sm font-medium text-gray-500 mb-1">Spezialisierungen</h2>
          <p className="text-xs text-gray-400 mb-4">
            Wir nutzen diese Angaben um dir passende Fälle zuzuordnen. Änderungen werden sofort gespeichert.
          </p>
          <div className="space-y-5">
            <SpezSection
              svId={sv.id}
              column="qualifikationen_neu"
              title="Qualifikationen"
              hint="Was bietest du fachlich an?"
              options={QUALIFIKATIONEN}
              initial={sv.qualifikationen_neu ?? []}
            />
            <SpezSection
              svId={sv.id}
              column="spezifikationen"
              title="Spezifikationen"
              hint="Auf welche Fahrzeug-Arten bist du spezialisiert?"
              options={SPEZIFIKATIONEN}
              initial={sv.spezifikationen ?? []}
            />
            <SpezSection
              svId={sv.id}
              column="schadenarten"
              title="Schadenarten"
              hint="Welche Schadenarten bearbeitest du?"
              options={SCHADENARTEN}
              initial={sv.schadenarten ?? []}
            />
          </div>
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
        {/* KFZ-139: Branding Section */}
        <BrandingSection svId={sv.id} />
      </div>
    </div>
  )
}

// ─── KFZ-139: Branding Section ──────────────────────────────────────────────

function BrandingSection({ svId }: { svId: string }) {
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [primary, setPrimary] = useState('#0D1B3E')
  const [secondary, setSecondary] = useState('#4573A2')
  const [useCustom, setUseCustom] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load current branding
  useEffect(() => {
    const supabase = createClient()
    supabase.from('sachverstaendige').select('logo_url, brand_primary, brand_secondary, use_custom_branding').eq('id', svId).single()
      .then(({ data }) => {
        if (data) {
          setLogoUrl(data.logo_url)
          if (data.brand_primary) setPrimary(data.brand_primary)
          if (data.brand_secondary) setSecondary(data.brand_secondary)
          setUseCustom(data.use_custom_branding ?? false)
        }
      })
  }, [svId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Max 2 MB'); return }
    setUploading(true)
    try {
      const { uploadGutachterLogo } = await import('@/lib/actions/branding-actions')
      const formData = new FormData()
      formData.append('logo', file)
      const result = await uploadGutachterLogo(formData)
      setLogoUrl(result.logo_url)
      setPrimary(result.primary)
      setSecondary(result.secondary)
    } catch (err) { alert(err instanceof Error ? err.message : 'Upload fehlgeschlagen') }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true); setSaved(false)
    try {
      const { saveGutachterBranding } = await import('@/lib/actions/branding-actions')
      await saveGutachterBranding({
        logo_url: logoUrl ?? undefined,
        brand_primary: primary,
        brand_secondary: secondary,
        use_custom_branding: useCustom,
      })
      setSaved(true)
      router.refresh()
    } catch (err) { alert(err instanceof Error ? err.message : 'Speichern fehlgeschlagen') }
    setSaving(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mt-5">
      <h2 className="text-sm font-medium text-gray-500 mb-4">Branding</h2>

      {/* Toggle */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
        <div className={`relative w-10 h-5 rounded-full transition-colors ${useCustom ? 'bg-[#4573A2]' : 'bg-gray-300'}`}
          onClick={() => setUseCustom(!useCustom)}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${useCustom ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
        <span className="text-sm text-gray-700">{useCustom ? 'Mein Branding verwenden' : 'Claimondo Standard'}</span>
      </label>

      {useCustom && (
        <div className="space-y-4">
          {/* Logo Upload */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Logo (PNG/JPG/SVG, max 2 MB)</p>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-12 w-auto max-w-32 object-contain rounded border border-gray-200 bg-white p-1" />
              ) : (
                <div className="h-12 w-24 bg-gray-100 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">Kein Logo</div>
              )}
              <label className="px-3 py-1.5 text-xs font-medium text-[#4573A2] border border-[#4573A2] rounded-lg cursor-pointer hover:bg-[#4573A2]/5 transition-colors">
                {uploading ? 'Wird hochgeladen...' : 'Logo hochladen'}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Primaerfarbe</p>
              <div className="flex items-center gap-2">
                <input type="color" value={primary} onChange={e => setPrimary(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
                <input value={primary} onChange={e => setPrimary(e.target.value)} maxLength={7}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-700 focus:outline-none focus:border-[#4573A2]" />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Sekundaerfarbe</p>
              <div className="flex items-center gap-2">
                <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
                <input value={secondary} onChange={e => setSecondary(e.target.value)} maxLength={7}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-700 focus:outline-none focus:border-[#4573A2]" />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <div className="h-10 flex items-center px-4" style={{ backgroundColor: primary }}>
              {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-auto brightness-0 invert" /> : <span className="text-white text-sm font-bold">Vorschau</span>}
            </div>
            <div className="p-3 flex gap-2">
              <button className="px-3 py-1.5 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: secondary }}>Button</button>
              <button className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: secondary, color: secondary }}>Outline</button>
            </div>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-2 mt-4">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-xs font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] transition-colors disabled:opacity-50">
          {saving ? 'Wird gespeichert...' : 'Branding speichern'}
        </button>
        {saved && <span className="text-green-600 text-xs">Gespeichert!</span>}
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

// KFZ-154 Cleanup: SV pflegt seine 3 Spezialisierungs-Listen direkt aus dem
// Profil (Tags). Legacy 'qualifikationen' Spalte ist gedroppt.
function SpezSection({
  svId, column, title, hint, options, initial,
}: {
  svId: string
  column: 'qualifikationen_neu' | 'spezifikationen' | 'schadenarten'
  title: string
  hint: string
  options: ReadonlyArray<string>
  initial: string[]
}) {
  const [values, setValues] = useState<string[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function toggle(value: string) {
    const next = values.includes(value) ? values.filter(v => v !== value) : [...values, value]
    setValues(next)
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const update: Record<string, string[]> = { [column]: next }
      const { error: updErr } = await supabase
        .from('sachverstaendige')
        .update(update)
        .eq('id', svId)
      if (updErr) {
        setError(updErr.message)
        setValues(values) // rollback UI
      } else {
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium text-gray-800">{title}</h3>
        <span className="text-[10px] text-gray-400">
          {values.length} gewaehlt{saving ? ' · speichert...' : ''}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = values.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
                active
                  ? 'bg-[#4573A2] text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-800'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
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

// BUG-91: Controlled-Variante fuer den neuen Profil-Form. Zustand wird im
// Parent gehalten (form-State) damit die Server Action saubere Werte
// bekommt — keine FormData-Sammlung mehr.
function ControlledRow({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="flex gap-2 py-2 border-b border-gray-200/50">
      <span className="text-gray-500 text-sm w-36 shrink-0 pt-2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
    </div>
  )
}

function SelectRow({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <div className="flex gap-2 py-2 border-b border-gray-200/50">
      <span className="text-gray-500 text-sm w-36 shrink-0 pt-2">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
