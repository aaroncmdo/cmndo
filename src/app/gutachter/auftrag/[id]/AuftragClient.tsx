'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadGutachten } from './actions'

// ─── Types ──────────────────────────────────────────────────────────────────

type Fall = {
  id: string
  fall_nummer: string | null
  status: string
  schadens_ursache: string | null
  schadens_beschreibung: string | null
  schadens_datum: string | null
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
  sv_termin: string | null
  gutachten_eingegangen_am: string | null
  gutachten_betrag: number | null
  versicherung_name: string | null
  versicherung_schaden_nr: string | null
  created_at: string
}

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type Dokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
  created_at: string
}

type Partei = {
  id: string
  rolle: string
  name: string
  versicherung_name: string | null
  versicherung_nr: string | null
  telefon: string | null
  email: string | null
}

type Schadensposition = {
  id: string
  kategorie: string
  bezeichnung: string
  beschreibung: string | null
  geschaetzter_wert: number | null
  reparaturkosten: number | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  'sv-zugewiesen': 'Zugewiesen',
  'sv-termin': 'Termin vereinbart',
  'gutachten-eingegangen': 'Gutachten eingereicht',
  filmcheck: 'Im Filmcheck',
  'kanzlei-uebergeben': 'Bei Kanzlei',
  abgeschlossen: 'Abgeschlossen',
}

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

const KATEGORIE_LABEL: Record<string, string> = {
  boden: 'Boden', wand: 'Wand', decke: 'Decke', moebel: 'Möbel',
  kueche: 'Küche', bad: 'Bad', elektro: 'Elektro', sanitaer: 'Sanitär',
  fenster: 'Fenster', tuer: 'Tür', fassade: 'Fassade', sonstiges: 'Sonstiges',
}

