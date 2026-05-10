'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { toast } from 'sonner'
import { updateSvProfile, resendWelcomeMail } from './actions'
import { deactivateGutachter, reactivateGutachter } from '../_karte/actions'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { MapPinIcon, MailIcon, LockIcon, UnlockIcon, IdCardIcon } from 'lucide-react'
import { LoadingButton } from '@/components/ui/loading-button'
import { QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN } from '../anlegen/constants'

const PAKET_OPTIONS = [
  { value: 'standard', label: 'Standard (10 Fälle, 15km)' },
  { value: 'pro', label: 'Pro (25 Fälle, 40km)' },
  { value: 'premium', label: 'Premium (50 Fälle, 70km)' },
]

type SvData = {
  id: string
  profileId: string
  vorname: string
  nachname: string
  telefon: string
  paket: string
  maxFaelleMonat: number
  istAktiv: boolean
  // AAR SV-Audit-Konsolidierung: gesperrt_seit + gesperrt_grund ersetzen
  // das frühere „Aktiv/Inaktiv"-Dropdown. ist_aktiv wird nur noch vom
  // Stripe-Webhook gesteuert, Admin-Sperren laufen über diese 2 Felder.
  gesperrtSeit: string | null
  gesperrtGrund: string | null
  notizen: string
  standortAdresse: string
  standortPlz: string
  standortLat: number | null
  standortLng: number | null
  standortPlaceId: string
  paketUmkreisKm: number
  // AAR SV-Konsolidierung: Qualifikations-/Spezifikations-Pflege migriert
  // vom gelöschten GutachterProfilPanel. Admin kann jetzt direkt hier alles
  // pflegen — bisher war das nur im Karten-Inline-Edit möglich der weg ist.
  qualifikationen: string[]
  spezifikationen: string[]
  schadenarten: string[]
  bvskMitgliedsnummer: string
  ihkZertifikatNummer: string
  oebuvBestellungsnummer: string
  googlePlaceId: string | null
}

