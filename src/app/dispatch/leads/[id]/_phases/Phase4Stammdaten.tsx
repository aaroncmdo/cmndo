'use client'

// AAR-140 / W6: Phase 4 Stammdaten mit Inline-Edit + Auto-Save on-blur.
// Alle Felder sind einzeln editierbar und werden beim Verlassen des Inputs
// automatisch gespeichert (saveStammdaten-Allowlist). Auto-Flags für
// Gegner-KZ (Fahrerflucht / Auslandskennzeichen) werden live aus
// gegner-kz-flags.ts berechnet und mitgespeichert.

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { saveStammdaten } from '../actions'
import { checkKZFlags } from '../_lib/gegner-kz-flags'
import { useDispatchPhase } from '../_lib/phase-context'
import { useCarQuery } from '../_hooks/useCarQuery'
// AAR-177 Fix #1: CardentityButton-Import entfernt (Button war nicht
// funktionsreif und Text irritierte — Cardentity läuft jetzt im Hintergrund
// via ZB1-OCR-Trigger in /api/ocr-fahrzeugschein Step 6).
// AAR-311: Manueller Cardentity-Typ-B-Trigger als shared Komponente.
// AAR-352: Zb1UploadCard + PolizeiberichtUploadCard ersetzt durch
// DokumenteAnfordernCard (kombinierte Multi-Slot-Anfrage in einem Link).
import DokumenteAnfordernCard from './DokumenteAnfordernCard'
import BkatAnalysePanel from './BkatAnalysePanel'
import { CardentityTypBButton } from '@/components/cardentity/CardentityTypBButton'
import { requestCardentityTypBForLead, enrichLeadCardentity } from '../_actions/cardentity'
// AAR-314: Auslandskennzeichen — Anfrage an Deutsches Büro Grüne Karte mit Reminder
import { setGrueneKarteAngefragt } from '../_actions/gruene-karte'
import VersicherungAutocomplete, { type VersicherungSelection } from '@/components/VersicherungAutocomplete'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { parseKennzeichen, buildKennzeichen } from '@/lib/format/kennzeichen'
import {
  CarIcon,
  ShieldIcon,
  UsersIcon,
  AlertTriangleIcon,
  GlobeIcon,
  CameraIcon,
  LoaderIcon,
  CheckIcon,
  InfoIcon,
  UserCheckIcon,
  MapPinIcon,
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
  kennzeichen_kreis?: string | null
  kennzeichen_buchstaben?: string | null
  kennzeichen_zahl?: string | null
  kennzeichen_suffix?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  fahrzeug_baujahr?: number | null
  fin?: string | null
  // AAR-305: Schadenshergang-Pflicht bei fahrbereitem Fahrzeug (Banner in Phase 4)
  fahrzeug_fahrbereit?: boolean | null
  schadens_hergang?: string | null
  // AAR-665-follow: Separate Spalte fahrzeugschaden_beschreibung für „was am
  // Auto kaputt ist". sachschaden_beschreibung bleibt in Phase 1 für Dritt-
  // schaden (Leitplanke, iPhone). Haiku-Vision schreibt in
  // fahrzeugschaden_beschreibung.
  fahrzeugschaden_beschreibung?: string | null
  schadensfoto_urls?: string[] | null
  // AAR-182: ZB1-Upload-Tracking
  zb1_status?: string | null
  zb1_hochgeladen_am?: string | null
  // AAR-263: Polizeibericht-Upload-Tracking (telefon/email schon oben)
  polizei_vor_ort?: boolean | null
  polizeibericht_pflicht?: boolean | null
  polizeibericht_status?: string | null
  polizeibericht_hochgeladen_am?: string | null
  cardentity_enriched_at?: string | null
  // AAR-311: Cardentity Typ-B Status für den manuellen Trigger-Button
  vorschaden_typ_b_bericht?: Record<string, unknown> | null
  hat_vorschaeden?: boolean | null
  vorschaden_anzahl?: number | null
  vorschaden_letzter_datum?: string | null
  cardentity_abfrage_am?: string | null
  vorschaeden_beschreibung?: string | null
  personenschaden_flag?: boolean | null
  sachschaden_flag?: boolean | null
  finanzierung_leasing?: 'keine' | 'finanzierung' | 'leasing' | string | null
  vorsteuerabzugsberechtigt?: boolean | null
  gegner_bekannt?: boolean | null
  gegner_kennzeichen?: string | null
  gegner_versicherung?: string | null
  // AAR-265: FK auf versicherungen-Stammdaten (Autocomplete)
  gegner_versicherung_id?: string | null
  gegner_schadennummer?: string | null
  gegner_versicherungsnummer?: string | null
  unfalldatum?: string | null
  unfall_uhrzeit?: string | null
  unfallort?: string | null
  unfallort_lat?: number | null
  unfallort_lng?: number | null
  unfallort_kategorie?: string | null
  fahrerflucht?: boolean | null
  auslandskennzeichen?: boolean | null
  // AAR-314: Datum der Anfrage beim Deutschen Büro Grüne Karte (10-Tage-Wartezeit)
  gegner_versicherung_anfrage_datum?: string | null
  schadentyp?: string | null
  bkat_unfallart?: string | null
  schadentyp_freitext?: string | null
  parkplatz_kamera?: boolean | null
  zeugen?: boolean | null
  // AAR-208: Halter-Daten aus ZB1-OCR (Fahrzeugschein)
  halter_vorname?: string | null
  halter_nachname?: string | null
  halter_strasse?: string | null
  halter_plz?: string | null
  halter_stadt?: string | null
  // AAR-318: Geburtsdatum manuell oder aus Kunde übernommen (nicht in ZB1)
  halter_geburtsdatum?: string | null
  ist_fahrzeughalter?: boolean | null
  kunde_adresse?: string | null
  kunde_strasse?: string | null
  kunde_plz?: string | null
  kunde_stadt?: string | null
  kunde_lat?: number | null
  kunde_lng?: number | null
  lackfarbe_code?: string | null
  fahrzeug_farbe?: string | null
  hsn?: string | null
  tsn?: string | null
  // AAR-298: Zeugen-Kontaktdaten als JSONB-Array (zeugen-Flag schon weiter oben)
  zeugen_kontakte?: Array<{ name: string; telefon?: string; email?: string; notiz?: string }> | null
}

// Auto-Format für deutsche Kennzeichen mit Pattern-Matching.
// AAR-188 Fix #4: Aus „KAB1234" / „ko ab 123" → „K-AB 1234" / „KO-AB 123".
// AAR-224: Greedy-Backtracking-Bug behoben — vorher matchte „KAB1234" als
// (KA)(B)(1234) → „KA-B 1234" statt korrekt „K-AB 1234". Jetzt zerlegen wir
// strikt aus den BEKANNTEN Teilen: hinten Ziffern (+ optional E/H), davor
// 1-2 Buchstaben (Erkennung), davor 1-3 Buchstaben (Stadt).
// Bei unvollständiger / nicht erkennbarer Eingabe geben wir cleaned Uppercase
// zurück (ohne Spaces/Bindestriche) damit der MA korrigieren kann.
function formatKennzeichen(raw: string): string {
  const clean = raw.replace(/[\s-]/g, '').toUpperCase()
  // Schritt 1: Ziffern + optional Suffix-Buchstabe (E=Elektro, H=Historisch) ans Ende.
  const tail = clean.match(/(\d{1,4})([EH]?)$/)
  if (!tail) return clean
  const ziffern = tail[1] + tail[2]
  const buchstaben = clean.slice(0, clean.length - ziffern.length)
  // Schritt 2: Buchstaben in Stadt (1-3) + Erkennung (1-2) splitten.
  // Erkennung greedy hinten = letzte 1-2 Buchstaben, Stadt = Rest.
  // Beispiel KAB → Stadt=K, Erkennung=AB | KOAB → Stadt=KO, Erkennung=AB
  const erkennung = buchstaben.slice(-2).match(/^[A-ZÄÖÜ]{1,2}$/) ? buchstaben.slice(-2) : buchstaben.slice(-1)
  const stadt = buchstaben.slice(0, buchstaben.length - erkennung.length)
  if (!stadt || !erkennung || !/^[A-ZÄÖÜ]{1,3}$/.test(stadt) || !/^[A-ZÄÖÜ]{1,2}$/.test(erkennung)) {
    return clean
  }
  return `${stadt}-${erkennung} ${ziffern}`
}

