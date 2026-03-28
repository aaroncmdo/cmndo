'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveFilmcheck } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  abtretung_pdf: string | null
  vollmacht_pdf: string | null
  abtretung_signiert_am: string | null
  vollmacht_signiert_am: string | null
  sv_id: string | null
  sv_zugewiesen_am: string | null
  sv_termin: string | null
  gutachten_eingegangen_am: string | null
  gutachten_betrag: number | null
  kanzlei_uebergeben_am: string | null
  versicherung_name: string | null
  versicherung_schaden_nr: string | null
  regulierung_betrag: number | null
  regulierung_am: string | null
  filmcheck_ok: boolean
  filmcheck_am: string | null
  filmcheck_notizen: string | null
  notizen: string | null
  created_at: string
}

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type SV = {
  id: string
  paket: string
  profile: { vorname: string | null; nachname: string | null; telefon: string | null } | null
} | null

type Schadensposition = {
  id: string
  kategorie: string
  bezeichnung: string
  beschreibung: string | null
  geschaetzter_wert: number | null
  reparaturkosten: number | null
}

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

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV Termin',
  'gutachten-eingegangen': 'Gutachten eingegangen',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
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
  boden: 'Boden',
  wand: 'Wand',
  decke: 'Decke',
  moebel: 'Möbel',
  kueche: 'Küche',
  bad: 'Bad',
  elektro: 'Elektro',
  sanitaer: 'Sanitär',
  fenster: 'Fenster',
  tuer: 'Tür',
  fassade: 'Fassade',
  sonstiges: 'Sonstiges',
}

