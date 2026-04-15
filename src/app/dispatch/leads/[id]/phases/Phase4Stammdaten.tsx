'use client'

// AAR-140 / W6: Phase 4 Stammdaten mit Inline-Edit + Auto-Save on-blur.
// Alle Felder sind einzeln editierbar und werden beim Verlassen des Inputs
// automatisch gespeichert (saveStammdaten-Allowlist). Auto-Flags für
// Gegner-KZ (Fahrerflucht / Auslandskennzeichen) werden live aus
// gegner-kz-flags.ts berechnet und mitgespeichert.

import { useState, useTransition } from 'react'
import { saveStammdaten } from '../actions'
import { checkKZFlags } from '../lib/gegner-kz-flags'
import { useDispatchPhase } from '../lib/phase-context'
import CardentityButton from '../CardentityButton'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import {
  UserIcon,
  CarIcon,
  ShieldIcon,
  UsersIcon,
  AlertTriangleIcon,
  GlobeIcon,
  CameraIcon,
  LoaderIcon,
  CheckIcon,
} from 'lucide-react'

// Top-20 KFZ-Marken in Deutschland nach Zulassungen (KBA 2024) + Sonstiges
const KFZ_MARKEN = [
  'VW', 'BMW', 'Mercedes-Benz', 'Audi', 'Opel', 'Ford', 'Toyota',
  'Renault', 'Skoda', 'Hyundai', 'Seat', 'Peugeot', 'Nissan', 'Fiat',
  'Mazda', 'Kia', 'Honda', 'Volvo', 'Dacia', 'Citroën',
] as const

type LeadFields = {
  vorname?: string | null
  nachname?: string | null
  telefon?: string | null
  email?: string | null
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  fin?: string | null
  cardentity_enriched_at?: string | null
  hat_vorschaeden?: boolean | null
  vorschaeden_beschreibung?: string | null
  finanzierung_leasing?: 'keine' | 'finanzierung' | 'leasing' | string | null
  vorsteuerabzugsberechtigt?: boolean | null
  gegner_bekannt?: boolean | null
  gegner_kennzeichen?: string | null
  gegner_versicherung?: string | null
  gegner_schadennummer?: string | null
  unfalldatum?: string | null
  unfall_uhrzeit?: string | null
  unfallort?: string | null
  unfallort_lat?: number | null
  unfallort_lng?: number | null
  unfallort_kategorie?: string | null
  fahrerflucht?: boolean | null
  auslandskennzeichen?: boolean | null
  schadentyp?: string | null
  parkplatz_kamera?: boolean | null
  zeugen?: boolean | null
}