// AAR-181: Baujahr-Input kommt als String rein, DB-Spalte ist INTEGER.
// Wir akzeptieren nur 4-stellige Jahreszahlen im plausiblen Bereich
// (1990–aktuelles Jahr+1). Ungültige Eingaben werden auf '' gesetzt →
// saveStammdaten speichert dann NULL.
function formatBaujahr(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 4) return ''
  const y = Number(digits)
  const maxYear = new Date().getFullYear() + 1
  if (y < 1990 || y > maxYear) return ''
  return String(y)
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
  required,
}: {
  label: string
  value: string | null | undefined
  fieldName: string
  leadId: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'time'
  placeholder?: string
  transform?: (raw: string) => string
  hint?: string
  // AAR-181 Audit-Fix #3: Pflichtfeld-Markierung als dedicated Prop statt
  // hartcodiert im Label-String (sonst verliert die Markierung den Kontext
  // bei Label-Änderung).
  required?: boolean
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  // AAR-unfallfotos Sync-Fix: InlineField's lokaler Draft blieb bisher auf
  // seinem Initial-Wert hängen — wenn der Server die Row ändert (z. B.
  // Haiku-Vision befüllt sachschaden_beschreibung nach Foto-Upload) und
  // router.refresh() ein neues `value`-Prop liefert, müssen wir den Draft
  // nachziehen, solange der MA nicht gerade aktiv tippt.
  useEffect(() => {
    if (status !== 'idle') return
    const incoming = value ?? ''
    setDraft((prev) => (prev === incoming ? prev : incoming))
  }, [value, status])

  function handleBlur() {
    const final = transform ? transform(draft) : draft
    // AAR-223: Draft auf den transformierten Wert setzen, damit der MA nach
    // dem Blur die formatierte Variante sieht (z.B. „K AB 1234" → „K-AB 1234")
    // statt seinem Roh-Input. Auch wenn keine DB-Änderung nötig ist, müssen
    // wir hier den Draft normalisieren — sonst bleibt die Anzeige asymmetrisch
    // zur DB.
    if (transform && final !== draft) {
      setDraft(final)
    }
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
      <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-label="Pflichtfeld">*</span>}
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
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
            ? 'border-claimondo-ondo'
            : status === 'saved'
              ? 'border-green-300'
              : status === 'error'
                ? 'border-red-300'
                : 'border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo'
        }`}
      />
      {hint && <p className="text-[10px] text-claimondo-ondo/70">{hint}</p>}
    </div>
  )
}

// AAR-265: Wrapper für VersicherungAutocomplete mit auto-save.
// Speichert sowohl gegner_versicherung_id (FK) als auch gegner_versicherung
// (denormalisierter Name für Legacy-Kompat + Freitext-Fallback).
function VersicherungField({
  leadId,
  initialId,
  initialName,
}: {
  leadId: string
  initialId: string | null | undefined
  initialName: string | null | undefined
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  function save(id: string | null, name: string) {
    setStatus('saving')
    startTransition(async () => {
      const r = await saveStammdaten(leadId, {
        gegner_versicherung_id: id,
        gegner_versicherung: name || null,
      })
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  function onSelect(s: VersicherungSelection) {
    save(s.id, s.name)
  }

  function onFreitextConfirm(name: string) {
    save(null, name)
  }

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
        Gegner-Versicherung
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
        {status === 'error' && <span className="text-red-500">Fehler</span>}
      </label>
      <VersicherungAutocomplete
        initialId={initialId}
        initialName={initialName}
        onSelect={onSelect}
        onFreitextConfirm={onFreitextConfirm}
        status={status}
      />
    </div>
  )
}

// AAR-298: Inline-Editor für Zeugen-Kontaktdaten als JSONB-Array
function ZeugenKontakteEditor({
  leadId,
  initialKontakte,
}: {
  leadId: string
  initialKontakte: Array<{ name: string; telefon?: string; email?: string; notiz?: string }>
}) {
  const [kontakte, setKontakte] = useState(initialKontakte.length > 0 ? initialKontakte : [{ name: '', telefon: '', email: '', notiz: '' }])
  const [, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function save(next: typeof kontakte) {
    setStatus('saving')
    startTransition(async () => {
      // Leere Einträge filtern beim Save
      const cleaned = next.filter((k) => k.name.trim() || k.telefon?.trim() || k.email?.trim())
      const r = await saveStammdaten(leadId, {
        zeugen_kontakte: cleaned.length > 0 ? cleaned : null,
      })
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  function updateKontakt(idx: number, field: 'name' | 'telefon' | 'email' | 'notiz', value: string) {
    const next = kontakte.map((k, i) => (i === idx ? { ...k, [field]: value } : k))
    setKontakte(next)
  }

  function addKontakt() {
    setKontakte([...kontakte, { name: '', telefon: '', email: '', notiz: '' }])
  }

  function removeKontakt(idx: number) {
    const next = kontakte.filter((_, i) => i !== idx)
    setKontakte(next.length > 0 ? next : [{ name: '', telefon: '', email: '', notiz: '' }])
    save(next)
  }

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-claimondo-border">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium">
          Zeugen-Kontaktdaten
        </p>
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
      </div>
      {kontakte.map((k, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 rounded-lg bg-[#f8f9fb]">
          <input
            type="text"
            value={k.name}
            onChange={(e) => updateKontakt(i, 'name', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Name"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          <input
            type="tel"
            value={k.telefon ?? ''}
            onChange={(e) => updateKontakt(i, 'telefon', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Telefon"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          <input
            type="email"
            value={k.email ?? ''}
            onChange={(e) => updateKontakt(i, 'email', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Email (optional)"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          <input
            type="text"
            value={k.notiz ?? ''}
            onChange={(e) => updateKontakt(i, 'notiz', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Notiz (optional)"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          {kontakte.length > 1 && (
            <button
              type="button"
              onClick={() => removeKontakt(i)}
              className="text-[10px] text-red-600 hover:underline col-span-full text-left"
            >
              Entfernen
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addKontakt}
        className="text-[11px] text-claimondo-ondo hover:underline"
      >
        + Weiteren Zeugen hinzufügen
      </button>
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
    <div className="bg-white rounded-xl border border-claimondo-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  )
}

function KennzeichenPartsField({
  leadId,
  lead: l,
  saveToggle,
  patchLead,
  lead_ref,
}: {
  leadId: string
  lead: LeadFields
  saveToggle: (field: string, value: boolean | string | null) => void
  patchLead: (fields: Record<string, unknown>) => void
  lead_ref: Record<string, unknown>
}) {
  const [kreis, setKreis] = useState((l.kennzeichen_kreis ?? '').toUpperCase())
  const [buchstaben, setBuchstaben] = useState((l.kennzeichen_buchstaben ?? '').toUpperCase())
  const [zahl, setZahl] = useState(l.kennzeichen_zahl ?? '')
  const [suffix, setSuffix] = useState<'E' | 'H' | ''>(
    (l.kennzeichen_suffix === 'E' || l.kennzeichen_suffix === 'H') ? l.kennzeichen_suffix : ''
  )
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  // Sync wenn Server neue Werte liefert
  useEffect(() => { if (status === 'idle') setKreis((l.kennzeichen_kreis ?? '').toUpperCase()) }, [l.kennzeichen_kreis, status])
  useEffect(() => { if (status === 'idle') setBuchstaben((l.kennzeichen_buchstaben ?? '').toUpperCase()) }, [l.kennzeichen_buchstaben, status])
  useEffect(() => { if (status === 'idle') setZahl(l.kennzeichen_zahl ?? '') }, [l.kennzeichen_zahl, status])
  useEffect(() => {
    if (status === 'idle') setSuffix((l.kennzeichen_suffix === 'E' || l.kennzeichen_suffix === 'H') ? l.kennzeichen_suffix : '')
  }, [l.kennzeichen_suffix, status])

  function save(k: string, b: string, z: string, s: string) {
    const combined = buildKennzeichen(k, b, z, s || null)
    const fields = {
      kennzeichen: combined || null,
      kennzeichen_kreis: k.toUpperCase() || null,
      kennzeichen_buchstaben: b.toUpperCase() || null,
      kennzeichen_zahl: z || null,
      kennzeichen_suffix: (s === 'E' || s === 'H') ? s : null,
    }
    patchLead(fields as Parameters<typeof patchLead>[0])
    setStatus('saving')
    startTransition(async () => {
      const r = await saveStammdaten(leadId, fields)
      if (r.success) { setStatus('saved'); setTimeout(() => setStatus('idle'), 2000) }
      else { setStatus('error'); setTimeout(() => setStatus('idle'), 3000) }
    })
  }

  const inputCls = 'text-sm font-medium bg-transparent border-b border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo w-full py-0.5 outline-none uppercase tracking-wide text-center'

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
        Kennzeichen
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
        {status === 'error' && <span className="text-red-500">Fehler</span>}
      </label>
      <div className="flex items-end gap-1">
        {/* Stadt / Kreis */}
        <div className="flex-[1.5] space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Stadt</span>
          <input
            type="text"
            value={kreis}
            maxLength={3}
            onChange={(e) => setKreis(e.target.value.toUpperCase().replace(/[^A-ZÄÖÜ]/g, ''))}
            onBlur={() => save(kreis, buchstaben, zahl, suffix)}
            placeholder="K"
            className={inputCls}
          />
        </div>
        <span className="text-claimondo-ondo/40 pb-0.5 text-sm font-light">–</span>
        {/* Kennung / Buchstaben */}
        <div className="flex-[1.5] space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Kennung</span>
          <input
            type="text"
            value={buchstaben}
            maxLength={2}
            onChange={(e) => setBuchstaben(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onBlur={() => save(kreis, buchstaben, zahl, suffix)}
            placeholder="AS"
            className={inputCls}
          />
        </div>
        <span className="pb-0.5 text-claimondo-ondo/20 text-sm"> </span>
        {/* Zahl */}
        <div className="flex-[2] space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Zahl</span>
          <input
            type="text"
            value={zahl}
            maxLength={4}
            onChange={(e) => setZahl(e.target.value.replace(/\D/g, ''))}
            onBlur={() => save(kreis, buchstaben, zahl, suffix)}
            placeholder="1234"
            className={inputCls}
          />
        </div>
        {/* Suffix E / H */}
        <div className="space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Typ</span>
          <select
            value={suffix}
            onChange={(e) => {
              const v = e.target.value as 'E' | 'H' | ''
              setSuffix(v)
              save(kreis, buchstaben, zahl, v)
            }}
            className="text-sm font-medium bg-transparent border-b border-claimondo-border focus:border-claimondo-ondo py-0.5 outline-none w-14"
            title="E = Elektro, H = Oldtimer"
          >
            <option value="">–</option>
            <option value="E">E ⚡</option>
            <option value="H">H 🏛</option>
          </select>
        </div>
      </div>
      {kreis && zahl && (
        <p className="text-[10px] text-claimondo-ondo/60 font-mono pt-0.5">
          {buildKennzeichen(kreis, buchstaben, zahl, suffix || null)}
        </p>
      )}
    </div>
  )
}

export default function Phase4Stammdaten() {
  const { lead, qualification, setPhase, patchLead } = useDispatchPhase()
  const router = useRouter()
  const l = lead as unknown as LeadFields
  const leadId = lead.id
  const [gegnerKzDraft, setGegnerKzDraft] = useState(l.gegner_kennzeichen ?? '')
  // AAR-272: Sync mit Server-Props nach router.refresh() — sonst bleibt der
  // Draft stale (z.B. nach OCR-Update via ZB1 oder nach manuellem
  // Supabase-Insert). Nur syncen wenn der MA das Feld nicht gerade tippt
  // (sonst überschreibt der Sync seine Eingabe).
  useEffect(() => {
    setGegnerKzDraft((prev) => {
      const serverValue = l.gegner_kennzeichen ?? ''
      // Nur überschreiben wenn der lokale Draft leer ist ODER bereits dem
      // bisherigen Server-Wert entsprach (= MA hat nichts angefangen zu tippen).
      return prev === '' || prev === serverValue ? serverValue : prev
    })
  }, [l.gegner_kennzeichen])
  const [, startTransition] = useTransition()

  // Halter-Daten aus Kundendaten zusammenstellen
  function halterAusKunde() {
    return {
      ist_fahrzeughalter: true,
      halter_vorname: l.vorname ?? null,
      halter_nachname: l.nachname ?? null,
      halter_strasse: l.kunde_strasse ?? null,
      halter_plz: l.kunde_plz ?? null,
      halter_stadt: l.kunde_stadt ?? null,
    }
  }

  // Standard: wenn ist_fahrzeughalter noch nie gesetzt wurde (null) und
  // Kundendaten vorhanden sind → automatisch als Halter übernehmen.
  useEffect(() => {
    if (l.ist_fahrzeughalter == null && (l.vorname || l.nachname)) {
      const fields = halterAusKunde()
      patchLead(fields as Partial<typeof lead>)
      startTransition(async () => { await saveStammdaten(leadId, fields) })
    }
    // Nur beim Mount ausführen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // AAR-217 Bug 2: Gegner-KZ wird beim Blur formatiert (gleicher Pfad wie
  // Eigenes-KZ via formatKennzeichen) — vorher wurde nur uppercase + trim
  // gemacht, also "B AB 1234" landete als "B AB 1234" in der DB (statt
  // "B-AB 1234"). Auch die Live-Flags laufen jetzt auf dem formatierten
  // Wert (sonst sah die Auto-Format-Anzeige schöner aus aber die
  // Auslandskennzeichen-Logik bekam noch den Roh-Draft).
  const kzFlags = checkKZFlags(formatKennzeichen(gegnerKzDraft), l.schadentyp ?? null)

  function saveGegnerKz() {
    const formatted = formatKennzeichen(gegnerKzDraft)
    // Draft visuell auf den formatierten Wert ziehen (analog zu InlineField
    // nach AAR-223 Fix), damit der MA sofort die finale Schreibweise sieht.
    if (formatted !== gegnerKzDraft) setGegnerKzDraft(formatted)
    if (formatted === (l.gegner_kennzeichen ?? '')) return
    const flags = checkKZFlags(formatted, l.schadentyp ?? null)
    // AAR-realtime: Provider-State sofort patchen
    patchLead({
      gegner_kennzeichen: formatted || null,
      fahrerflucht: flags.fahrerflucht,
      auslandskennzeichen: flags.auslandskennzeichen,
    } as Partial<typeof lead>)
    startTransition(async () => {
      await saveStammdaten(leadId, {
        gegner_kennzeichen: formatted || null,
        fahrerflucht: flags.fahrerflucht,
        auslandskennzeichen: flags.auslandskennzeichen,
      })
    })
  }

  function saveToggle(field: string, value: boolean | string | null) {
    // AAR-realtime: Provider-State sofort patchen
    patchLead({ [field]: value } as Partial<typeof lead>)
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

  // AAR-194: CarQuery-Dropdowns für Marke + Modell gefiltert nach Baujahr.
  // KFZ_MARKEN-Fallback bleibt als `datalist` falls CarQuery langsam/offline.
  const marke = l.fahrzeug_hersteller ?? ''
  // AAR-274: Controlled Input statt defaultValue (uncontrolled) — verhindert
  // Stale-State-Bug wenn React den Input nach Server-Update neu mountet
  // bevor onBlur durchgekommen ist. useEffect-Sync wie AAR-272.
  const [markeDraft, setMarkeDraft] = useState(marke)
  const [modellDraft, setModellDraft] = useState(l.fahrzeug_modell ?? '')
  useEffect(() => {
    setMarkeDraft((prev) => (prev === '' || prev === marke ? marke : prev))
  }, [marke])
  useEffect(() => {
    const server = l.fahrzeug_modell ?? ''
    setModellDraft((prev) => (prev === '' || prev === server ? server : prev))
  }, [l.fahrzeug_modell])
  const isMarkeInList = marke !== '' && (KFZ_MARKEN as readonly string[]).includes(marke)
  const [markeMode, setMarkeMode] = useState<'dropdown' | 'freitext'>(
    marke === '' ? 'dropdown' : isMarkeInList ? 'dropdown' : 'freitext',
  )

  const { marken: carMarken, modelle: carModelle, ladeModelle, loadingMarken, loadingModelle } =
    useCarQuery(l.fahrzeug_baujahr ?? null)

  // Modell-Liste nachladen wenn Marke sich ändert (aus Lead-Snapshot ODER
  // user-Edit).
  useEffect(() => {
    if (marke) ladeModelle(marke)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marke])

  // AAR-665-Follow: Schadenbeschreibung bleibt Phase-4-Eigentum.
  // Phase 1 fragt den Unfallhergang ab (WIE ist es passiert),
  // Phase 4 die Schadenbeschreibung am Auto (WAS am Fahrzeug kaputt ist).
  // Kein Hard-Gate — Feld ist optional, Haiku-Vision füllt es aus Unfallfotos.
  // „Kunde hat Unfallfotos"-Button scrollt runter zur DokumenteAnfordernCard
  // und setzt die Unfallfotos-Checkbox auf true, damit der Dispatcher mit
  // einem Klick die Bulk-Anforderung triggern kann.
  const hatUnfallfotos = Array.isArray(l.schadensfoto_urls) && l.schadensfoto_urls.length > 0
  const [unfallfotosAnfragen, setUnfallfotosAnfragen] = useState(false)

  return (
    <div className="space-y-4">
      {/* CMM-23: KI-Analyse (OCR first, LLM-Fallback). Hier in Phase 4 statt
         Phase 3 — der Kunden-Polizeibericht-Upload triggert den Auto-OCR
         schon im Onboarding (uploadPflichtdokument), die Daten-Anfrage an
         den Kunden läuft erst in Phase 4. Dispatcher sieht Klassifikation
         vor Bestätigung der Stammdaten + manuellem LLM-Fallback. */}
      <BkatAnalysePanel
        leadId={lead.id}
        polizeiVorOrt={l.polizei_vor_ort ?? null}
        onSchadentypGesetzt={() => router.refresh()}
      />

      {/* AAR-665-Follow: Schadenbeschreibungs-Card (WAS am Auto kaputt).
          Optional, kein Hard-Gate. Mit „Kunde hat Unfallfotos"-Checkmark
          für Bulk-Anforderung via DokumenteAnfordernCard. */}
      <div className="rounded-xl bg-white border border-claimondo-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-claimondo-navy flex items-center gap-1.5">
            <CameraIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
            Schadenbeschreibung <span className="text-claimondo-ondo/70 font-normal">(was am Auto kaputt ist)</span>
          </p>
          {hatUnfallfotos && l.fahrzeugschaden_beschreibung && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f8f9fb] text-claimondo-ondo font-medium">
              Aus {l.schadensfoto_urls!.length} Foto{l.schadensfoto_urls!.length === 1 ? '' : 's'} von Claude gefüllt
            </span>
          )}
        </div>
        <InlineField
          label=""
          value={l.fahrzeugschaden_beschreibung}
          fieldName="fahrzeugschaden_beschreibung"
          leadId={leadId}
          placeholder="z. B. Heckstoßstange eingedrückt, Kofferraumklappe lässt sich nicht mehr öffnen, Rückleuchte rechts zersplittert …"
          type="text"
        />
        {/* Checkmark-Button: aktiviert die Unfallfotos-Checkbox in der DokumenteAnfordernCard oben. */}
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={unfallfotosAnfragen}
            onChange={(e) => {
              const checked = e.target.checked
              setUnfallfotosAnfragen(checked)
              if (checked) {
                requestAnimationFrame(() => {
                  document
                    .getElementById('dokumente-anfordern-card')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }
            }}
            className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
          />
          <span className="text-xs text-claimondo-navy">
            <span className="font-medium">Kunde hat Unfallfotos</span>
            <span className="text-claimondo-ondo">
              {' '}— bei Anforderung unten (Fahrzeugschein / Polizei / Fotos in einem
              Link) werden die Fotos mitgeordert. Claude füllt danach automatisch
              die Beschreibung.
            </span>
          </span>
        </label>
      </div>

      {/* AAR-177 Fix #2: Kundendaten-Card entfernt — die 4 Felder
          (Vorname/Nachname/Telefon/Email) werden bereits in Phase 1/5
          erfasst bzw. editiert. Doppelte Eingabe verwirrt den MA. */}

      {/* Kundenadresse — wird hier in Phase 4 erfasst (nicht beim Lead-Anlegen) */}
      <Card icon={<MapPinIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Kundenadresse">
        <div className="space-y-1.5">
          <p className="text-[11px] text-claimondo-ondo">
            Wohnadresse des Kunden — nur als letzter Fallback für die Gutachter-Zuweisung (Priorität: Besichtigungsort → Fahrzeug-Standort → Unfallort → Wohnadresse).
          </p>
          <GooglePlaceAutocomplete
            defaultValue={l.kunde_adresse ?? ''}
            placeholder="Straße, PLZ, Stadt"
            onSelect={(p: PlaceResult) => {
              const fields = {
                kunde_adresse: p.adresse,
                kunde_strasse: p.strasse || null,
                kunde_plz: p.plz || null,
                kunde_stadt: p.stadt || null,
                kunde_lat: p.lat,
                kunde_lng: p.lng,
              }
              patchLead(fields as Partial<typeof lead>)
              startTransition(async () => { await saveStammdaten(leadId, fields) })
            }}
            onChange={(text) => {
              if (!text.trim()) {
                const fields = { kunde_adresse: null, kunde_strasse: null, kunde_plz: null, kunde_stadt: null, kunde_lat: null, kunde_lng: null }
                patchLead(fields as Partial<typeof lead>)
                startTransition(async () => { await saveStammdaten(leadId, fields) })
              }
            }}
            className="w-full px-3 py-2 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-claimondo-ondo"
          />
          {l.kunde_lat && l.kunde_lng && (
            <p className="text-[10px] text-claimondo-ondo/70">
              ✓ Koordinaten {l.kunde_lat.toFixed(4)}, {l.kunde_lng.toFixed(4)}
              {l.kunde_plz ? ` · PLZ ${l.kunde_plz}` : ''}
              {l.kunde_stadt ? ` · ${l.kunde_stadt}` : ''}
            </p>
          )}
        </div>
      </Card>

      {/* 1. Fahrzeugdaten — AAR-194: Baujahr OBEN, dann Marke + Modell
          dynamisch via CarQuery (gefiltert nach Baujahr falls gesetzt). */}
      <Card icon={<CarIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Fahrzeugdaten">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* AAR-194: Baujahr als erstes Feld damit CarQuery Marke/Modell
              direkt gefiltert lädt. AAR-199: Baujahr ist OPTIONAL — wird
              via ZB1-OCR (AAR-182) oder CarQuery (AAR-194) auto-befüllt,
              blockiert nicht mehr den FlowLink-Versand. */}
          <InlineField
            label="Baujahr"
            value={l.fahrzeug_baujahr != null ? String(l.fahrzeug_baujahr) : null}
            fieldName="fahrzeug_baujahr"
            leadId={leadId}
            placeholder="z.B. 2018"
            transform={formatBaujahr}
            hint={l.fahrzeug_baujahr == null
              ? 'Optional — via ZB1-OCR oder Auto-Vervollständigung nachträglich'
              : 'Filtert die Marken-Liste'}
          />

          {/* Kennzeichen — aufgeteilt in Stadt / Kennung / Zahl / Spezifikation */}
          <KennzeichenPartsField leadId={leadId} lead={l} saveToggle={saveToggle} patchLead={patchLead} lead_ref={lead} />

          {/* Marke — CarQuery-Dropdown (gefiltert nach Baujahr) mit Freitext-
              Fallback. Wenn CarQuery nichts liefert (Offline/Error), zeigen
              wir die Top-20-Liste als datalist. */}
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
              Marke
              {loadingMarken && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
            </label>
            {markeMode === 'dropdown' ? (
              <>
                <input
                  type="text"
                  list="carquery-marken"
                  value={markeDraft}
                  onChange={(e) => setMarkeDraft(e.target.value)}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v === '__freitext__' || v === 'Sonstiges') {
                      setMarkeMode('freitext')
                      return
                    }
                    if (v !== marke) saveToggle('fahrzeug_hersteller', v || null)
                  }}
                  placeholder={loadingMarken ? 'Lade Marken ...' : 'Marke wählen oder tippen'}
                  className="text-sm font-medium bg-transparent border-b border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo w-full py-0.5 outline-none"
                />
                <datalist id="carquery-marken">
                  {(carMarken.length > 0 ? carMarken : (KFZ_MARKEN as readonly string[])).map((m) => (
                    <option key={m} value={m} />
                  ))}
                  <option value="Sonstiges" />
                </datalist>
              </>
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

          {/* Modell — Datalist mit CarQuery-Modellen für gewählte Marke. */}
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
              Modell
              {loadingModelle && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
            </label>
            <input
              type="text"
              list="carquery-modelle"
              value={modellDraft}
              onChange={(e) => setModellDraft(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (l.fahrzeug_modell ?? '')) {
                  saveToggle('fahrzeug_modell', v || null)
                }
              }}
              disabled={!marke}
              placeholder={!marke ? 'Erst Marke wählen' : loadingModelle ? 'Lade Modelle ...' : 'Modell wählen oder tippen'}
              className="text-sm font-medium bg-transparent border-b border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo w-full py-0.5 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <datalist id="carquery-modelle">
              {carModelle.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          {/* Lackfarbe — Dropdown mit LACKFARBE_OPTIONS, auto-save on change */}
          <div className="space-y-0.5">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider">
              Lackfarbe
            </label>
            <select
              value={l.lackfarbe_code ?? ''}
              onChange={(e) => {
                const v = (e.target.value || null) as LackfarbeCode | null
                saveToggle('lackfarbe_code', v)
              }}
              className="text-sm font-medium bg-transparent border-b border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo w-full py-0.5 outline-none"
            >
              <option value="">— bitte wählen —</option>
              {LACKFARBE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <InlineField
            label="Lack-Detail (optional)"
            value={l.fahrzeug_farbe}
            fieldName="fahrzeug_farbe"
            leadId={leadId}
            placeholder="z. B. Saphirschwarz Metallic"
          />

          {/* Live-Render-Preview — sichtbar sobald Marke gesetzt ist */}
        </div>
        {marke && (
          <div className="flex items-center justify-center rounded-xl bg-claimondo-navy/[0.04] border border-claimondo-navy/15 py-3 mt-1">
            <FahrzeugRenderImage
              hersteller={marke}
              modell={l.fahrzeug_modell || null}
              lackfarbe={(l.lackfarbe_code as LackfarbeCode | null) ?? null}
              baujahr={l.fahrzeug_baujahr ?? null}
              width={260}
            />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* AAR-347: FIN/HSN/TSN manuell eintragbar als OCR-Fallback —
              werden normalerweise aus der ZB1 automatisch extrahiert, aber
              wenn Upload fehlschlägt oder Kunde keinen Fahrzeugschein hat,
              muss der Dispatcher sie telefonisch erfragen und eintragen
              können. Alle drei landen via STAMMDATEN_ALLOWED_FIELDS in
              leads.fin / leads.hsn / leads.tsn. */}
          <InlineField
            label="FIN (Fahrzeug-Ident-Nr.)"
            value={l.fin}
            fieldName="fin"
            leadId={leadId}
            placeholder="WVWZZZ3CZWE123456"
            // AAR-347: FIN-Regex nach ISO 3779 — I/O/Q sind nicht erlaubt
            // (werden mit 1/0/9 verwechselt). Muss identisch sein zu
            // isValidFIN() in zb1-fields.ts, sonst lehnt Cardentity-API
            // den Eintrag später ab.
            transform={(raw) => raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17)}
            hint="17 Zeichen (keine I/O/Q), normalerweise aus ZB1/Fahrzeugschein"
          />

          <InlineField
            label="HSN (Herstellerschlüssel)"
            value={l.hsn}
            fieldName="hsn"
            leadId={leadId}
            placeholder="0603"
            transform={(raw) => raw.replace(/[^0-9]/g, '').slice(0, 4)}
            hint="4 Ziffern, Feld 2.1 im Fahrzeugschein"
          />

          <InlineField
            label="TSN (Typschlüssel)"
            value={l.tsn}
            fieldName="tsn"
            leadId={leadId}
            placeholder="BRN"
            transform={(raw) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)}
            hint="3 Zeichen, Feld 2.2 im Fahrzeugschein"
          />

          {/* AAR-177 Fix #3: Eigentümer-Typ mit Info-Tooltip + Label.
              Fix #6: Leasing/Gewerblich kontextuelle Hilfe-Box.
              AAR-188 Fix #3: Label explizit auf Fahrzeug-Eigentümer laut
              ZB1 bezogen — der MA weiß dann dass der Anrufer nicht
              zwingend der Halter sein muss. */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
              <UserCheckIcon className="w-3 h-3" />
              Fahrzeug-Eigentümer (laut Fahrzeugschein/ZB1)
              <span
                className="text-claimondo-ondo/70 cursor-help"
                title="Privat = Kunde ist Eigentümer + nicht vorsteuerabzugsberechtigt. Leasing = Leasing-Fahrzeug → Vollmacht vom Leasinggeber nötig. Gewerblich = Firma als Eigentümer, Netto-Regulierung (Vorsteuer ziehbar)."
              >
                <InfoIcon className="w-3 h-3" />
              </span>
            </label>
            <p className="text-[10px] text-claimondo-ondo/70">
              Wer steht als Halter im Fahrzeugschein? Nicht zwingend der Anrufer.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await saveStammdaten(leadId, {
                      finanzierung_leasing: 'keine',
                      vorsteuerabzugsberechtigt: false,
                    })
                  })
                }
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  (l.finanzierung_leasing ?? 'keine') === 'keine' && !l.vorsteuerabzugsberechtigt
                    ? 'bg-claimondo-ondo text-white'
                    : 'bg-[#f8f9fb] text-claimondo-ondo'
                }`}
                title="Kunde ist Eigentümer und nicht vorsteuerabzugsberechtigt — Brutto-Regulierung."
              >
                Privat
              </button>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await saveStammdaten(leadId, {
                      finanzierung_leasing: 'leasing',
                      vorsteuerabzugsberechtigt: false,
                    })
                  })
                }
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.finanzierung_leasing === 'leasing' && !l.vorsteuerabzugsberechtigt
                    ? 'bg-amber-500 text-white'
                    : 'bg-[#f8f9fb] text-claimondo-ondo'
                }`}
                title="Leasing-Fahrzeug → Vollmacht vom Leasinggeber nötig bevor Kanzlei reguliert."
              >
                Leasing
              </button>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await saveStammdaten(leadId, {
                      finanzierung_leasing: 'keine',
                      vorsteuerabzugsberechtigt: true,
                    })
                  })
                }
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.vorsteuerabzugsberechtigt === true
                    ? 'bg-claimondo-navy text-white'
                    : 'bg-[#f8f9fb] text-claimondo-ondo'
                }`}
                title="Gewerblicher Halter — Netto-Regulierung, Vorsteuer wird abgezogen."
              >
                Gewerblich
              </button>
            </div>
            {/* AAR-177 Fix #6 / AAR-188 Fix #5: Kontext-Hilfe-Boxen.
                Leasing + Finanzierung jetzt als Gesprächshilfe formuliert
                (statt aktionsorientiert „Vollmacht 48h" — falsch, weil
                die Kanzlei das nach dem Gutachten klärt, nicht beim
                Erstgespräch). */}
            {l.finanzierung_leasing === 'leasing' && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 space-y-1">
                <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1">
                  <InfoIcon className="w-3 h-3" /> Gesprächshilfe bei Leasing
                </p>
                <p className="text-[10px] text-amber-800 italic">
                  „Falls Sie Fragen wegen Ihrer Leasingbank haben — das klären
                  wir nach dem Gutachten gemeinsam. Sie müssen jetzt nichts tun."
                </p>
              </div>
            )}
            {l.finanzierung_leasing === 'finanzierung' && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 space-y-1">
                <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1">
                  <InfoIcon className="w-3 h-3" /> Gesprächshilfe bei Finanzierung
                </p>
                <p className="text-[10px] text-amber-800 italic">
                  „Bei finanziertem Fahrzeug informieren wir Sie nach dem
                  Gutachten über die nächsten Schritte."
                </p>
              </div>
            )}
            {l.vorsteuerabzugsberechtigt === true && (
              <div className="mt-2 rounded-md bg-claimondo-navy/5 border border-claimondo-ondo/30 p-2 space-y-1">
                <p className="text-[11px] font-semibold text-claimondo-navy flex items-center gap-1">
                  <InfoIcon className="w-3 h-3" /> Hinweis bei Gewerblich
                </p>
                <ul className="text-[10px] text-claimondo-navy list-disc list-inside space-y-0.5">
                  <li>Firma als Eigentümer → Gutachten an Firma adressieren</li>
                  <li>Regulierung NETTO (Versicherung zieht USt. ab)</li>
                  <li>Bei Gewerbenachweis-Pflicht: FlowLink zeigt Upload-Slot automatisch</li>
                </ul>
              </div>
            )}
          </div>

          {/* Vorschäden */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider">Vorschäden bekannt?</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => saveToggle('hat_vorschaeden', true)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.hat_vorschaeden === true ? 'bg-claimondo-ondo text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'
                }`}
              >
                Ja, Vorschäden
              </button>
              <button
                type="button"
                onClick={() => saveToggle('hat_vorschaeden', false)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  l.hat_vorschaeden === false ? 'bg-claimondo-ondo text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'
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

        {/* AAR-208 + AAR-318 Teil D: Halter-Block — immer sichtbar.
            Edit-bar (kommt aus ZB1-OCR oder manuell) + Geburtsdatum (nicht
            in ZB1, daher manuell oder aus Kunde übernommen). „Gleich wie
            Kunde"-Toggle füllt die Felder mit den Kundendaten. */}
        {/* AAR-666: Halter-Block — OCR-Auto-Match setzt `ist_fahrzeughalter`
            bei Namens-Gleichheit direkt auf true (Upload-Action). Wenn Namen
            abweichen, zeigt der Badge oben „⚠ Abweichung zum Kunden" statt
            „Aus Fahrzeugschein". */}
        <div className="sm:col-span-2 mt-3 rounded-lg bg-[#f8f9fb] border border-claimondo-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-claimondo-ondo font-semibold uppercase tracking-wider flex items-center gap-1">
              <UserCheckIcon className="w-3 h-3" />
              Fahrzeughalter
              {(() => {
                const norm = (s: string | null | undefined): string =>
                  (s ?? '').trim().toLowerCase()
                const halterNachname = norm(l.halter_nachname)
                const kundeNachname = norm(l.nachname)
                const halterVorname = norm(l.halter_vorname)
                const kundeVorname = norm(l.vorname)
                const namenAbweichend =
                  !!halterNachname &&
                  !!kundeNachname &&
                  (halterNachname !== kundeNachname || halterVorname !== kundeVorname)
                if (namenAbweichend && l.ist_fahrzeughalter !== true) {
                  return (
                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[9px] font-medium">
                      ⚠ Abweichung zum Kunden
                    </span>
                  )
                }
                if (l.halter_nachname) {
                  return (
                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-medium">
                      Aus Fahrzeugschein
                    </span>
                  )
                }
                return null
              })()}
            </p>
            <button
              type="button"
              onClick={() => {
                if (l.ist_fahrzeughalter === true) {
                  // Abwählen → Felder leeren
                  const fields = {
                    ist_fahrzeughalter: false,
                    halter_vorname: null,
                    halter_nachname: null,
                    halter_strasse: null,
                    halter_plz: null,
                    halter_stadt: null,
                  }
                  patchLead(fields as Partial<typeof lead>)
                  startTransition(async () => { await saveStammdaten(leadId, fields) })
                } else {
                  // Anwählen → mit Kundendaten befüllen
                  const fields = halterAusKunde()
                  patchLead(fields as Partial<typeof lead>)
                  startTransition(async () => { await saveStammdaten(leadId, fields) })
                }
              }}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                l.ist_fahrzeughalter === true
                  ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                  : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-[#f8f9fb]'
              }`}
              title="Wenn der Anrufer/Kunde gleichzeitig der Fahrzeughalter ist"
            >
              {l.ist_fahrzeughalter === true ? '✓ Gleich wie Kunde' : 'Gleich wie Kunde?'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InlineField
              label="Halter Vorname"
              value={l.halter_vorname}
              fieldName="halter_vorname"
              leadId={leadId}
              placeholder="Vorname"
            />
            <InlineField
              label="Halter Nachname"
              value={l.halter_nachname}
              fieldName="halter_nachname"
              leadId={leadId}
              placeholder="Nachname"
            />
            <InlineField
              label="Geburtsdatum"
              value={l.halter_geburtsdatum}
              fieldName="halter_geburtsdatum"
              leadId={leadId}
              placeholder="JJJJ-MM-TT"
              type="date"
            />
            <div /> {/* Spalten-Spacer */}
            <InlineField
              label="Straße"
              value={l.halter_strasse}
              fieldName="halter_strasse"
              leadId={leadId}
              placeholder="Straße + Hausnummer"
            />
            <InlineField
              label="PLZ"
              value={l.halter_plz}
              fieldName="halter_plz"
              leadId={leadId}
              placeholder="PLZ"
            />
            <InlineField
              label="Ort"
              value={l.halter_stadt}
              fieldName="halter_stadt"
              leadId={leadId}
              placeholder="Ort"
            />
          </div>

          {/* AAR-347 Folge-Cleanup: Read-only-Anzeige "HSN/TSN: X / Y"
              entfernt — HSN und TSN haben jetzt eigene Inline-Edit-Felder
              im Fahrzeugdaten-Block (oben), die Read-only-Zeile im Halter-
              Block war damit redundant. */}

          {l.nachname && l.halter_nachname && l.ist_fahrzeughalter !== true &&
            l.halter_nachname.trim().toLowerCase() !== l.nachname.trim().toLowerCase() && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2 flex items-start gap-1.5">
              <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-900">
                <strong>Halter ≠ Anrufer</strong> — bitte mit Kunde klären: Ist der Halter
                mit der Vertretung einverstanden? Vollmacht wird vom Halter benötigt.
              </p>
            </div>
          )}
        </div>

        {/* AAR-177 Fix #1: CardentityButton (Typ-A) entfernt — Anreicherung
            läuft automatisch nach ZB1-OCR.
            AAR-311: Cardentity Typ-B (15€/Detailbericht) als manueller Trigger
            für Vorschadenverdacht im Erstgespräch. */}
        <div className="sm:col-span-2 pt-2 border-t border-claimondo-border">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1.5">
            Vorschaden-Detailbericht
          </p>
          <CardentityTypBButton
            action={() => requestCardentityTypBForLead(leadId)}
            finVorhanden={!!l.fin}
            enrichedAt={l.cardentity_enriched_at ?? null}
          />

          <div>
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1.5">
              Vorschaden-Detailbericht
            </p>
            <CardentityTypBButton
              action={() => requestCardentityTypBForLead(leadId)}
              finVorhanden={!!l.fin}
              initial={{
                fetchedAt: l.cardentity_abfrage_am ?? null,
                vorschadenVorhanden: l.hat_vorschaeden ?? null,
                vorschadenAnzahl: l.vorschaden_anzahl ?? null,
                letzterVorschadenDatum: l.vorschaden_letzter_datum ?? null,
              }}
            />
          </div>
        </div>
      </Card>

      {/* 3. Gegner & Unfall */}
      <Card icon={<ShieldIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Gegner & Unfall">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Gegner-KZ mit Live-Flags */}
          <div className="space-y-0.5 sm:col-span-2">
            <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider">Gegner-Kennzeichen</label>
            <input
              type="text"
              value={gegnerKzDraft}
              onChange={(e) => setGegnerKzDraft(e.target.value)}
              onBlur={saveGegnerKz}
              placeholder="Kennzeichen oder leer lassen bei Fahrerflucht"
              className="text-sm font-medium bg-transparent border-b border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo w-full py-0.5 outline-none"
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

            {/* AAR-314: Auslandskennzeichen — Step-by-Step Anleitung für das
                Deutsche Büro Grüne Karte + 10-Tage-Reminder-Task. */}
            {kzFlags.auslandskennzeichen && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1">
                  <GlobeIcon className="w-3 h-3" />
                  Auslandskennzeichen — DE-Eintrittsversicherung ermitteln
                </p>
                <ol className="text-[10px] text-amber-900 list-decimal list-inside space-y-0.5">
                  <li>
                    <a
                      href="https://www.deutsches-buero-gruene-karte.de/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium text-amber-900 hover:text-amber-700"
                    >
                      deutsches-buero-gruene-karte.de
                    </a>{' '}
                    öffnen
                  </li>
                  <li>Gegner-Kennzeichen + Unfalldatum im Formular eingeben</li>
                  <li>~10 Tage warten — E-Mail mit DE-Eintrittsversicherung folgt</li>
                  <li>Eingegangene Versicherungsdaten im Fall unter „Gegner" hinterlegen</li>
                </ol>

                {l.gegner_versicherung_anfrage_datum ? (
                  <div className="text-[11px] text-emerald-800 bg-white border border-emerald-200 rounded px-2 py-1.5">
                    ✓ Anfrage gesendet am{' '}
                    <strong>
                      {new Date(l.gegner_versicherung_anfrage_datum).toLocaleDateString(
                        'de-DE',
                        { timeZone: 'Europe/Berlin' },
                      )}
                    </strong>{' '}
                    — KB-Reminder wurde für{' '}
                    <strong>
                      {new Date(
                        new Date(l.gegner_versicherung_anfrage_datum).getTime() +
                          10 * 24 * 60 * 60 * 1000,
                      ).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
                    </strong>{' '}
                    gesetzt.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        const r = await setGrueneKarteAngefragt(leadId)
                        if (!r.success) alert(r.error ?? 'Fehler beim Setzen des Reminders')
                      })
                    }
                    className="px-3 py-1.5 rounded-md bg-claimondo-ondo text-white text-[11px] font-medium hover:bg-claimondo-navy"
                  >
                    Anfrage gesendet — 10-Tage-Reminder setzen
                  </button>
                )}
              </div>
            )}
            {/* AAR-177 Fix #5: Fahrerflucht-Hinweis mit konkreten Handlungs-
                Schritten für den MA — statt nur „Fahrerflucht!"-Warnung. */}
            {kzFlags.fahrerflucht && (
              <div className="mt-2 rounded-md bg-red-50 border border-red-200 p-2 space-y-1">
                <p className="text-[11px] font-semibold text-red-900 flex items-center gap-1">
                  <AlertTriangleIcon className="w-3 h-3" /> Fahrerflucht — nächste Schritte
                </p>
                <ul className="text-[10px] text-red-800 list-disc list-inside space-y-0.5">
                  <li>Polizei wurde informiert? Wenn nein → Kunde JETZT zur Anzeige auffordern</li>
                  <li>Aktenzeichen der Polizei aufnehmen (später im Portal nachreichbar)</li>
                  <li>Ohne KZ + ohne Polizei = Disqualifikation (Fahrerflucht ohne KZ)</li>
                  <li>Falls Kamera/Dashcam vorhanden: unbedingt Datei sichern lassen</li>
                </ul>
              </div>
            )}
            {kzFlags.showKameraCheck && (
              <div className="mt-2 bg-[#f8f9fb] border border-claimondo-border rounded-lg p-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-claimondo-navy flex items-center gap-1">
                  <CameraIcon className="w-3.5 h-3.5" /> Parkplatz + kein KZ — gibt es eine Kamera vor Ort?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveParkplatzKamera(true)}
                    className={`flex-1 px-2 py-1 rounded text-[11px] font-medium ${
                      l.parkplatz_kamera === true ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-navy'
                    }`}
                  >
                    Ja, Kamera vorhanden
                  </button>
                  <button
                    type="button"
                    onClick={() => saveParkplatzKamera(false)}
                    className={`flex-1 px-2 py-1 rounded text-[11px] font-medium ${
                      l.parkplatz_kamera === false ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-navy'
                    }`}
                  >
                    Nein (⚠️ wird disqualifiziert)
                  </button>
                </div>
              </div>
            )}
          </div>

          <VersicherungField
            leadId={leadId}
            initialId={l.gegner_versicherung_id}
            initialName={l.gegner_versicherung}
          />
          <InlineField
            label="Schadennummer (optional)"
            value={l.gegner_schadennummer}
            fieldName="gegner_schadennummer"
            leadId={leadId}
          />
          {/* CMM-26: Unfalldatum, Unfall-Uhrzeit und Unfallort sind in Phase 1
              (Erstkontakt) Owner. Phase 4 bezieht sich nur noch auf Gegner +
              Versicherung. Wenn Korrekturen am Unfall-Block nötig werden, geht
              der Dispatcher in Phase 1 zurück. */}
        </div>
      </Card>

      {/* 4. Zeugen */}
      <Card icon={<UsersIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Zeugen">
        <p className="text-[11px] text-claimondo-ondo">
          Nur abfragen bei Unklarheiten zum Hergang. Falls Kontaktdaten vorhanden, kann der
          Kunde diese gleich im Portal-FlowLink eingeben.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => saveToggle('zeugen', true)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              l.zeugen === true ? 'bg-claimondo-ondo text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'
            }`}
          >
            Ja — Zeugen vorhanden
          </button>
          <button
            type="button"
            onClick={() => saveToggle('zeugen', false)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              l.zeugen === false ? 'bg-claimondo-ondo text-white' : 'bg-[#f8f9fb] text-claimondo-ondo'
            }`}
          >
            Nein
          </button>
        </div>
        {/* AAR-298: Wenn Zeugen vorhanden → Kontaktdaten direkt erfassen */}
        {l.zeugen === true && (
          <ZeugenKontakteEditor
            leadId={leadId}
            initialKontakte={l.zeugen_kontakte ?? []}
          />
        )}
      </Card>

      {!qualification.q6_gegnerKz && (
        <p className="text-[11px] text-amber-700 flex items-start gap-1 px-1">
          <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Phase 4 erst abgeschlossen wenn Gegner-KZ eingegeben ODER Parkplatz-Kamera=Ja ODER
          (Fahrerflucht + Polizei=Ja).
        </p>
      )}
      {/* AAR-181 / AAR-199: Fahrzeug-Pflichtfelder — Kennzeichen, Marke, Modell.
          Baujahr ist optional (AAR-199). */}
      {!qualification.q7_fahrzeug && (
        <p className="text-[11px] text-amber-700 flex items-start gap-1 px-1">
          <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Pflichtfelder fehlen: Kennzeichen, Marke und Modell müssen gesetzt sein.
        </p>
      )}

      {/* AAR-617: Zurück-/Weiter-Row */}
      {/* AAR-340: „Weiter zu Phase 5"-Button — Pflichtfelder q6 + q7 müssen
          erfüllt sein; Q8 (schadens_hergang) wird erst in Phase 5 hart gegatet. */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => setPhase(3)}
          className="flex-1 px-4 py-2.5 rounded-xl border border-claimondo-border text-claimondo-navy hover:bg-[#f8f9fb] text-sm font-semibold flex items-center justify-center gap-2"
        >
          ← Zurück zu Phase 2
        </button>
        <button
          type="button"
          onClick={() => setPhase(5)}
          disabled={!qualification.q6_gegnerKz || !qualification.q7_fahrzeug}
          className="flex-1 px-4 py-2.5 rounded-xl bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Weiter zu Phase 5 →
        </button>
      </div>
    </div>
  )
}

