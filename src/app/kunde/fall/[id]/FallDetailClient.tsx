'use client'

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
  sv_zugewiesen_am: string | null
  sv_termin: string | null
  gutachten_eingegangen_am: string | null
  gutachten_betrag: number | null
  kanzlei_uebergeben_am: string | null
  regulierung_betrag: number | null
  regulierung_am: string | null
  created_at: string
}

type Dokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
  created_at: string
}

type SV = {
  id: string
  paket: string
  profile: { vorname: string | null; nachname: string | null; telefon: string | null } | null
} | null

// ─── Constants ──────────────────────────────────────────────────────────────

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

// Timeline steps derived from the case data
type TimelineStep = {
  label: string
  description: string
  date: string | null
  reached: boolean
  active: boolean
}

const STATUS_ORDER = [
  'ersterfassung',
  'sv-zugewiesen',
  'sv-termin',
  'gutachten-eingegangen',
  'filmcheck',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'abgeschlossen',
]

function getStatusIndex(status: string): number {
  const idx = STATUS_ORDER.indexOf(status)
  return idx >= 0 ? idx : 0
}

function buildTimeline(fall: Fall): TimelineStep[] {
  const currentIdx = getStatusIndex(fall.status)

  return [
    {
      label: 'Schadensfall erfasst',
      description: 'Ihr Schadensfall wurde aufgenommen und wird bearbeitet.',
      date: fall.created_at,
      reached: currentIdx >= 0,
      active: currentIdx === 0,
    },
    {
      label: 'Gutachter zugewiesen',
      description: 'Ein Sachverständiger wurde mit der Begutachtung beauftragt.',
      date: fall.sv_zugewiesen_am,
      reached: currentIdx >= 1,
      active: currentIdx >= 1 && currentIdx <= 2,
    },
    {
      label: 'Gutachten erstellt',
      description: 'Das Gutachten wurde erstellt und wird geprüft.',
      date: fall.gutachten_eingegangen_am,
      reached: currentIdx >= 3,
      active: currentIdx >= 3 && currentIdx <= 4,
    },
    {
      label: 'An Kanzlei übergeben',
      description: 'Ihr Fall wurde an die Partnerkanzlei zur rechtlichen Durchsetzung übergeben.',
      date: fall.kanzlei_uebergeben_am,
      reached: currentIdx >= 5,
      active: currentIdx >= 5 && currentIdx <= 6,
    },
    {
      label: 'Regulierung',
      description: fall.regulierung_betrag
        ? `Die Versicherung hat ${fmtCurrency(fall.regulierung_betrag)} reguliert.`
        : 'Die Schadensregulierung durch die Versicherung läuft.',
      date: fall.regulierung_am,
      reached: currentIdx >= 7,
      active: currentIdx === 7,
    },
    {
      label: 'Abgeschlossen',
      description: 'Ihr Schadensfall wurde erfolgreich abgeschlossen.',
      date: fall.status === 'abgeschlossen' ? fall.regulierung_am : null,
      reached: currentIdx >= 8,
      active: currentIdx === 8,
    },
  ]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function FallDetailClient({
  fall,
  dokumente,
  sv,
}: {
  fall: Fall
  dokumente: Dokument[]
  sv: SV
}) {
  const timeline = buildTimeline(fall)
  const isStorniert = fall.status === 'storniert'
  const fotos = dokumente.filter(d => d.typ.startsWith('foto'))
  const andereDokumente = dokumente.filter(d => !d.typ.startsWith('foto'))

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <a
            href="/kunde"
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            ← Meine Fälle
          </a>
          <div className="flex items-start justify-between mt-2">
            <div>
              <h1 className="text-xl font-semibold text-white">
                {URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? 'Schadensfall'}
              </h1>
              <p className="text-zinc-500 text-sm mt-0.5">
                Fall {fall.fall_nummer ?? fall.id.slice(0, 8)}
                {' · '}
                {[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || 'Keine Adresse'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">

          {/* Storniert banner */}
          {isStorniert && (
            <div className="bg-red-950 border border-red-800 rounded-2xl p-5">
              <p className="text-red-300 font-medium text-sm">Dieser Fall wurde storniert.</p>
            </div>
          )}

          {/* ── Status-Timeline ── */}
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-5">
              Status-Verlauf
            </h3>

            <div className="relative">
              {timeline.map((step, i) => {
                const isLast = i === timeline.length - 1
                return (
                  <div key={step.label} className="flex gap-4 relative">
                    {/* Vertical line + dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`w-4 h-4 rounded-full border-2 shrink-0 z-10 ${
                          step.active
                            ? 'border-blue-500 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                            : step.reached
                            ? 'border-blue-500/60 bg-blue-500/60'
                            : 'border-zinc-700 bg-zinc-800'
                        }`}
                      />
                      {!isLast && (
                        <div
                          className={`w-0.5 flex-1 min-h-8 ${
                            step.reached && timeline[i + 1]?.reached
                              ? 'bg-blue-500/40'
                              : 'bg-zinc-800'
                          }`}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                      <p className={`text-sm font-medium leading-tight ${
                        step.active
                          ? 'text-white'
                          : step.reached
                          ? 'text-zinc-300'
                          : 'text-zinc-600'
                      }`}>
                        {step.label}
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        step.reached ? 'text-zinc-500' : 'text-zinc-700'
                      }`}>
                        {step.description}
                      </p>
                      {step.date && (
                        <p className="text-zinc-600 text-xs mt-1">
                          {fmt(step.date)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Dokumente ── */}
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Dokumente
            </h3>

            {dokumente.length === 0 ? (
              <p className="text-zinc-600 text-sm">Noch keine Dokumente vorhanden.</p>
            ) : (
              <div className="space-y-4">
                {/* Fotos */}
                {fotos.length > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs mb-2">Schadensfotos ({fotos.length})</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
                  </div>
                )}

                {/* Other documents */}
                {andereDokumente.length > 0 && (
                  <div>
                    {fotos.length > 0 && (
                      <p className="text-zinc-500 text-xs mb-2">Weitere Dokumente</p>
                    )}
                    <div className="space-y-1">
                      {andereDokumente.map(doc => (
                        <a
                          key={doc.id}
                          href={doc.datei_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-zinc-800 transition-colors"
                        >
                          <DocIcon />
                          <div className="min-w-0 flex-1">
                            <span className="text-zinc-200 text-sm block truncate">
                              {doc.datei_name ?? doc.datei_url.split('/').pop()}
                            </span>
                            <span className="text-zinc-600 text-xs">
                              {typLabel(doc.typ)} · {fmt(doc.created_at)}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Bearbeiter / Kontakt ── */}
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Ihr Ansprechpartner
            </h3>

            {sv?.profile ? (
              <div className="space-y-0">
                <InfoRow
                  label="Name"
                  value={`${sv.profile.vorname ?? ''} ${sv.profile.nachname ?? ''}`.trim() || '—'}
                />
                <InfoRow label="Rolle" value="Sachverständiger" />
                {sv.profile.telefon && (
                  <InfoRow
                    label="Telefon"
                    value={
                      <a href={`tel:${sv.profile.telefon}`} className="text-blue-400 hover:text-blue-300">
                        {sv.profile.telefon}
                      </a>
                    }
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-zinc-600 text-sm">
                  Noch kein Bearbeiter zugewiesen.
                </p>
                <p className="text-zinc-700 text-xs mt-1">
                  Sobald ein Sachverständiger zugewiesen wird, sehen Sie hier die Kontaktdaten.
                </p>
              </div>
            )}
          </div>

          {/* ── Fall-Info ── */}
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Fall-Details
            </h3>
            <InfoRow label="Fallnummer" value={fall.fall_nummer ?? fall.id.slice(0, 8)} />
            <InfoRow label="Schadensart" value={URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '—'} />
            <InfoRow label="Schadensdatum" value={fmt(fall.schadens_datum) ?? '—'} />
            <InfoRow
              label="Adresse"
              value={[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'}
            />
            {fall.schadens_beschreibung && (
              <div className="mt-3 pt-3 border-t border-zinc-800/50">
                <p className="text-zinc-500 text-xs mb-1">Beschreibung</p>
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{fall.schadens_beschreibung}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-sm w-32 shrink-0">{label}</span>
      <span className="text-zinc-200 text-sm">{value || '—'}</span>
    </div>
  )
}

function DocIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-zinc-500 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function typLabel(typ: string): string {
  const map: Record<string, string> = {
    gutachten: 'Gutachten',
    abtretung: 'Abtretung',
    vollmacht: 'Vollmacht',
    rechnung: 'Rechnung',
    'foto-schaden': 'Schadensfoto',
  }
  return map[typ] ?? typ
}
