'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile } from '@/lib/actions/sv/update-own-profile'
import { ANREDE_OPTIONEN, TITEL_OPTIONEN } from '@/app/admin/sachverstaendige/anlegen/constants'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { LoadingButton } from '@/components/ui/loading-button'
import { Button } from '@/components/primitives'
import { MapPinIcon, InfoIcon, AlertTriangleIcon } from 'lucide-react'
import AvatarUpload from '@/components/shared/AvatarUpload'
import { SectionCard } from '@/components/shared/SectionCard'
import {
  FieldRow,
  ControlledRow,
  SelectRow,
  ROW_WRAPPER_CLS,
  ROW_LABEL_CLS,
  type Profile,
  type SV,
} from './fields'

// BUG-91-Liste — jetzt shared in @/lib/rechtsformen (auch makler/registrieren nutzt sie).
import { RECHTSFORM_OPTIONEN } from '@/lib/rechtsformen'

export function ProfilStammdaten({
  email,
  profile,
  sv,
  mapsReady,
}: {
  email: string
  profile: Profile
  sv: SV
  mapsReady: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
    // AAR-369: Anzeige-Felder
    anzeigename: profile.anzeigename ?? '',
    profilbeschreibung: profile.profilbeschreibung ?? '',
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
        // AAR-369
        anzeigename: form.anzeigename || null,
        profilbeschreibung: form.profilbeschreibung || null,
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
    <>
      {success && (
        <div className="bg-[var(--brand-secondary)]/5 border border-[var(--brand-secondary)]/20 rounded-ios-xl p-3 mb-4 max-w-4xl">
          <p className="text-[var(--brand-primary)] text-sm">Profil gespeichert.</p>
        </div>
      )}

      {/* Nudge: fehlende Rechtsform ist fuer die Honorarabrechnung (§14 UStG) noetig.
          Kein Gate — nur ein Hinweis im View-Modus (analog Makler #4634). */}
      {!sv.rechtsform && !editing && (
        <div className="bg-warning-soft border border-warning/30 rounded-ios-xl p-3 mb-4 max-w-4xl">
          <p className="text-warning-strong text-sm flex items-start gap-2">
            <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Für Ihre Honorarabrechnung fehlt noch Ihre Rechtsform. Bitte ergänzen Sie sie über „Bearbeiten" im Abschnitt „Firma / Steuerliches".</span>
          </p>
        </div>
      )}

      {!editing && (
        <div className="flex justify-end max-w-4xl mb-3">
          <Button variant="navy" size="sm" onClick={() => { setEditing(true); setSuccess(false) }}>
            Bearbeiten
          </Button>
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-4xl">
        <SectionCard className="p-6" bodyClassName="space-y-4">
          {/* Avatar — AAR-369: Upload statt statischer Initialen-Kreis */}
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4 pb-4 border-b border-claimondo-border">
            <AvatarUpload
              currentUrl={profile.avatar_url ?? null}
              initials={initials || '??'}
              size="md"
            />
            <div>
              <p className="text-claimondo-navy font-medium text-lg">{fullName}</p>
              <p className="text-claimondo-ondo text-sm">Sachverständiger</p>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-0">
            {/* E-Mail read-only mit Hinweis */}
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5 border-b border-claimondo-border/50">
              <span className="text-claimondo-ondo text-sm sm:w-36 sm:shrink-0">E-Mail</span>
              <div className="flex-1">
                <span className="text-claimondo-navy text-sm">{email}</span>
                <p className="text-claimondo-ondo/70 text-[10px] mt-0.5 flex items-center gap-1">
                  <InfoIcon className="w-3 h-3" />
                  Email-Änderung via Support: <span className="text-[var(--brand-secondary)]">aaron.sprafke@claimondo.de</span>
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
                <div className={ROW_WRAPPER_CLS}>
                  <span className={ROW_LABEL_CLS}>Anschrift</span>
                  <div className="flex-1 space-y-2">
                    {mapsReady ? (
                      <GooglePlaceAutocomplete
                        defaultValue={standort.adresse}
                        placeholder="Büro-/Wohnadresse eingeben"
                        onSelect={onPlaceSelect}
                        className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy placeholder-claimondo-ondo/60 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    ) : (
                      <input
                        type="text"
                        value={standort.adresse}
                        onChange={e => setStandort(prev => ({ ...prev, adresse: e.target.value }))}
                        placeholder="Büro-/Wohnadresse eingeben"
                        className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    )}
                    {standort.lat != null && (
                      <p className="text-success text-xs flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" />
                        Koordinaten erfasst ({standort.lat.toFixed(4)}, {standort.lng?.toFixed(4)}) — Einsatzgebiet wird neu berechnet
                      </p>
                    )}
                  </div>
                </div>

                {/* AAR-369: Anzeige-Name + Profilbeschreibung (sichtbar für Kunden) */}
                <ControlledRow
                  label="Anzeigename"
                  value={form.anzeigename}
                  onChange={v => updateField('anzeigename', v)}
                  placeholder="z.B. Max M. — Fallback: Vor- + Nachname"
                />
                <div className={ROW_WRAPPER_CLS}>
                  <span className={ROW_LABEL_CLS}>Profiltext</span>
                  <textarea
                    value={form.profilbeschreibung}
                    onChange={e => updateField('profilbeschreibung', e.target.value)}
                    placeholder="z.B. Ihr persönlicher Sachverständiger mit 15 Jahren Erfahrung"
                    rows={2}
                    maxLength={200}
                    className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy placeholder-claimondo-ondo/60 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
                  />
                </div>

                <div className="pt-3 mt-3 border-t border-claimondo-border">
                  <p className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wide mb-1 px-1">Firma / Steuerliches</p>
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
                {/* AAR-369 */}
                <FieldRow label="Anzeigename" value={profile.anzeigename ?? '—'} />
                <FieldRow label="Profiltext" value={profile.profilbeschreibung ?? '—'} />
                <div className="pt-3 mt-3 border-t border-claimondo-border">
                  <p className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wide mb-1 px-1">Firma / Steuerliches</p>
                </div>
                <FieldRow label="Firmenname" value={sv.firmenname ?? '—'} />
                <FieldRow label="Rechtsform" value={sv.rechtsform ?? '—'} />
                <FieldRow label="Steuernummer" value={sv.steuernummer ?? '—'} />
                <FieldRow label="USt-IdNr" value={sv.ust_id ?? '—'} />
                <FieldRow label="HRB" value={sv.hrb ?? '—'} />
              </>
            )}
          </div>

          {/* Actions */}
          {editing && (
            <div className="flex gap-2 pt-4 border-t border-claimondo-border">
              <Button variant="bare" size="md" className="flex-1" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
              <LoadingButton
                type="submit"
                isLoading={saving}
                loadingText="Wird gespeichert..."
                className="flex-1 py-2.5 rounded-ios-xl text-sm font-semibold bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white transition-colors disabled:opacity-40"
              >
                Speichern
              </LoadingButton>
            </div>
          )}

          {error && (
            <p className="text-danger text-sm bg-danger-soft border border-danger/30 rounded-ios-xl p-3 mt-2">{error}</p>
          )}
        </SectionCard>
      </form>
    </>
  )
}