// Auto-Format für deutsche Kennzeichen: alles groß + Whitespace entfernen
function formatKennzeichen(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Generische Inline-Feld-Komponente mit auto-save on-blur.
 * Speichert nur wenn sich der Wert geändert hat. Zeigt Spinner während Save
 * und Haken direkt nach erfolgreichem Save (2s).
 */
function InlineField({
  label,
  value,
  fieldName,
  leadId,
  type = 'text',
  placeholder,
  transform,
  hint,
}: {
  label: string
  value: string | null | undefined
  fieldName: string
  leadId: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'time'
  placeholder?: string
  transform?: (raw: string) => string
  hint?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  function handleBlur() {
    const final = transform ? transform(draft) : draft
    if (final === (value ?? '')) return
    setStatus('saving')
    startTransition(async () => {
      const r = await saveStammdaten(leadId, { [fieldName]: final || null })
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
        {label}
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-blue-400 animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
        {status === 'error' && <span className="text-red-500">Fehler</span>}
      </label>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`text-sm font-medium bg-transparent border-b w-full py-0.5 outline-none transition-colors ${
          status === 'saving'
            ? 'border-blue-300'
            : status === 'saved'
              ? 'border-green-300'
              : status === 'error'
                ? 'border-red-300'
                : 'border-gray-200 hover:border-gray-300 focus:border-[#4573A2]'
        }`}
      />
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function Phase4Stammdaten() {
  const { lead, qualification } = useDispatchPhase()
  const l = lead as unknown as LeadFields
  const leadId = lead.id
  const [gegnerKzDraft, setGegnerKzDraft] = useState(l.gegner_kennzeichen ?? '')
  const [, startTransition] = useTransition()

  // Live-Flags aus gegner-kz-flags — bei jedem Tippen neu berechnet
  const kzFlags = checkKZFlags(gegnerKzDraft, l.schadentyp ?? null)

  function saveGegnerKz() {
    const normalized = gegnerKzDraft.toUpperCase().trim()
    if (normalized === (l.gegner_kennzeichen ?? '')) return
    const flags = checkKZFlags(normalized, l.schadentyp ?? null)
    startTransition(async () => {
      await saveStammdaten(leadId, {
        gegner_kennzeichen: normalized || null,
        fahrerflucht: flags.fahrerflucht,
        auslandskennzeichen: flags.auslandskennzeichen,
      })
    })
  }

  function saveToggle(field: string, value: boolean | string | null) {
    startTransition(async () => {
      await saveStammdaten(leadId, { [field]: value })
    })
  }

  function saveParkplatzKamera(v: boolean) {
    // parkplatz_kamera liegt auf leads aber nicht in der Stammdaten-Allowlist
    // (wird über saveSchadentyp-Action gesetzt). Für Phase 4 reicht ein
    // einfacher Client-State — beim nächsten Speichern von schadentyp/kamera
    // via SchadentypPicker in Phase 3 wird es konsistent abgelegt.
    // Für den MVP hier: separate Speicherung via saveSchadentyp-Aufruf.
    startTransition(async () => {
      const { saveSchadentyp } = await import('../actions')
      const typ = l.schadentyp as Parameters<typeof saveSchadentyp>[1]
      if (!typ) return
      await saveSchadentyp(leadId, typ, null, v)
    })
  }

  const marke = l.fahrzeug_hersteller ?? ''
  const isMarkeInList = marke !== '' && (KFZ_MARKEN as readonly string[]).includes(marke)
  const [markeMode, setMarkeMode] = useState<'dropdown' | 'freitext'>(
    marke === '' ? 'dropdown' : isMarkeInList ? 'dropdown' : 'freitext',
  )

  return (
    <div className="space-y-4">
      {/* 1. Kundendaten */}
      <Card icon={<UserIcon className="w-4 h-4 text-gray-400" />} title="Kundendaten">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineField label="Vorname" value={l.vorname} fieldName="vorname" leadId={leadId} />
          <InlineField label="Nachname" value={l.nachname} fieldName="nachname" leadId={leadId} />
          <InlineField
            label="Telefon (WhatsApp)"
            value={l.telefon}
            fieldName="telefon"
            leadId={leadId}
            type="tel"
            hint="WhatsApp-Nummer für FlowLink-Versand"
          />
          <InlineField label="E-Mail" value={l.email} fieldName="email" leadId={leadId} type="email" />
        </div>
      </Card>

      {/* 2. Fahrzeugdaten */}
      <Card icon={<CarIcon className="w-4 h-4 text-gray-400" />} title="Fahrzeugdaten">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineField
            label="Eigenes Kennzeichen"
            value={l.kennzeichen}
            fieldName="kennzeichen"
            leadId={leadId}
            transform={formatKennzeichen}
            placeholder="XX-XX 1234"
          />

          {/* Marke — Dropdown mit Freitext-Fallback */}
          <div className="space-y-0.5">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Marke</label>
            {markeMode === 'dropdown' ? (
              <select
                value={isMarkeInList ? marke : ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__freitext__') {
                    setMarkeMode('freitext')
                    return
                  }
                  saveToggle('fahrzeug_hersteller', v || null)
                }}
                className="text-sm font-medium bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-[#4573A2] w-full py-0.5 outline-none"
              >
                <option value="">— wählen —</option>
                {KFZ_MARKEN.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="__freitext__">Sonstiges (Freitext) ...</option>
              </select>
            ) : (
              <InlineField
                label=""
                value={l.fahrzeug_hersteller}
                fieldName="fahrzeug_hersteller"
                leadId={leadId}
                placeholder="Marke eingeben"
              />
            )}
          </div>

          <InlineField
            label="Modell"
            value={l.fahrzeug_modell}
            fieldName="fahrzeug_modell"
            leadId={leadId}
          />

          {/* Eigentümer (approximiert via finanzierung_leasing + vorsteuerabzugsberechtigt) */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Eigentümer-Typ</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  saveToggle('finanzierung_leasing', 'keine')
                  saveToggle('vorsteuerabzugsberechtigt', false)
                }}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  (l.finanzierung_leasing ?? 'keine') === 'keine' && !l.vorsteuerabzugsberechtigt
                    ? 'bg-[#4573A2] text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                Privat
              </button>
              <button
                type="button"
                onClick={() => saveToggle('finanzierung_leasing', 'leasing')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.finanzierung_leasing === 'leasing'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                Leasing
              </button>
              <button
                type="button"
                onClick={() => saveToggle('vorsteuerabzugsberechtigt', true)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.vorsteuerabzugsberechtigt === true
                    ? 'bg-[#0D1B3E] text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                Gewerblich
              </button>
            </div>
            {l.finanzierung_leasing === 'leasing' && (
              <p className="text-[10px] text-amber-700 italic">
                Leasing-Vollmacht anfordern — Frist 48h.
              </p>
            )}
          </div>

          {/* Vorschäden */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Vorschäden bekannt?</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => saveToggle('hat_vorschaeden', true)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.hat_vorschaeden === true ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Ja, Vorschäden
              </button>
              <button
                type="button"
                onClick={() => saveToggle('hat_vorschaeden', false)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.hat_vorschaeden === false ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Nein
              </button>
            </div>
            {l.hat_vorschaeden === true && (
              <InlineField
                label="Beschreibung"
                value={l.vorschaeden_beschreibung}
                fieldName="vorschaeden_beschreibung"
                leadId={leadId}
                placeholder="Welche Vorschäden? (Bereich / Schadenhöhe)"
              />
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <CardentityButton
            leadId={leadId}
            hasFin={!!l.fin}
            alreadyEnriched={!!l.cardentity_enriched_at}
          />
        </div>
      </Card>

      {/* 3. Gegner & Unfall */}
      <Card icon={<ShieldIcon className="w-4 h-4 text-gray-400" />} title="Gegner & Unfall">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Gegner-KZ mit Live-Flags */}
          <div className="space-y-0.5 sm:col-span-2">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Gegner-Kennzeichen</label>
            <input
              type="text"
              value={gegnerKzDraft}
              onChange={(e) => setGegnerKzDraft(e.target.value)}
              onBlur={saveGegnerKz}
              placeholder="Kennzeichen oder leer lassen bei Fahrerflucht"
              className="text-sm font-medium bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-[#4573A2] w-full py-0.5 outline-none"
            />
            {kzFlags.warnung && (
              <p className={`text-[11px] mt-1 flex items-start gap-1 ${kzFlags.fahrerflucht ? 'text-red-700' : 'text-amber-700'}`}>
                {kzFlags.fahrerflucht ? (
                  <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <GlobeIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <span>{kzFlags.warnung}</span>
              </p>
            )}
            {kzFlags.showKameraCheck && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-blue-900 flex items-center gap-1">
                  <CameraIcon className="w-3.5 h-3.5" /> Parkplatz + kein KZ — gibt es eine Kamera vor Ort?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveParkplatzKamera(true)}
                    className={`flex-1 px-2 py-1 rounded text-[11px] font-medium ${
                      l.parkplatz_kamera === true ? 'bg-[#4573A2] text-white' : 'bg-white border border-blue-200 text-blue-800'
                    }`}
                  >
                    Ja, Kamera vorhanden
                  </button>
                  <button
                    type="button"
                    onClick={() => saveParkplatzKamera(false)}
                    className={`flex-1 px-2 py-1 rounded text-[11px] font-medium ${
                      l.parkplatz_kamera === false ? 'bg-[#4573A2] text-white' : 'bg-white border border-blue-200 text-blue-800'
                    }`}
                  >
                    Nein (⚠️ wird disqualifiziert)
                  </button>
                </div>
              </div>
            )}
          </div>

          <InlineField
            label="Gegner-Versicherung"
            value={l.gegner_versicherung}
            fieldName="gegner_versicherung"
            leadId={leadId}
          />
          <InlineField
            label="Schadennummer (optional)"
            value={l.gegner_schadennummer}
            fieldName="gegner_schadennummer"
            leadId={leadId}
          />
          <InlineField
            label="Unfalldatum"
            value={l.unfalldatum ? l.unfalldatum.slice(0, 10) : null}
            fieldName="unfalldatum"
            leadId={leadId}
            type="date"
          />
          <InlineField
            label="Unfall-Uhrzeit (ca.)"
            value={l.unfall_uhrzeit}
            fieldName="unfall_uhrzeit"
            leadId={leadId}
            placeholder="z.B. 14:30 oder ca. 14 Uhr"
          />

          {/* Unfallort Google Places */}
          <div className="space-y-0.5 sm:col-span-2">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Unfallort</label>
            <GooglePlaceAutocomplete
              defaultValue={l.unfallort ?? ''}
              placeholder="Adresse wählen ..."
              onSelect={(r) =>
                startTransition(async () => {
                  await saveStammdaten(leadId, {
                    unfallort: r.adresse,
                    unfallort_lat: r.lat,
                    unfallort_lng: r.lng,
                  })
                })
              }
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        </div>
      </Card>

      {/* 4. Zeugen */}
      <Card icon={<UsersIcon className="w-4 h-4 text-gray-400" />} title="Zeugen">
        <p className="text-[11px] text-gray-500">
          Nur abfragen bei Unklarheiten zum Hergang. Falls Kontaktdaten vorhanden, kann der
          Kunde diese gleich im Portal-FlowLink eingeben.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => saveToggle('zeugen', true)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              l.zeugen === true ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Ja — Zeugen vorhanden
          </button>
          <button
            type="button"
            onClick={() => saveToggle('zeugen', false)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              l.zeugen === false ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Nein
          </button>
        </div>
      </Card>

      {!qualification.q6_gegnerKz && (
        <p className="text-[11px] text-amber-700 flex items-start gap-1 px-1">
          <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Phase 4 erst abgeschlossen wenn Gegner-KZ eingegeben ODER Parkplatz-Kamera=Ja ODER
          (Fahrerflucht + Polizei=Ja).
        </p>
      )}
    </div>
  )
}
