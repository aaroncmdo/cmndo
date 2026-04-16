'use client'

// AAR-140 / W6: Phase 4 Stammdaten mit Inline-Edit + Auto-Save on-blur.
// Alle Felder sind einzeln editierbar und werden beim Verlassen des Inputs
// automatisch gespeichert (saveStammdaten-Allowlist). Auto-Flags für
// Gegner-KZ (Fahrerflucht / Auslandskennzeichen) werden live aus
// gegner-kz-flags.ts berechnet und mitgespeichert.

import { useState, useTransition, useEffect } from 'react'
import { saveStammdaten } from '../actions'
import { checkKZFlags } from '../lib/gegner-kz-flags'
import { useDispatchPhase } from '../lib/phase-context'
import { useCarQuery } from '../hooks/useCarQuery'
// AAR-177 Fix #1: CardentityButton-Import entfernt (Button war nicht
// funktionsreif und Text irritierte — Cardentity läuft jetzt im Hintergrund
// via ZB1-OCR-Trigger in /api/ocr-fahrzeugschein Step 6).
import Zb1UploadCard from './Zb1UploadCard'
import PolizeiberichtUploadCard from './PolizeiberichtUploadCard'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import VersicherungAutocomplete, { type VersicherungSelection } from '@/components/VersicherungAutocomplete'
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
  fahrzeug_baujahr?: number | null
  fin?: string | null
  // AAR-182: ZB1-Upload-Tracking
  zb1_status?: string | null
  zb1_hochgeladen_am?: string | null
  // AAR-263: Polizeibericht-Upload-Tracking (telefon/email schon oben)
  polizei_vor_ort?: boolean | null
  polizeibericht_pflicht?: boolean | null
  polizeibericht_status?: string | null
  polizeibericht_hochgeladen_am?: string | null
  cardentity_enriched_at?: string | null
  hat_vorschaeden?: boolean | null
  vorschaeden_beschreibung?: string | null
  finanzierung_leasing?: 'keine' | 'finanzierung' | 'leasing' | string | null
  vorsteuerabzugsberechtigt?: boolean | null
  gegner_bekannt?: boolean | null
  gegner_kennzeichen?: string | null
  gegner_versicherung?: string | null
  // AAR-265: FK auf versicherungen-Stammdaten (Autocomplete)
  gegner_versicherung_id?: string | null
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
  // AAR-208: Halter-Daten aus ZB1-OCR (Fahrzeugschein)
  halter_vorname?: string | null
  halter_nachname?: string | null
  halter_strasse?: string | null
  halter_plz?: string | null
  halter_stadt?: string | null
  hsn?: string | null
  tsn?: string | null
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
      <label className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-label="Pflichtfeld">*</span>}
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
      <label className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
        Gegner-Versicherung
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-blue-400 animate-spin" />}
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
    startTransition(async () => {
      await saveStammdaten(leadId, {
        gegner_kennzeichen: formatted || null,
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

  // AAR-194: CarQuery-Dropdowns für Marke + Modell gefiltert nach Baujahr.
  // KFZ_MARKEN-Fallback bleibt als `datalist` falls CarQuery langsam/offline.
  const marke = l.fahrzeug_hersteller ?? ''
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

  return (
    <div className="space-y-4">
      {/* AAR-177 Fix #2: Kundendaten-Card entfernt — die 4 Felder
          (Vorname/Nachname/Telefon/Email) werden bereits in Phase 1/5
          erfasst bzw. editiert. Doppelte Eingabe verwirrt den MA. */}

      {/* AAR-182: ZB1-Upload-Karte — „Fahrzeugschein zur Hand?"-Toggle +
          WA/SMS/Email-Versand. Kunde antwortet mit Foto → OCR füllt
          KZ/Marke/Modell/Baujahr/Halter automatisch aus. */}
      <Zb1UploadCard
        leadId={leadId}
        zb1Status={l.zb1_status ?? null}
        zb1HochgeladenAm={l.zb1_hochgeladen_am ?? null}
        telefon={l.telefon ?? null}
        email={l.email ?? null}
      />

      {/* AAR-263: Polizeibericht-Upload — nur wenn Polizei vor Ort UND Bericht
          existiert. Wenn nur Aktenzeichen (polizeibericht_pflicht=false)
          ist die Karte nicht nötig — das Aktenzeichen reicht aus. */}
      {l.polizei_vor_ort === true && l.polizeibericht_pflicht === true && (
        <PolizeiberichtUploadCard
          leadId={leadId}
          polizeiberichtStatus={l.polizeibericht_status ?? null}
          polizeiberichtHochgeladenAm={l.polizeibericht_hochgeladen_am ?? null}
          telefon={l.telefon ?? null}
          email={l.email ?? null}
        />
      )}

      {/* 1. Fahrzeugdaten — AAR-194: Baujahr OBEN, dann Marke + Modell
          dynamisch via CarQuery (gefiltert nach Baujahr falls gesetzt). */}
      <Card icon={<CarIcon className="w-4 h-4 text-gray-400" />} title="Fahrzeugdaten">
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

          <InlineField
            label="Eigenes Kennzeichen"
            value={l.kennzeichen}
            fieldName="kennzeichen"
            leadId={leadId}
            transform={formatKennzeichen}
            placeholder="XX-XX 1234"
          />

          {/* Marke — CarQuery-Dropdown (gefiltert nach Baujahr) mit Freitext-
              Fallback. Wenn CarQuery nichts liefert (Offline/Error), zeigen
              wir die Top-20-Liste als datalist. */}
          <div className="space-y-0.5">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
              Marke
              {loadingMarken && <LoaderIcon className="w-3 h-3 text-blue-400 animate-spin" />}
            </label>
            {markeMode === 'dropdown' ? (
              <>
                <input
                  type="text"
                  list="carquery-marken"
                  defaultValue={marke}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v === '__freitext__' || v === 'Sonstiges') {
                      setMarkeMode('freitext')
                      return
                    }
                    if (v !== marke) saveToggle('fahrzeug_hersteller', v || null)
                  }}
                  placeholder={loadingMarken ? 'Lade Marken ...' : 'Marke wählen oder tippen'}
                  className="text-sm font-medium bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-[#4573A2] w-full py-0.5 outline-none"
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
            <label className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
              Modell
              {loadingModelle && <LoaderIcon className="w-3 h-3 text-blue-400 animate-spin" />}
            </label>
            <input
              type="text"
              list="carquery-modelle"
              defaultValue={l.fahrzeug_modell ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (l.fahrzeug_modell ?? '')) {
                  saveToggle('fahrzeug_modell', v || null)
                }
              }}
              disabled={!marke}
              placeholder={!marke ? 'Erst Marke wählen' : loadingModelle ? 'Lade Modelle ...' : 'Modell wählen oder tippen'}
              className="text-sm font-medium bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-[#4573A2] w-full py-0.5 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <datalist id="carquery-modelle">
              {carModelle.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          {/* AAR-177 Fix #3: Eigentümer-Typ mit Info-Tooltip + Label.
              Fix #6: Leasing/Gewerblich kontextuelle Hilfe-Box.
              AAR-188 Fix #3: Label explizit auf Fahrzeug-Eigentümer laut
              ZB1 bezogen — der MA weiß dann dass der Anrufer nicht
              zwingend der Halter sein muss. */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <UserCheckIcon className="w-3 h-3" />
              Fahrzeug-Eigentümer (laut Fahrzeugschein/ZB1)
              <span
                className="text-gray-400 cursor-help"
                title="Privat = Kunde ist Eigentümer + nicht vorsteuerabzugsberechtigt. Leasing = Leasing-Fahrzeug → Vollmacht vom Leasinggeber nötig. Gewerblich = Firma als Eigentümer, Netto-Regulierung (Vorsteuer ziehbar)."
              >
                <InfoIcon className="w-3 h-3" />
              </span>
            </label>
            <p className="text-[10px] text-gray-400">
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
                    ? 'bg-[#4573A2] text-white'
                    : 'bg-gray-100 text-gray-600'
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
                    : 'bg-gray-100 text-gray-600'
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
                    ? 'bg-[#0D1B3E] text-white'
                    : 'bg-gray-100 text-gray-600'
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
              <div className="mt-2 rounded-md bg-[#0D1B3E]/5 border border-[#4573A2]/30 p-2 space-y-1">
                <p className="text-[11px] font-semibold text-[#0D1B3E] flex items-center gap-1">
                  <InfoIcon className="w-3 h-3" /> Hinweis bei Gewerblich
                </p>
                <ul className="text-[10px] text-[#0D1B3E] list-disc list-inside space-y-0.5">
                  <li>Firma als Eigentümer → Gutachten an Firma adressieren</li>
                  <li>Regulierung NETTO (Versicherung zieht USt. ab)</li>
                  <li>Bei Gewerbenachweis-Pflicht: FlowLink zeigt Upload-Slot automatisch</li>
                </ul>
              </div>
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

        {/* AAR-208: Halter-Anzeige aus ZB1-OCR. Wenn Halter-Nachname ≠
            Anrufer-Nachname → Warnung, weil Vollmacht vom Halter nötig ist. */}
        {l.halter_nachname && (
          <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
            <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider flex items-center gap-1">
              <UserCheckIcon className="w-3 h-3" />
              Halter laut ZB1 (Fahrzeugschein)
            </p>
            <p className="text-sm text-gray-900 font-medium">
              {[l.halter_vorname, l.halter_nachname].filter(Boolean).join(' ')}
            </p>
            {(l.halter_strasse || l.halter_plz || l.halter_stadt) && (
              <p className="text-xs text-gray-600">
                {l.halter_strasse}
                {l.halter_strasse && (l.halter_plz || l.halter_stadt) && ', '}
                {l.halter_plz} {l.halter_stadt}
              </p>
            )}
            {(l.hsn || l.tsn) && (
              <p className="text-[10px] text-gray-500">
                HSN/TSN: {l.hsn ?? '—'} / {l.tsn ?? '—'}
              </p>
            )}
            {l.nachname && l.halter_nachname &&
              l.halter_nachname.trim().toLowerCase() !== l.nachname.trim().toLowerCase() && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 flex items-start gap-1.5">
                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-900">
                  <strong>Halter ≠ Anrufer</strong> — bitte mit Kunde klären: Ist der Halter
                  mit der Vertretung einverstanden? Vollmacht wird vom Halter benötigt.
                </p>
              </div>
            )}
          </div>
        )}

        {/* AAR-177 Fix #1: CardentityButton entfernt — Anreicherung läuft
            automatisch nach ZB1-OCR, kein manueller Trigger mehr nötig. */}
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
      {/* AAR-181 / AAR-199: Fahrzeug-Pflichtfelder — Kennzeichen, Marke, Modell.
          Baujahr ist optional (AAR-199). */}
      {!qualification.q7_fahrzeug && (
        <p className="text-[11px] text-amber-700 flex items-start gap-1 px-1">
          <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Pflichtfelder fehlen: Kennzeichen, Marke und Modell müssen gesetzt sein.
        </p>
      )}
    </div>
  )
}