const FILMCHECK_ITEMS = [
  { id: 'fotos', label: 'Fotos vollständig (mind. 3 Schadensfotos vorhanden)' },
  { id: 'beweise', label: 'Beweise vorhanden (Mietvertrag, Übergabeprotokoll o.ä.)' },
  { id: 'gutachten', label: 'Gutachten plausibel (Betrag & Datum eingetragen)' },
  { id: 'parteien', label: 'Parteien korrekt (Geschädigter & Schädiger erfasst)' },
  { id: 'vollstaendig', label: 'Alle versicherungsrelevanten Unterlagen vollständig' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    <div className="flex gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-sm w-40 shrink-0">{label}</span>
      <span className="text-zinc-200 text-sm">{value || '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'uebersicht' | 'dokumente' | 'filmcheck'

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FallakteClient({
  fall,
  lead,
  sv,
  schadenspositionen,
  dokumente,
  parteien,
}: {
  fall: Fall
  lead: Lead
  sv: SV
  schadenspositionen: Schadensposition[]
  dokumente: Dokument[]
  parteien: Partei[]
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('uebersicht')

  // Filmcheck state
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [notizen, setNotizen] = useState(fall.filmcheck_notizen ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [filmcheckDone, setFilmcheckDone] = useState(fall.filmcheck_ok)
  const [error, setError] = useState<string | null>(null)

  const allChecked = FILMCHECK_ITEMS.every(item => checks[item.id])
  const fotos = dokumente.filter(d => d.typ.startsWith('foto'))

  async function handleFilmcheck() {
    setSubmitting(true)
    setError(null)
    try {
      await saveFilmcheck(fall.id, notizen)
      setFilmcheckDone(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <a href="/admin/faelle" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                ← Alle Fälle
              </a>
            </div>
            <h1 className="text-xl font-semibold text-white">
              Fallakte{fall.fall_nummer ? ` · ${fall.fall_nummer}` : ''}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || lead.email : '—'}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 whitespace-nowrap mt-1">
            {STATUS_LABEL[fall.status] ?? fall.status}
          </span>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          {([
            ['uebersicht', 'Übersicht'],
            ['dokumente', `Dokumente (${dokumente.length})`],
            ['filmcheck', fall.filmcheck_ok ? '✓ Filmcheck' : 'Filmcheck'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Übersicht ── */}
        {activeTab === 'uebersicht' && (
          <div className="space-y-4">

            {/* Kundendaten */}
            {lead && (
              <Section title="Kundendaten">
                <InfoRow label="Name" value={`${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()} />
                <InfoRow label="E-Mail" value={lead.email} />
                <InfoRow label="Telefon" value={lead.telefon} />
              </Section>
            )}

            {/* Schadensdaten */}
            <Section title="Schadensdaten">
              <InfoRow label="Ursache" value={URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? fall.schadens_ursache} />
              <InfoRow label="Datum" value={fmt(fall.schadens_datum)} />
              <InfoRow
                label="Adresse"
                value={[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ')}
              />
              <InfoRow label="Beschreibung" value={fall.schadens_beschreibung} />
            </Section>

            {/* Unterschriften */}
            <Section title="Unterschriften">
              <InfoRow
                label="Abtretung"
                value={
                  fall.abtretung_signiert_am ? (
                    <span className="text-green-400">✓ Signiert am {fmt(fall.abtretung_signiert_am)}</span>
                  ) : (
                    <span className="text-zinc-600">Noch nicht signiert</span>
                  )
                }
              />
              <InfoRow
                label="Vollmacht"
                value={
                  fall.vollmacht_signiert_am ? (
                    <span className="text-green-400">✓ Signiert am {fmt(fall.vollmacht_signiert_am)}</span>
                  ) : (
                    <span className="text-zinc-600">Noch nicht signiert</span>
                  )
                }
              />
            </Section>

            {/* Parteien */}
            {parteien.length > 0 && (
              <Section title="Parteien">
                {parteien.map(p => (
                  <div key={p.id} className="py-2 border-b border-zinc-800/50 last:border-0">
                    <div className="flex gap-2 items-baseline">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider w-24 shrink-0">
                        {p.rolle === 'geschaedigter' ? 'Geschädigter' : 'Schädiger'}
                      </span>
                      <span className="text-zinc-200 text-sm">{p.name}</span>
                    </div>
                    {p.versicherung_name && (
                      <div className="flex gap-2 mt-0.5 ml-26">
                        <span className="text-zinc-500 text-xs">Versicherung: {p.versicherung_name}</span>
                        {p.versicherung_nr && <span className="text-zinc-600 text-xs">Nr. {p.versicherung_nr}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Sachverständiger */}
            <Section title="Sachverständiger">
              {sv ? (
                <>
                  <InfoRow
                    label="Name"
                    value={sv.profile ? `${sv.profile.vorname ?? ''} ${sv.profile.nachname ?? ''}`.trim() : '—'}
                  />
                  <InfoRow label="Paket" value={sv.paket} />
                  <InfoRow label="Zugewiesen am" value={fmt(fall.sv_zugewiesen_am)} />
                  <InfoRow label="SV-Termin" value={fmt(fall.sv_termin)} />
                </>
              ) : (
                <p className="text-zinc-600 text-sm">Noch kein SV zugewiesen.</p>
              )}
            </Section>

            {/* Gutachten */}
            <Section title="Gutachten">
              <InfoRow label="Eingegangen am" value={fmt(fall.gutachten_eingegangen_am)} />
              <InfoRow label="Betrag" value={fmtCurrency(fall.gutachten_betrag)} />
            </Section>

            {/* Versicherung */}
            <Section title="Versicherung">
              <InfoRow label="Versicherung" value={fall.versicherung_name} />
              <InfoRow label="Schadennummer" value={fall.versicherung_schaden_nr} />
            </Section>

            {/* Kanzlei / Regulierung */}
            <Section title="Kanzlei & Regulierung">
              <InfoRow label="Übergeben am" value={fmt(fall.kanzlei_uebergeben_am)} />
              <InfoRow label="Regulierungsbetrag" value={fmtCurrency(fall.regulierung_betrag)} />
              <InfoRow label="Reguliert am" value={fmt(fall.regulierung_am)} />
            </Section>

            {/* Schadenspositionen */}
            {schadenspositionen.length > 0 && (
              <Section title={`Schadenspositionen (${schadenspositionen.length})`}>
                <div className="space-y-2">
                  {schadenspositionen.map(pos => (
                    <div key={pos.id} className="flex items-start justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
                      <div>
                        <span className="text-zinc-300 text-sm">{pos.bezeichnung}</span>
                        <span className="text-zinc-600 text-xs ml-2">{KATEGORIE_LABEL[pos.kategorie] ?? pos.kategorie}</span>
                        {pos.beschreibung && <p className="text-zinc-500 text-xs mt-0.5">{pos.beschreibung}</p>}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {pos.reparaturkosten != null && (
                          <span className="text-zinc-300 text-sm">{fmtCurrency(pos.reparaturkosten)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {schadenspositionen.some(p => p.reparaturkosten != null) && (
                    <div className="flex justify-between pt-2">
                      <span className="text-zinc-400 text-sm font-medium">Gesamt</span>
                      <span className="text-white text-sm font-semibold">
                        {fmtCurrency(
                          schadenspositionen.reduce((s, p) => s + (p.reparaturkosten ?? 0), 0)
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Notizen */}
            {fall.notizen && (
              <Section title="Notizen">
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{fall.notizen}</p>
              </Section>
            )}
          </div>
        )}

        {/* ── Dokumente ── */}
        {activeTab === 'dokumente' && (
          <div>
            {dokumente.length === 0 ? (
              <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
                <p className="text-zinc-500">Keine Dokumente vorhanden.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Fotos grid */}
                {fotos.length > 0 && (
                  <Section title={`Schadensfotos (${fotos.length})`}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                      {fotos.map(doc => (
                        <a
                          key={doc.id}
                          href={doc.datei_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block aspect-square rounded-xl overflow-hidden bg-zinc-800 hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={doc.datei_url}
                            alt={doc.datei_name ?? 'Foto'}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Other documents */}
                {dokumente.filter(d => !d.typ.startsWith('foto')).length > 0 && (
                  <Section title="Weitere Dokumente">
                    <div className="space-y-1">
                      {dokumente
                        .filter(d => !d.typ.startsWith('foto'))
                        .map(doc => (
                          <a
                            key={doc.id}
                            href={doc.datei_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <span className="text-zinc-400 text-xs uppercase tracking-wider w-24 shrink-0">
                              {doc.typ}
                            </span>
                            <span className="text-zinc-200 text-sm hover:text-blue-300 transition-colors">
                              {doc.datei_name ?? doc.datei_url.split('/').pop()}
                            </span>
                            <span className="text-zinc-600 text-xs ml-auto">
                              {fmt(doc.created_at)}
                            </span>
                          </a>
                        ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Filmcheck ── */}
        {activeTab === 'filmcheck' && (
          <div>
            {filmcheckDone ? (
              <div className="bg-zinc-900 rounded-2xl p-8 border border-green-900 text-center">
                <div className="text-green-400 text-4xl mb-3">✓</div>
                <h3 className="text-white font-semibold text-lg mb-1">Filmcheck abgeschlossen</h3>
                <p className="text-zinc-400 text-sm mb-2">
                  Abgeschlossen am {fmt(fall.filmcheck_am)}
                </p>
                {fall.filmcheck_notizen && (
                  <p className="text-zinc-500 text-sm mt-4 text-left bg-zinc-800 rounded-xl p-4 whitespace-pre-wrap">
                    {fall.filmcheck_notizen}
                  </p>
                )}
                <p className="text-green-400 text-sm mt-4 font-medium">Fall wurde an Kanzlei übergeben</p>
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
                <h3 className="text-white font-semibold mb-1">Filmcheck</h3>
                <p className="text-zinc-500 text-sm mb-6">
                  Überprüfe alle Punkte bevor der Fall an die Kanzlei übergeben wird.
                </p>

                <div className="space-y-3 mb-6">
                  {FILMCHECK_ITEMS.map(item => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checks[item.id] ?? false}
                        onChange={e =>
                          setChecks(prev => ({ ...prev, [item.id]: e.target.checked }))
                        }
                        className="mt-0.5 w-5 h-5 rounded accent-blue-600 shrink-0 cursor-pointer"
                      />
                      <span className={`text-sm leading-snug ${checks[item.id] ? 'text-zinc-300 line-through' : 'text-zinc-200'}`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Notizen */}
                <div className="mb-6">
                  <label className="block text-zinc-400 text-sm mb-2">Notizen (optional)</label>
                  <textarea
                    value={notizen}
                    onChange={e => setNotizen(e.target.value)}
                    rows={3}
                    placeholder="Anmerkungen zum Filmcheck..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm mb-4">{error}</p>
                )}

                <button
                  onClick={handleFilmcheck}
                  disabled={!allChecked || submitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500 text-white"
                >
                  {submitting
                    ? 'Wird gespeichert...'
                    : allChecked
                    ? 'Filmcheck abschließen & an Kanzlei übergeben'
                    : `Noch ${FILMCHECK_ITEMS.filter(i => !checks[i.id]).length} Punkt(e) offen`}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