const VOR_ORT_CHECKLISTE = [
  { id: 'fotos-vor-ort', label: 'Eigene Fotos vor Ort gemacht (Übersicht + Detail)' },
  { id: 'masse', label: 'Maße der beschädigten Bereiche aufgenommen' },
  { id: 'feuchtigkeit', label: 'Feuchtigkeitsmessung durchgeführt (falls relevant)' },
  { id: 'ursache-verifiziert', label: 'Schadensursache vor Ort verifiziert' },
  { id: 'gespraech', label: 'Gespräch mit Geschädigtem geführt' },
  { id: 'zusatz-dokumente', label: 'Zusätzliche Dokumente eingeholt (Rechnungen, Belege)' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-200/50 last:border-0">
      <span className="text-gray-500 text-sm w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-sm">{value || '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200">
      <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function AuftragClient({
  fall,
  lead,
  dokumente,
  parteien,
  schadenspositionen,
}: {
  fall: Fall
  lead: Lead
  dokumente: Dokument[]
  parteien: Partei[]
  schadenspositionen: Schadensposition[]
}) {
  const router = useRouter()
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fotos = dokumente.filter(d => d.typ.startsWith('foto'))
  const gutachtenAlreadySubmitted = !!fall.gutachten_eingegangen_am

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData(e.currentTarget)
      await uploadGutachten(fall.id, formData)
      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Hochladen')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <a
              href="/gutachter/auftraege"
              className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
            >
              ← Alle Aufträge
            </a>
            <h1 className="text-xl font-semibold text-gray-900 mt-1">
              Auftrag{fall.fall_nummer ? ` · ${fall.fall_nummer}` : ''}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || lead.email : '—'}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap mt-1 ${
            gutachtenAlreadySubmitted
              ? 'bg-green-50 text-green-300'
              : 'bg-[#4573A2]/5 text-[#7BA3CC]'
          }`}>
            {STATUS_LABEL[fall.status] ?? fall.status}
          </span>
        </div>

        <div className="space-y-4">

          {/* Kundendaten */}
          {lead && (
            <Section title="Kundendaten">
              <InfoRow label="Name" value={`${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()} />
              <InfoRow label="E-Mail" value={
                lead.email ? (
                  <a href={`mailto:${lead.email}`} className="text-[#7BA3CC] hover:text-[#7BA3CC]">{lead.email}</a>
                ) : null
              } />
              <InfoRow label="Telefon" value={
                lead.telefon ? (
                  <a href={`tel:${lead.telefon}`} className="text-[#7BA3CC] hover:text-[#7BA3CC]">{lead.telefon}</a>
                ) : null
              } />
            </Section>
          )}

          {/* Schadens-Adresse & Daten */}
          <Section title="Schadensdaten">
            <InfoRow label="Ursache" value={URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? fall.schadens_ursache} />
            <InfoRow label="Datum" value={fmt(fall.schadens_datum)} />
            <InfoRow
              label="Adresse"
              value={
                <span className="font-medium text-gray-900">
                  {[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'}
                </span>
              }
            />
            <InfoRow label="SV-Termin" value={fmt(fall.sv_termin)} />
            {fall.versicherung_name && (
              <>
                <InfoRow label="Versicherung" value={fall.versicherung_name} />
                <InfoRow label="Schadennr." value={fall.versicherung_schaden_nr} />
              </>
            )}
          </Section>

          {/* Schadensbeschreibung */}
          {fall.schadens_beschreibung && (
            <Section title="Schadensbeschreibung">
              <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                {fall.schadens_beschreibung}
              </p>
            </Section>
          )}

          {/* Parteien */}
          {parteien.length > 0 && (
            <Section title="Beteiligte Parteien">
              {parteien.map(p => (
                <div key={p.id} className="py-2 border-b border-gray-200/50 last:border-0">
                  <div className="flex gap-2 items-baseline">
                    <span className="text-xs text-gray-500 uppercase tracking-wider w-24 shrink-0">
                      {p.rolle === 'geschaedigter' ? 'Geschädigter' : 'Schädiger'}
                    </span>
                    <span className="text-gray-800 text-sm">{p.name}</span>
                  </div>
                  {(p.telefon || p.email) && (
                    <div className="flex gap-4 mt-0.5 ml-26 text-xs text-gray-500">
                      {p.telefon && <span>Tel: {p.telefon}</span>}
                      {p.email && <span>{p.email}</span>}
                    </div>
                  )}
                  {p.versicherung_name && (
                    <div className="flex gap-2 mt-0.5 ml-26 text-xs text-gray-500">
                      <span>Versicherung: {p.versicherung_name}</span>
                      {p.versicherung_nr && <span>Nr. {p.versicherung_nr}</span>}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Schadenspositionen */}
          {schadenspositionen.length > 0 && (
            <Section title={`Schadenspositionen (${schadenspositionen.length})`}>
              <div className="space-y-2">
                {schadenspositionen.map(pos => (
                  <div key={pos.id} className="flex items-start justify-between py-1.5 border-b border-gray-200/50 last:border-0">
                    <div>
                      <span className="text-gray-700 text-sm">{pos.bezeichnung}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        {KATEGORIE_LABEL[pos.kategorie] ?? pos.kategorie}
                      </span>
                      {pos.beschreibung && (
                        <p className="text-gray-500 text-xs mt-0.5">{pos.beschreibung}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {pos.geschaetzter_wert != null && (
                        <span className="text-gray-500 text-xs block">
                          Wert: {fmtCurrency(pos.geschaetzter_wert)}
                        </span>
                      )}
                      {pos.reparaturkosten != null && (
                        <span className="text-gray-700 text-sm">{fmtCurrency(pos.reparaturkosten)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Kundenfotos */}
          {fotos.length > 0 && (
            <Section title={`Schadensfotos vom Kunden (${fotos.length})`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {fotos.map(doc => (
                  <a
                    key={doc.id}
                    href={doc.datei_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded-xl overflow-hidden bg-gray-100 hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={doc.datei_url}
                      alt={doc.datei_name ?? 'Schadensfoto'}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Vor-Ort-Checkliste */}
          {!gutachtenAlreadySubmitted && (
            <Section title="Checkliste Vor-Ort-Besichtigung">
              <p className="text-gray-500 text-xs mb-4">
                Was bei der Besichtigung noch eingeholt/geprüft werden muss:
              </p>
              <div className="space-y-2">
                {VOR_ORT_CHECKLISTE.map(item => (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checks[item.id] ?? false}
                      onChange={e =>
                        setChecks(prev => ({ ...prev, [item.id]: e.target.checked }))
                      }
                      className="mt-0.5 w-5 h-5 rounded accent-[#4573A2] shrink-0 cursor-pointer"
                    />
                    <span className={`text-sm leading-snug ${
                      checks[item.id] ? 'text-gray-500 line-through' : 'text-gray-800'
                    }`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Bericht hochladen */}
          {gutachtenAlreadySubmitted || success ? (
            <div className="bg-white rounded-2xl p-8 border border-green-900 text-center">
              <div className="text-green-400 text-4xl mb-3">✓</div>
              <h3 className="text-gray-900 font-semibold text-lg mb-1">Gutachten eingereicht</h3>
              <p className="text-gray-500 text-sm">
                Eingereicht am {fmt(fall.gutachten_eingegangen_am)} · Betrag: {fmtCurrency(fall.gutachten_betrag)}
              </p>
            </div>
          ) : (
            <Section title="Gutachten hochladen">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* PDF Upload */}
                <div>
                  <label className="block text-gray-500 text-sm mb-2">
                    Gutachten (PDF)
                  </label>
                  <input
                    type="file"
                    name="datei"
                    accept="application/pdf"
                    required
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-800 hover:file:bg-zinc-700 file:cursor-pointer file:transition-colors"
                  />
                </div>

                {/* Betrag */}
                <div>
                  <label className="block text-gray-500 text-sm mb-2">
                    Schadenssumme (Gutachten-Betrag)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="betrag"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0,00"
                      className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 pr-12 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">EUR</span>
                  </div>
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#1E3A5F] hover:bg-[#4573A2] text-white"
                >
                  {submitting ? 'Wird hochgeladen...' : 'Gutachten einreichen'}
                </button>
              </form>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
