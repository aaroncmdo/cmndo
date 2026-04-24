'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import { updateOwnProfile } from '@/lib/actions/sv/update-own-profile'
import { ANREDE_OPTIONEN, TITEL_OPTIONEN, QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN } from '@/app/admin/sachverstaendige/anlegen/constants'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { LoadingButton } from '@/components/ui/loading-button'
import PhoneVerificationModal from '@/components/auth/PhoneVerificationModal'
// AAR-344: 2FA-Nummer-Änderung (Self-Service, eingeloggter User)
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
import { MapPinIcon, InfoIcon } from 'lucide-react'
// AAR-369: Profilbild-Upload + Anzeige-Felder
import AvatarUpload from '@/components/shared/AvatarUpload'
// AAR-500 N5: Benachrichtigungs-Präferenzen (Quiet-Hours + Channel-Opt-Outs + Feintuning)
import {
  NotificationPreferencesForm,
  type NotificationPreferencesFormValue,
} from '@/components/notifications/NotificationPreferencesForm'

type Profile = { anrede: string | null; titel: string | null; vorname: string | null; nachname: string | null; telefon: string | null; rolle: string; twofa_telefon?: string | null; avatar_url?: string | null; anzeigename?: string | null; profilbeschreibung?: string | null }
type SV = { id: string; paket: string; gebiet_plz: string | null; ist_aktiv: boolean; paket_faelle_gesamt: number; offene_faelle: number; kalender_typ: string; kalender_sync_aktiv: boolean; kalender_sync_letzte: string | null; qualifikationen_neu: string[] | null; spezifikationen: string[] | null; schadenarten: string[] | null; standort_adresse: string | null; standort_plz: string | null; standort_lat: number | null; standort_lng: number | null; standort_place_id: string | null; firmenname: string | null; rechtsform: string | null; steuernummer: string | null; ust_id: string | null; hrb: string | null; rolle_in_organisation: string | null; community_anonym: boolean }

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
  notificationPrefs,
  googleConnected,
}: {
  email: string
  profile: Profile
  sv: SV
  faelleCount: number
  pendingTermine: PendingTermin[]
  notificationPrefs: NotificationPreferencesFormValue
  // AAR-707: echter OAuth-Status aus profiles.google_refresh_token
  googleConnected: boolean
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
    <div className="h-full flex flex-col">
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places&loading=async&v=weekly`}
          strategy="lazyOnload"
          onReady={() => setMapsReady(true)}
        />
      )}

      {/* BUG-91: Sticky Header — bleibt beim Scrollen oben sichtbar */}
      <div className="flex-shrink-0 sticky top-0 z-20 bg-white border-b border-claimondo-border px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-claimondo-navy">Mein Profil</h1>
          <p className="text-claimondo-ondo text-xs">Stammdaten + Firma + Standort</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => { setEditing(true); setSuccess(false) }}
            className="px-4 py-2 text-xs font-medium text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] rounded-xl transition-colors"
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
          <div className="bg-[var(--brand-secondary)]/5 border border-[var(--brand-secondary)]/20 rounded-xl p-3 mb-4 max-w-4xl">
            <p className="text-[var(--brand-primary)] text-sm">Profil gespeichert.</p>
          </div>
        )}

        <form onSubmit={handleSave} className="max-w-4xl">
          <div className="bg-white rounded-2xl p-6 border border-claimondo-border space-y-4">
            {/* Avatar — AAR-369: Upload statt statischer Initialen-Kreis */}
            <div className="flex items-center gap-4 pb-4 border-b border-claimondo-border">
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
              <div className="flex gap-2 py-2.5 border-b border-claimondo-border/50">
                <span className="text-claimondo-ondo text-sm w-36 shrink-0">E-Mail</span>
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
                  <div className="flex gap-2 py-2 border-b border-claimondo-border/50">
                    <span className="text-claimondo-ondo text-sm w-36 shrink-0 pt-2">Anschrift</span>
                    <div className="flex-1 space-y-2">
                      {mapsReady ? (
                        <GooglePlaceAutocomplete
                          defaultValue={standort.adresse}
                          placeholder="Büro-/Wohnadresse eingeben"
                          onSelect={onPlaceSelect}
                          className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={standort.adresse}
                          onChange={e => setStandort(prev => ({ ...prev, adresse: e.target.value }))}
                          placeholder="Büro-/Wohnadresse eingeben"
                          className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
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

                  {/* AAR-369: Anzeige-Name + Profilbeschreibung (sichtbar für Kunden) */}
                  <ControlledRow
                    label="Anzeigename"
                    value={form.anzeigename}
                    onChange={v => updateField('anzeigename', v)}
                    placeholder="z.B. Max M. — Fallback: Vor- + Nachname"
                  />
                  <div className="flex gap-2 py-2 border-b border-claimondo-border/50">
                    <span className="text-claimondo-ondo text-sm w-36 shrink-0 pt-2">Profiltext</span>
                    <textarea
                      value={form.profilbeschreibung}
                      onChange={e => updateField('profilbeschreibung', e.target.value)}
                      placeholder="z.B. Ihr persönlicher Sachverständiger mit 15 Jahren Erfahrung"
                      rows={2}
                      maxLength={200}
                      className="flex-1 bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
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

              <div className="pt-3 mt-3 border-t border-claimondo-border">
                <p className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wide mb-1 px-1">Vertrag</p>
              </div>
              <FieldRow label="Paket" value={PAKET_LABELS[sv.paket] ?? sv.paket ?? '—'} />
              <FieldRow label="Offene Fälle" value={`${sv.offene_faelle} / ${sv.paket_faelle_gesamt}`} />
              <FieldRow label="Zugewiesene Fälle gesamt" value={String(faelleCount)} />
            </div>

            {/* Actions */}
            {editing && (
              <div className="flex gap-2 pt-4 border-t border-claimondo-border">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm text-claimondo-ondo hover:text-claimondo-navy hover:bg-[#f8f9fb] transition-colors"
                >
                  Abbrechen
                </button>
                <LoadingButton
                  type="submit"
                  isLoading={saving}
                  loadingText="Wird gespeichert..."
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white transition-colors disabled:opacity-40"
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

        {/* AAR-720: Kalender-Verbindung komplett nach Einstellungen umgezogen.
            Google, Apple iCloud, CalDAV + Status + Disconnect liegen jetzt
            unter /gutachter/einstellungen/kalender. Hier auf dem Profil nur
            noch ein Status-Hinweis mit Deep-Link. */}
        <Link
          href="/gutachter/einstellungen/kalender"
          className="bg-white rounded-2xl p-4 border border-claimondo-border mt-5 flex items-center gap-3 hover:border-[#4573A2] transition-colors group"
        >
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${googleConnected ? 'bg-green-500' : 'bg-zinc-400'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-claimondo-navy">
              Kalender: {googleConnected ? 'Google verbunden' : 'Nicht verbunden'}
            </p>
            <p className="text-xs text-claimondo-ondo mt-0.5">
              Verwalten unter Einstellungen → Kalender
            </p>
          </div>
          <span className="text-[11px] text-[#4573A2] group-hover:text-[#0D1B3E]">Öffnen →</span>
        </Link>

        {/* KFZ-154: 3 Spezialisierungs-Listen */}
        <div className="bg-white rounded-2xl p-6 border border-claimondo-border mt-5">
          <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Spezialisierungen</h2>
          <p className="text-xs text-claimondo-ondo/70 mb-4">
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

        {/* KFZ-152 Phase 3 Follow-up: Privacy-Toggle (nur fuer Community-Mitglieder) */}
        {sv.rolle_in_organisation === 'community_member' && (
          <div className="bg-white rounded-2xl p-6 border border-claimondo-border mt-5">
            <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Community-Privatsphäre</h2>
            <p className="text-xs text-claimondo-ondo/70 mb-4">
              Wenn aktiv, sehen andere Community-Mitglieder im Leaderboard „Anonym" statt deines Namens.
              Deine Statistiken (Fälle, Umsatz) bleiben sichtbar — nur dein Name wird verborgen.
            </p>
            <PrivacyToggle svId={sv.id} initial={sv.community_anonym} />
          </div>
        )}

        {/* KFZ-158 Phase 2: GPS-Tracking Privacy-Toggle */}
        <div className="bg-white rounded-2xl p-6 border border-claimondo-border mt-5">
          <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Live-Standort</h2>
          <p className="text-xs text-claimondo-ondo/70 mb-4">
            Wenn aktiv, wird dein Standort während Terminen live getrackt.
            Ermöglicht optimierte Routenführung und Admin-Übersicht.
          </p>
          <GpsTrackingToggle svId={sv.id} initial={(sv as Record<string, unknown>).live_tracking_enabled !== false} />
        </div>

        {/* AAR-344: 2FA-Nummer-Änderungs-Flow (eigenes Panel, nutzt shared Component) */}
        <div className="mt-5">
          <TwoFaPhoneChange
            aktuelleTwofaTelefon={profile.twofa_telefon ?? null}
            fallbackTelefon={profile.telefon}
          />
        </div>
        {/* KFZ-184: Telefon-Verifizierung fuer 2FA */}
        <TwoFaPhoneSection />

        {/* Offene Terminanfragen */}
        {pendingTermine.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-claimondo-border mt-5">
            <h2 className="text-sm font-medium text-claimondo-ondo mb-4">
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
        {/* AAR-500 N5: Benachrichtigungs-Präferenzen */}
        <NotificationSection initial={notificationPrefs} />
      </div>
    </div>
  )
}

// AAR-500 N5: Settings-Section-Wrapper für Benachrichtigungen.
function NotificationSection({ initial }: { initial: NotificationPreferencesFormValue }) {
  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-5 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-4">Benachrichtigungen</h2>
      <NotificationPreferencesForm role="sachverstaendiger" initial={initial} />
    </div>
  )
}

// AAR-454: Altes V1-Branding-UI (Toggle + Farb-Picker + Preview) komplett
// entfernt. Der neue Branding-Editor mit Live-Preview + Font-Picker unter
// /gutachter/profil/branding (AAR-422) ist die einzige Anlaufstelle. Hier
// bleibt nur eine schmale Verweis-Card.

function BrandingSection({ svId: _svId }: { svId: string }) {
  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-5 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-4">Branding</h2>
      <a
        href="/gutachter/profil/branding"
        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/5 hover:bg-[var(--brand-secondary)]/10 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--brand-primary)]">Branding-Editor mit Live-Preview</p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            Logo hochladen — Farben und Schriftart werden automatisch extrahiert.
          </p>
        </div>
        <span className="text-xs font-medium text-[var(--brand-secondary)] whitespace-nowrap">Öffnen →</span>
      </a>
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
    <div className="bg-[#f8f9fb]/50 rounded-xl p-4 border border-claimondo-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-claimondo-navy text-sm font-medium">
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
            className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <input
            type="datetime-local"
            value={gegenvorschlag}
            onChange={e => setGegenvorschlag(e.target.value)}
            required
            className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <p className="text-claimondo-ondo text-xs">Gegenvorschlag ist Pflicht</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 py-2 rounded-lg text-xs text-claimondo-ondo hover:text-claimondo-navy hover:bg-[#f8f9fb] transition-colors"
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

// KFZ-152 Phase 3 Follow-up: Privacy-Toggle fuer Community-Mitglieder.
// Toggled sachverstaendige.community_anonym zwischen true/false.
function PrivacyToggle({ svId, initial }: { svId: string; initial: boolean }) {
  const [active, setActive] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function toggle() {
    setSaving(true)
    setError(null)
    const next = !active
    setActive(next)
    try {
      const supabase = createClient()
      const { error: updErr } = await supabase
        .from('sachverstaendige')
        .update({ community_anonym: next })
        .eq('id', svId)
      if (updErr) {
        setError(updErr.message)
        setActive(!next) // rollback UI
      } else {
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
          active ? 'bg-emerald-500' : 'bg-claimondo-border'
        }`}
      >
        <span className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
          active ? 'translate-x-6' : 'translate-x-0.5'
        }`} />
      </button>
      <span className="ml-3 text-sm text-claimondo-navy">
        {active ? 'Anonym aktiviert' : 'Name sichtbar'}
        {saving && <span className="text-claimondo-ondo/70 text-xs ml-2">speichert...</span>}
      </span>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

// KFZ-158 Phase 2: GPS-Tracking Toggle
// KFZ-184: 2FA Telefon-Verifizierung Section
function TwoFaPhoneSection() {
  const [showModal, setShowModal] = useState(false)
  return (
    <div className="bg-white rounded-2xl p-6 border border-claimondo-border mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Zwei-Faktor-Authentifizierung</h2>
      <p className="text-xs text-claimondo-ondo/70 mb-4">Verifizieren Sie Ihre Telefonnummer für den SMS-Login-Code.</p>
      <button onClick={() => setShowModal(true)}
        className="px-4 py-2 rounded-xl bg-[var(--brand-secondary)] hover:bg-[var(--brand-primary)] text-white text-sm font-semibold transition-colors">
        Telefon verifizieren
      </button>
      {showModal && <PhoneVerificationModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

function GpsTrackingToggle({ svId, initial }: { svId: string; initial: boolean }) {
  const [active, setActive] = useState(initial)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function toggle() {
    setSaving(true)
    const next = !active
    setActive(next)
    const supabase = createClient()
    await supabase.from('sachverstaendige').update({ live_tracking_enabled: next }).eq('id', svId)
    setSaving(false)
    router.refresh()
  }

  return (
    <div>
      <button type="button" onClick={toggle} disabled={saving}
        className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${active ? 'bg-[var(--brand-secondary)]' : 'bg-claimondo-border'}`}>
        <span className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${active ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
      <span className="ml-3 text-sm text-claimondo-navy">
        {active ? 'Live-Tracking aktiv' : 'Tracking deaktiviert'}
        {saving && <span className="text-claimondo-ondo/70 text-xs ml-2">speichert...</span>}
      </span>
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
        <h3 className="text-sm font-medium text-claimondo-navy">{title}</h3>
        <span className="text-[10px] text-claimondo-ondo/70">
          {values.length} gewaehlt{saving ? ' · speichert...' : ''}
        </span>
      </div>
      <p className="text-xs text-claimondo-ondo mb-2">{hint}</p>
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
                  ? 'bg-[var(--brand-secondary)] text-white'
                  : 'bg-[#f8f9fb] text-claimondo-ondo hover:text-claimondo-navy'
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
    <div className="flex gap-2 py-2.5 border-b border-claimondo-border/50 last:border-0">
      <span className="text-claimondo-ondo text-sm w-36 shrink-0">{label}</span>
      <span className="text-claimondo-navy text-sm">{value}</span>
    </div>
  )
}

function EditRow({ label, name, defaultValue, type = 'text', placeholder }: {
  label: string; name: string; defaultValue: string; type?: string; placeholder?: string
}) {
  return (
    <div className="flex gap-2 py-2 border-b border-claimondo-border/50">
      <span className="text-claimondo-ondo text-sm w-36 shrink-0 pt-2">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="flex-1 bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
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
    <div className="flex gap-2 py-2 border-b border-claimondo-border/50">
      <span className="text-claimondo-ondo text-sm w-36 shrink-0 pt-2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
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
    <div className="flex gap-2 py-2 border-b border-claimondo-border/50">
      <span className="text-claimondo-ondo text-sm w-36 shrink-0 pt-2">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
