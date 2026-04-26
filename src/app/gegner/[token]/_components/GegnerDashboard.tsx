'use client'

import { useState } from 'react'
import { submitGegnerDaten, type GegnerDaten } from '../actions'

interface ClaimInfo {
  claim_nummer: string
  schadentag: string
  schadenort_adresse: string | null
  schadenort_ort: string | null
  schadenart: string
  status: string
  phase: string
}

interface Props {
  invitationId: string
  tokenKlartext: string
  claim: ClaimInfo
  alreadyResponded: boolean
}

const SCHADENART_LABEL: Record<string, string> = {
  haftpflicht: 'Haftpflichtschaden',
  vollkasko: 'Vollkaskoschaden',
  teilkasko: 'Teilkaskoschaden',
  eigenverschulden: 'Eigenverschuldensschaden',
  unbekannt: 'Schadensfall',
}

export default function GegnerDashboard({
  invitationId,
  tokenKlartext,
  claim,
  alreadyResponded,
}: Props) {
  const [schritt, setSchritt] = useState<'info' | 'formular' | 'danke'>(
    alreadyResponded ? 'danke' : 'info',
  )
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [daten, setDaten] = useState<GegnerDaten>({
    vorname: '',
    nachname: '',
    geburtsdatum: '',
    telefon: '',
    email: '',
    adresse_strasse: '',
    adresse_plz: '',
    adresse_ort: '',
    versicherung_name: '',
    versicherungsnummer: '',
    kennzeichen: '',
    kommentar: '',
  })

  const schadentag = new Date(claim.schadentag).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const ortText = [claim.schadenort_adresse, claim.schadenort_ort]
    .filter(Boolean)
    .join(', ')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLoading(true)
    const result = await submitGegnerDaten(invitationId, tokenKlartext, daten)
    setLoading(false)
    if (!result.ok) {
      setFehler(result.error)
    } else {
      setSchritt('danke')
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4573A2] bg-white'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: '#0D1B3E' }}
        >
          C
        </div>
        <span className="font-semibold text-sm" style={{ color: '#0D1B3E' }}>
          Claimondo
        </span>
      </div>

      {/* Info-Karte */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">
          Schadensfall
        </p>
        <p className="text-lg font-semibold" style={{ color: '#0D1B3E' }}>
          {SCHADENART_LABEL[claim.schadenart] ?? claim.schadenart}
        </p>
        <div className="mt-3 flex flex-col gap-1 text-sm text-gray-600">
          <span>Datum: {schadentag}</span>
          {ortText && <span>Ort: {ortText}</span>}
          <span className="text-xs text-gray-400">{claim.claim_nummer}</span>
        </div>
      </div>

      {/* Schritt: Info */}
      {schritt === 'info' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-base font-semibold mb-2" style={{ color: '#0D1B3E' }}>
            Sie wurden als Unfallbeteiligter eingeladen
          </h1>
          <p className="text-sm text-gray-600 mb-4">
            Um den Schadensfall schnell und unkompliziert abwickeln zu können,
            bitten wir Sie, Ihre Kontakt- und Versicherungsdaten anzugeben.
            Das dauert ca. 2 Minuten.
          </p>
          <ul className="text-sm text-gray-600 space-y-1 mb-5 list-disc list-inside">
            <li>Ihre Daten werden nur für diesen Schadensfall verwendet</li>
            <li>Keine Registrierung erforderlich</li>
            <li>Verschlüsselte Übertragung</li>
          </ul>
          <button
            onClick={() => setSchritt('formular')}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#0D1B3E' }}
          >
            Daten eingeben
          </button>
        </div>
      )}

      {/* Schritt: Formular */}
      {schritt === 'formular' && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold" style={{ color: '#0D1B3E' }}>
            Ihre Daten
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Vorname *</label>
              <input
                required
                className={inputClass}
                value={daten.vorname}
                onChange={e => setDaten(d => ({ ...d, vorname: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Nachname *</label>
              <input
                required
                className={inputClass}
                value={daten.nachname}
                onChange={e => setDaten(d => ({ ...d, nachname: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Geburtsdatum</label>
              <input
                type="date"
                className={inputClass}
                value={daten.geburtsdatum}
                onChange={e => setDaten(d => ({ ...d, geburtsdatum: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Telefon</label>
              <input
                type="tel"
                className={inputClass}
                value={daten.telefon}
                onChange={e => setDaten(d => ({ ...d, telefon: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>E-Mail</label>
            <input
              type="email"
              className={inputClass}
              value={daten.email}
              onChange={e => setDaten(d => ({ ...d, email: e.target.value }))}
            />
          </div>

          <div>
            <label className={labelClass}>Straße und Hausnummer</label>
            <input
              className={inputClass}
              value={daten.adresse_strasse}
              onChange={e => setDaten(d => ({ ...d, adresse_strasse: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>PLZ</label>
              <input
                className={inputClass}
                maxLength={5}
                value={daten.adresse_plz}
                onChange={e => setDaten(d => ({ ...d, adresse_plz: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Ort</label>
              <input
                className={inputClass}
                value={daten.adresse_ort}
                onChange={e => setDaten(d => ({ ...d, adresse_ort: e.target.value }))}
              />
            </div>
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs font-medium text-gray-500">Fahrzeug & Versicherung</p>

          <div>
            <label className={labelClass}>Kennzeichen</label>
            <input
              className={inputClass}
              placeholder="z.B. B-AB 1234"
              value={daten.kennzeichen}
              onChange={e => setDaten(d => ({ ...d, kennzeichen: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Versicherung</label>
              <input
                className={inputClass}
                placeholder="z.B. Allianz"
                value={daten.versicherung_name}
                onChange={e => setDaten(d => ({ ...d, versicherung_name: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Versicherungsnummer</label>
              <input
                className={inputClass}
                value={daten.versicherungsnummer}
                onChange={e => setDaten(d => ({ ...d, versicherungsnummer: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Anmerkungen (optional)</label>
            <textarea
              className={inputClass}
              rows={3}
              value={daten.kommentar}
              onChange={e => setDaten(d => ({ ...d, kommentar: e.target.value }))}
            />
          </div>

          {fehler && (
            <p className="text-sm text-red-600 rounded-lg bg-red-50 px-3 py-2">{fehler}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSchritt('info')}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Zurück
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-2 flex-grow rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#0D1B3E' }}
            >
              {loading ? 'Wird gespeichert…' : 'Daten absenden'}
            </button>
          </div>
        </form>
      )}

      {/* Schritt: Danke */}
      {schritt === 'danke' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
            style={{ backgroundColor: '#f0f7ef' }}
          >
            ✓
          </div>
          <h2 className="text-base font-semibold mb-2" style={{ color: '#0D1B3E' }}>
            Vielen Dank!
          </h2>
          <p className="text-sm text-gray-600">
            Ihre Daten wurden erfolgreich übermittelt. Wir werden uns bei
            Rückfragen melden.
          </p>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-6">
        Powered by Claimondo · Datenschutz · Impressum
      </p>
    </div>
  )
}