// ─── Cardentity Typ-A — Manual Trigger ─────────────────────────────────────
// Standardpfad: läuft automatisch nach ZB1-OCR. Wenn der Dispatcher die FIN
// aber manuell erfasst hat (kein ZB1-Upload), kann er hier explizit triggern.
function CardentityTypAButton({
  leadId,
  finVorhanden,
  enrichedAt,
}: {
  leadId: string
  finVorhanden: boolean
  enrichedAt: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [enrichtAm, setEnrichtAm] = useState<string | null>(enrichedAt)
  const [error, setError] = useState<string | null>(null)
  const [updatedFields, setUpdatedFields] = useState<string[] | null>(null)

  function trigger() {
    setError(null)
    startTransition(async () => {
      const r = await enrichLeadCardentity(leadId)
      if (!r.success) {
        setError(r.error ?? 'Fehler')
        return
      }
      setEnrichtAm(new Date().toISOString())
      setUpdatedFields(r.updatedFields ?? [])
    })
  }

  if (!finVorhanden) {
    return (
      <p className="text-[11px] text-claimondo-ondo/70">
        Cardentity Typ-A verfügbar sobald die FIN erfasst ist.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1.5">
        Fahrzeug-Anreicherung (Typ-A)
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={trigger}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-claimondo-border bg-white text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CarIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
          )}
          {enrichtAm ? 'Cardentity Typ-A erneut abfragen' : 'Cardentity Typ-A abfragen'}
        </button>
        {enrichtAm && !pending && (
          <span className="text-[10px] text-emerald-700">
            ✓ angereichert {new Date(enrichtAm).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
          </span>
        )}
      </div>
      {updatedFields && updatedFields.length > 0 && (
        <p className="text-[10px] text-emerald-700">
          Aktualisiert: {updatedFields.join(', ')}
        </p>
      )}
      {updatedFields && updatedFields.length === 0 && !error && (
        <p className="text-[10px] text-claimondo-ondo/70">
          Keine neuen Felder — Lead war bereits vollständig.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-600 leading-snug">{error}</p>
      )}
    </div>
  )
}