export default function SvDetailClient({ sv }: { sv: SvData }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // AAR-364 SUB-4: Resend-Welcome-Mail
  const [resending, setResending] = useState(false)
  const [resendNotice, setResendNotice] = useState<{ ok: boolean; text: string } | null>(null)
  // AAR SV-Audit-Konsolidierung: Sperr-Toggle statt ist_aktiv-Dropdown
  const [sperrePending, startSperreTransition] = useTransition()
  const [sperrGrund, setSperrGrund] = useState('')
  const [showSperrDialog, setShowSperrDialog] = useState(false)
  const istGesperrt = !!sv.gesperrtSeit

  // AAR SV-Konsolidierung: Qualifikations-/Spezifikations-State (Multi-Select).
  // Migration vom gelöschten GutachterProfilPanel — Admin pflegt jetzt alles hier.
  const [qualifikationen, setQualifikationen] = useState<string[]>(sv.qualifikationen)
  const [spezifikationen, setSpezifikationen] = useState<string[]>(sv.spezifikationen)
  const [schadenarten, setSchadenarten] = useState<string[]>(sv.schadenarten)
  const [bvskNr, setBvskNr] = useState(sv.bvskMitgliedsnummer)
  const [ihkNr, setIhkNr] = useState(sv.ihkZertifikatNummer)
  const [oebuvNr, setOebuvNr] = useState(sv.oebuvBestellungsnummer)

  function toggleTag(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value])
  }

  function handleSperren() {
    if (!sperrGrund.trim() || sperrGrund.trim().length < 5) {
      toast.error('Bitte Sperr-Grund angeben (min. 5 Zeichen)')
      return
    }
    startSperreTransition(async () => {
      try {
        await deactivateGutachter(sv.id, sperrGrund.trim())
        toast.success('Sachverständiger gesperrt')
        setShowSperrDialog(false)
        setSperrGrund('')
        router.refresh()
      } catch (err) {
        toast.error('Sperren fehlgeschlagen', {
          description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        })
      }
    })
  }

  function handleEntsperren() {
    if (!window.confirm('Sperre aufheben? Der Sachverständige bekommt danach wieder Fälle.')) return
    startSperreTransition(async () => {
      try {
        await reactivateGutachter(sv.id)
        toast.success('Sperre aufgehoben')
        router.refresh()
      } catch (err) {
        toast.error('Entsperren fehlgeschlagen', {
          description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        })
      }
    })
  }

  async function handleResendWelcome() {
    if (resending) return
    if (!window.confirm('Willkommens-Mail mit neuem Initial-Passwort an den SV senden? Das alte Passwort wird dadurch ungültig.')) return
    setResending(true)
    setResendNotice(null)
    try {
      const r = await resendWelcomeMail(sv.id)
      if (!r.success) {
        setResendNotice({ ok: false, text: r.error ?? 'Versand fehlgeschlagen' })
        toast.error('Versand fehlgeschlagen', { description: r.error })
      } else {
        setResendNotice({ ok: true, text: 'Willkommens-Mail wurde erneut versendet (neues Initial-Passwort gesetzt).' })
        toast.success('Willkommens-Mail erneut versendet', {
          description: 'Der SV wird beim nächsten Login ein neues Passwort setzen müssen.',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Versand'
      setResendNotice({ ok: false, text: msg })
      toast.error('Versand fehlgeschlagen', { description: msg })
    } finally {
      setResending(false)
    }
  }

  // Standort state (updated by Google Places)
  const [standort, setStandort] = useState({
    adresse: sv.standortAdresse,
    plz: sv.standortPlz,
    lat: sv.standortLat,
    lng: sv.standortLng,
    place_id: sv.standortPlaceId,
  })

  function handlePlaceSelect(result: PlaceResult) {
    setStandort({
      adresse: result.adresse,
      plz: result.plz,
      lat: result.lat,
      lng: result.lng,
      place_id: result.place_id,
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const formData = new FormData(e.currentTarget)
      // Inject standort data into FormData
      formData.set('standort_adresse', standort.adresse)
      formData.set('standort_plz', standort.plz)
      formData.set('standort_lat', standort.lat != null ? String(standort.lat) : '')
      formData.set('standort_lng', standort.lng != null ? String(standort.lng) : '')
      formData.set('standort_place_id', standort.place_id)
      // AAR SV-Konsolidierung: Qualifikations-/Spezifikations-Arrays + Nummern
      formData.set('qualifikationen_neu', JSON.stringify(qualifikationen))
      formData.set('spezifikationen', JSON.stringify(spezifikationen))
      formData.set('schadenarten', JSON.stringify(schadenarten))
      formData.set('bvsk_mitgliedsnummer', bvskNr.trim())
      formData.set('ihk_zertifikat_nummer', ihkNr.trim())
      formData.set('oebuv_bestellungsnummer', oebuvNr.trim())
      await updateSvProfile(sv.id, sv.profileId, formData)
      setSuccess(true)
      router.refresh()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-white border border-claimondo-border rounded-xl px-4 py-2.5 text-claimondo-navy text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo'

  return (
    <div className="glass-light border border-claimondo-border rounded-ios-md p-5">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places&loading=async&v=weekly`}
        strategy="lazyOnload"
      />

      <h2 className="text-sm font-medium text-claimondo-ondo mb-4">Profil bearbeiten</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-claimondo-ondo text-xs mb-1">Vorname</label>
            <input name="vorname" defaultValue={sv.vorname} className={inputCls} />
          </div>
          <div>
            <label className="block text-claimondo-ondo text-xs mb-1">Nachname</label>
            <input name="nachname" defaultValue={sv.nachname} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-claimondo-ondo text-xs mb-1">Telefon</label>
          <input name="telefon" defaultValue={sv.telefon} className={inputCls} />
        </div>

        {/* Standort mit Google Places Autocomplete */}
        <div className="border border-claimondo-border rounded-xl p-4 bg-claimondo-bg/50">
          <label className="flex items-center gap-1.5 text-claimondo-ondo text-xs mb-2">
            <MapPinIcon className="w-3.5 h-3.5" /> Standort (Google Places)
          </label>
          <GooglePlaceAutocomplete
            defaultValue={standort.adresse}
            placeholder="Adresse eingeben..."
            onSelect={handlePlaceSelect}
            className={inputCls}
          />
          {standort.lat != null && standort.lng != null && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-claimondo-ondo/70">
              <span>PLZ: {standort.plz || '—'}</span>
              <span>Lat: {standort.lat.toFixed(4)}</span>
              <span>Lng: {standort.lng.toFixed(4)}</span>
              <span>Radius: {sv.paketUmkreisKm} km</span>
            </div>
          )}
          <p className="text-[10px] text-claimondo-ondo/70 mt-1">Einsatzgebiet wird automatisch per Isochrone berechnet</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-claimondo-ondo text-xs mb-1">Paket</label>
            <select name="paket" defaultValue={sv.paket} className={inputCls}>
              {PAKET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-claimondo-ondo text-xs mb-1">Max Fälle / Monat</label>
            <input name="paket_faelle_gesamt" type="number" min="1" defaultValue={sv.maxFaelleMonat} className={inputCls} />
          </div>
        </div>

        {/* AAR SV-Audit-Konsolidierung: Status ist jetzt READ-ONLY + Sperr-Toggle.
            ist_aktiv wird nur vom Stripe-Webhook gesteuert. Admin-Blockierung
            läuft über gesperrt_seit (deactivateGutachter / reactivateGutachter). */}
        <div>
          <label className="block text-claimondo-ondo text-xs mb-1">Status</label>
          <div className="bg-claimondo-bg border border-claimondo-border rounded-xl px-4 py-2.5 text-sm">
            {istGesperrt ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-medium">
                    <LockIcon className="w-3 h-3" /> Gesperrt
                  </span>
                  {sv.gesperrtGrund && (
                    <p className="text-xs text-claimondo-ondo mt-1">Grund: {sv.gesperrtGrund}</p>
                  )}
                </div>
                <LoadingButton
                  type="button"
                  onClick={handleEntsperren}
                  isLoading={sperrePending}
                  loadingText="…"
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 disabled:opacity-40"
                >
                  <UnlockIcon className="w-3.5 h-3.5 inline mr-1" /> Entsperren
                </LoadingButton>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  {sv.istAktiv ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-medium">
                      Aktiv (Portal freigeschaltet)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">
                      Onboarding (Anzahlung ausstehend)
                    </span>
                  )}
                  <p className="text-[10px] text-claimondo-ondo/70 mt-1">
                    Automatisch — Stripe-Webhook setzt Status nach Anzahlung. Manuelle Sperre über Button rechts.
                  </p>
                </div>
                <LoadingButton
                  type="button"
                  onClick={() => setShowSperrDialog(true)}
                  isLoading={sperrePending && showSperrDialog}
                  loadingText="…"
                  className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-40"
                >
                  <LockIcon className="w-3.5 h-3.5 inline mr-1" /> Sperren
                </LoadingButton>
              </div>
            )}
          </div>
          {showSperrDialog && !istGesperrt && (
            <div className="mt-2 bg-red-50/50 border border-red-200 rounded-xl px-3 py-2.5 space-y-2">
              <p className="text-xs font-medium text-red-700">Grund für die Sperre (sichtbar im Admin-Log)</p>
              <input
                type="text"
                value={sperrGrund}
                onChange={(e) => setSperrGrund(e.target.value)}
                placeholder="z.B. Wiederholte Ablehnungen, Qualitätsmängel..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowSperrDialog(false); setSperrGrund('') }}
                  className="px-3 py-1.5 rounded-lg text-xs text-claimondo-ondo hover:bg-claimondo-bg"
                >
                  Abbrechen
                </button>
                <LoadingButton
                  type="button"
                  onClick={handleSperren}
                  isLoading={sperrePending}
                  loadingText="Sperrt…"
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40"
                >
                  Sperre aktivieren
                </LoadingButton>
              </div>
            </div>
          )}
        </div>

        {/* AAR SV-Konsolidierung: Qualifikationen, Spezifikationen, Schadenarten
            + Nummern-Felder (conditional bei Gruppe-B-Qualis). Migriert vom
            gelöschten GutachterProfilPanel — hier ist jetzt der zentrale
            Edit-Ort für alle Profil-Daten. */}
        <div className="border border-claimondo-border rounded-xl p-4 bg-claimondo-bg/30 space-y-4">
          <h3 className="text-xs font-semibold text-claimondo-navy uppercase tracking-wide">Qualifikationen &amp; Spezialisierungen</h3>

          <TagGroup
            label="Qualifikationen"
            hint="Was kann der SV fachlich anbieten?"
            options={QUALIFIKATIONEN}
            selected={qualifikationen}
            onToggle={(v) => toggleTag(qualifikationen, setQualifikationen, v)}
          />

          {/* Conditional Nummern-Felder für Gruppe-B-Qualis */}
          {(qualifikationen.includes('BVSK-Mitglied') || qualifikationen.includes('IHK-zertifiziert') || qualifikationen.includes('Öffentlich bestellt und vereidigt')) && (
            <div className="rounded-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <IdCardIcon className="w-3 h-3 text-claimondo-ondo" />
                <span className="text-[11px] font-semibold text-claimondo-navy">Quali-Nummern (optional)</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {qualifikationen.includes('BVSK-Mitglied') && (
                  <label className="block">
                    <span className="text-[10px] text-claimondo-ondo">BVSK-Mitgliedsnummer</span>
                    <input type="text" value={bvskNr} onChange={e => setBvskNr(e.target.value)} placeholder="z.B. 12345" className={inputCls} />
                  </label>
                )}
                {qualifikationen.includes('IHK-zertifiziert') && (
                  <label className="block">
                    <span className="text-[10px] text-claimondo-ondo">IHK-Zertifikats-Nummer</span>
                    <input type="text" value={ihkNr} onChange={e => setIhkNr(e.target.value)} placeholder="z.B. IHK-SV-2024-12345" className={inputCls} />
                  </label>
                )}
                {qualifikationen.includes('Öffentlich bestellt und vereidigt') && (
                  <label className="block">
                    <span className="text-[10px] text-claimondo-ondo">Bestellungsnummer</span>
                    <input type="text" value={oebuvNr} onChange={e => setOebuvNr(e.target.value)} placeholder="z.B. IHK Köln 4711" className={inputCls} />
                  </label>
                )}
              </div>
            </div>
          )}

          <TagGroup
            label="Spezifikationen"
            hint="Fahrzeug-Arten + fachliche Spezialisierungen"
            options={SPEZIFIKATIONEN}
            selected={spezifikationen}
            onToggle={(v) => toggleTag(spezifikationen, setSpezifikationen, v)}
          />

          <TagGroup
            label="Schadenarten"
            hint="Welche Arten von Schäden bearbeitet der SV?"
            options={SCHADENARTEN}
            selected={schadenarten}
            onToggle={(v) => toggleTag(schadenarten, setSchadenarten, v)}
          />
        </div>

        <div>
          <label className="block text-claimondo-ondo text-xs mb-1">Notizen</label>
          <textarea name="notizen" defaultValue={sv.notizen} rows={3} className={`${inputCls} resize-none`} placeholder="Interne Notizen ..." />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-emerald-500 text-sm">Gespeichert! Isochrone wird neu berechnet.</p>}

        <LoadingButton
          type="submit"
          isLoading={saving}
          loadingText="Speichert + berechnet Isochrone ..."
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 bg-claimondo-shield hover:bg-claimondo-ondo text-white"
        >
          Änderungen speichern
        </LoadingButton>
      </form>

      {/* AAR-364 SUB-4: Willkommens-Mail erneut senden */}
      <div className="mt-6 pt-5 border-t border-claimondo-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-claimondo-ondo/10 flex items-center justify-center flex-shrink-0">
              <MailIcon className="w-4 h-4 text-claimondo-ondo" />
            </div>
            <div className="text-xs text-claimondo-ondo leading-relaxed">
              <strong className="text-claimondo-navy block mb-0.5">Willkommens-Mail erneut senden</strong>
              Generiert ein neues Initial-Passwort und versendet die Willkommens-Mail mit den aktuellen Konditionen.
              Der SV muss beim nächsten Login ein neues Passwort setzen.
            </div>
          </div>
          <LoadingButton
            type="button"
            onClick={handleResendWelcome}
            isLoading={resending}
            loadingText="Sendet…"
            className="flex-shrink-0 px-3 py-2 rounded-xl border border-claimondo-ondo/40 text-claimondo-shield text-xs font-semibold hover:bg-claimondo-ondo/5 disabled:opacity-40"
          >
            Erneut senden
          </LoadingButton>
        </div>
        {resendNotice && (
          <div className={`mt-3 px-3 py-2 rounded-xl text-xs ${
            resendNotice.ok
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {resendNotice.text}
          </div>
        )}
      </div>
    </div>
  )
}

// AAR SV-Konsolidierung: Chip-Select-Gruppe für Multi-Value-Felder.
// Identisches Pattern wie im Solo-Wizard (TagSection), aber ohne externen
// Import damit hier keine Cross-File-Abhängigkeit entsteht.
function TagGroup({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string
  hint: string
  options: readonly string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-1.5">
        <span className="block text-xs font-medium text-claimondo-navy">{label}</span>
        <span className="block text-[10px] text-claimondo-ondo">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                active
                  ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                  : 'bg-white text-claimondo-ondo border-claimondo-border hover:border-claimondo-border'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
