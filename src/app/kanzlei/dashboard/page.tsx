// AAR-kanzlei-portal Dashboard — Mandat-Liste aller komplett-Fälle.
//
// RLS filtert serverseitig (Migration 20260421151144): Kanzlei-User sieht
// nur Fälle mit service_typ='komplett'. Read-only — keine Edit-Actions
// in diesem Portal.
//
// Spalten (laut Feedback Aaron 21.04.2026):
//   Fall-Nr · Kunde · Aktuelle Phase · Letzte Änderung · Mandatsnummer · Status
//
// Click auf Row → /kanzlei/fall/[id] (Read-only-Fallakte, kommt in PR 2b).

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { FolderOpenIcon, ArrowRightIcon } from 'lucide-react'

const STATUS_PILL: Record<string, { bg: string; text: string; label: string }> = {
  ersterfassung: { bg: '#eef4fb', text: '#1E3A5F', label: 'Ersterfassung' },
  'sv-gesucht': { bg: '#eef4fb', text: '#1E3A5F', label: 'SV gesucht' },
  'sv-zugewiesen': { bg: '#eef4fb', text: '#1E3A5F', label: 'SV zugewiesen' },
  'sv-termin': { bg: '#eef4fb', text: '#1E3A5F', label: 'SV-Termin' },
  besichtigung: { bg: '#fffbeb', text: '#b45309', label: 'Besichtigung' },
  'begutachtung-laeuft': { bg: '#fffbeb', text: '#b45309', label: 'Begutachtung' },
  'gutachten-eingegangen': { bg: '#fff7ed', text: '#c2410c', label: 'Gutachten eingegangen' },
  filmcheck: { bg: '#fff7ed', text: '#c2410c', label: 'Filmcheck' },
  'qc-pruefung': { bg: '#fff7ed', text: '#c2410c', label: 'QC-Prüfung' },
  'kanzlei-uebergeben': { bg: '#f5f3ff', text: '#6d28d9', label: 'Kanzlei übergeben' },
  anschlussschreiben: { bg: '#f5f3ff', text: '#6d28d9', label: 'Anschlussschreiben' },
  regulierung: { bg: '#ecfdf5', text: '#047857', label: 'Regulierung' },
  'regulierung-laeuft': { bg: '#ecfdf5', text: '#047857', label: 'Regulierung läuft' },
  'zahlung-eingegangen': { bg: '#f0fdf4', text: '#15803d', label: 'Zahlung eingegangen' },
  abgeschlossen: { bg: '#ecfdf5', text: '#047857', label: 'Abgeschlossen' },
  'vs-abgelehnt': { bg: '#fef2f2', text: '#b91c1c', label: 'VS abgelehnt' },
  'vs-kuerzt': { bg: '#fef2f2', text: '#b91c1c', label: 'VS kürzt' },
  storniert: { bg: '#f1f3f7', text: '#4b5563', label: 'Storniert' },
}

const PHASE_LABEL: Record<string, string> = {
  '1_ersterfassung': 'Ersterfassung & Termin',
  '1': 'Ersterfassung & Termin',
  '2_begutachtung': 'Begutachtung',
  '2': 'Begutachtung',
  '3_gutachten_qc': 'Gutachten & QC',
  '3': 'Gutachten & QC',
  '4_kanzlei': 'Kanzlei-Übergabe',
  '4': 'Kanzlei-Übergabe',
  '5_anschlussschreiben': 'Anschlussschreiben',
  '5': 'Anschlussschreiben',
  '6_vs_reaktion': 'VS-Reaktion',
  '6': 'VS-Reaktion',
  '7_ablehnung_klage': 'Ablehnung & Klage',
  '7': 'Ablehnung & Klage',
  '8_nachbesichtigung': 'Nachbesichtigung',
  '8': 'Nachbesichtigung',
  '9_regulierung': 'Regulierung & Zahlung',
  '9': 'Regulierung & Zahlung',
  '10_abschluss': 'Auszahlung & Abschluss',
  '10': 'Auszahlung & Abschluss',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default async function KanzleiDashboardPage() {
  const supabase = await createClient()

  const { data: faelle, error } = await supabase
    .from('faelle')
    .select(
      'id, fall_nummer, status, aktuelle_phase, mandatsnummer, kunde_vorname, kunde_nachname, kennzeichen, updated_at, created_at',
    )
    .eq('service_typ', 'komplett')
    .order('updated_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-claimondo-navy">Mandate</h1>
          <p className="text-sm text-claimondo-ondo mt-1">
            Alle Komplett-Pakete, bei denen Claimondo das Mandat an euch übergeben hat.
          </p>
        </div>
        <span className="text-xs text-claimondo-ondo">
          {faelle?.length ?? 0} Mandat{(faelle?.length ?? 0) === 1 ? '' : 'e'}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fehler beim Laden: {error.message}
        </div>
      )}

      {!error && faelle && faelle.length === 0 && (
        <div className="rounded-xl border border-claimondo-border bg-white p-8 text-center">
          <FolderOpenIcon className="w-10 h-10 mx-auto text-claimondo-shield mb-2" />
          <p className="text-sm font-medium text-claimondo-navy">
            Aktuell liegt kein Komplett-Mandat vor.
          </p>
          <p className="text-xs text-claimondo-ondo mt-1">
            Sobald Claimondo ein Mandat an euch übergibt, erscheint es hier.
          </p>
        </div>
      )}

      {!error && faelle && faelle.length > 0 && (
        <div className="rounded-xl border border-claimondo-border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-claimondo-bg text-[10px] uppercase tracking-wider text-claimondo-ondo">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Fall-Nr</th>
                  <th className="text-left px-4 py-3 font-semibold">Kunde</th>
                  <th className="text-left px-4 py-3 font-semibold">Kennzeichen</th>
                  <th className="text-left px-4 py-3 font-semibold">Phase</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Mandat-Nr</th>
                  <th className="text-left px-4 py-3 font-semibold">Letzte Änderung</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {faelle.map((f) => {
                  const kunde = [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—'
                  const statusCfg = STATUS_PILL[(f.status as string) ?? ''] ?? null
                  const phaseKey = String(f.aktuelle_phase ?? '')
                  const phaseLabel = PHASE_LABEL[phaseKey] ?? phaseKey ?? '—'
                  return (
                    <tr
                      key={f.id}
                      className="border-t border-claimondo-border hover:bg-claimondo-bg transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[12px] text-claimondo-navy">
                        <Link
                          href={`/kanzlei/fall/${f.id}`}
                          className="hover:underline"
                        >
                          {f.fall_nummer ?? f.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-claimondo-navy">{kunde}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-claimondo-navy">
                        {f.kennzeichen ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-claimondo-navy">{phaseLabel}</td>
                      <td className="px-4 py-3">
                        {statusCfg ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                            style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
                          >
                            {statusCfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-claimondo-ondo/70">{f.status ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-claimondo-navy">
                        {f.mandatsnummer ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-claimondo-ondo text-xs">
                        {formatDate((f.updated_at as string | null) ?? (f.created_at as string | null))}
                      </td>
                      <td className="px-4 py-3 text-claimondo-ondo/70">
                        <Link href={`/kanzlei/fall/${f.id}`} aria-label="Öffnen">
                          <ArrowRightIcon className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
