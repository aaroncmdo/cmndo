import Link from 'next/link'
import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUserId } from '@/lib/auth/require-admin-user-id'
import { ladeHaengendeClaims } from '@/lib/claims/haenger-laden'
import { HAENGER_SCHWELLE_TAGE } from '@/lib/claims/haenger-detektor'

// Haengende Faelle auf dem Admin-Dashboard.
//
// ⭐ WARUM HIER UND NICHT IN DER AUFGABENLISTE (Messung 01.09.):
// Der Haenger-Detektor meldet seit dem 13.08. korrekt — die Meldungen landen nur in
// /admin/aufgaben/alle, und diese Liste wird nicht abgearbeitet. Belegt: von 1251
// erledigten Aufgaben entfielen 1213 auf EINEN Tag (13.08., ein einziger Typ = eine
// Aufraeumaktion); an allen anderen Tagen 1-6 Stueck, davon die meisten AUTOMATISCH
// aufgeloest. Manuelle Abarbeitung findet praktisch nicht statt.
//
// Folge: 45 echte Haenger-Meldungen lagen unbeachtet, waehrend fuenf Kunden 33-45 Tage
// auf eine Rueckmeldung warteten — einer davon mit Portalzugang, der aktiv nachsah.
//
// Dieses Widget aendert nichts an den Daten. Es stellt dieselbe Information dorthin,
// wo taeglich hingeschaut wird, und sortiert sie nach dem, was zaehlt: wer am laengsten
// wartet, steht oben.
//
// ⚠ Die Ermittlung ist mit dem Cron GETEILT (lib/claims/haenger-laden) — sonst zeigte
// dieses Widget frueher oder spaeter etwas anderes an, als der Cron meldet.

/** Mehr als das wird nicht gelistet — das Widget soll ein Einstieg sein, keine Tabelle. */
const MAX_ZEILEN = 8

/** Ab wann die Wartezeit optisch eskaliert. */
const TAGE_KRITISCH = 30
const TAGE_WARNUNG = 14

function tonFuer(tage: number): { box: string; text: string } {
  if (tage >= TAGE_KRITISCH) return { box: 'bg-danger-soft', text: 'text-danger-strong' }
  if (tage >= TAGE_WARNUNG) return { box: 'bg-warning-soft', text: 'text-warning-strong' }
  return { box: 'bg-claimondo-ondo/10', text: 'text-claimondo-navy' }
}

export default async function HaengendeFaelleWidget() {
  // Rolle explizit pruefen, DANN den Admin-Client nutzen: so zeigt das Widget garantiert
  // dieselbe Menge, die der Cron meldet (RLS auf phase_transitions/profiles koennte sonst
  // einzelne Zeilen verbergen und die Zahlen auseinanderlaufen lassen).
  const adminId = await requireAdminUserId()
  if (!adminId) return null

  const { haenger, error } = await ladeHaengendeClaims(createAdminClient())

  if (error) {
    return (
      <SectionCard title="Fälle ohne Bewegung">
        <p className="text-sm text-danger-strong">
          Konnte nicht geladen werden: {error}
        </p>
      </SectionCard>
    )
  }

  if (haenger.length === 0) {
    return (
      <SectionCard
        title="Fälle ohne Bewegung"
        subtitle={`Kein Fall steht länger als ${HAENGER_SCHWELLE_TAGE} Tage still`}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2Icon className="h-5 w-5 text-success-strong" />
          <p className="text-sm text-claimondo-navy">Alles in Bewegung.</p>
        </div>
      </SectionCard>
    )
  }

  const sichtbar = haenger.slice(0, MAX_ZEILEN)
  const weitere = haenger.length - sichtbar.length

  return (
    <SectionCard
      title="Fälle ohne Bewegung"
      subtitle={`${haenger.length} ${haenger.length === 1 ? 'Fall steht' : 'Fälle stehen'} länger als ${HAENGER_SCHWELLE_TAGE} Tage still — längste Wartezeit zuerst`}
    >
      <ul className="space-y-1.5">
        {sichtbar.map((c) => {
          const ton = tonFuer(c.tage)
          return (
            <li key={c.id}>
              <Link
                href={`/faelle/${c.id}`}
                className="flex items-center gap-3 rounded-ios-md border border-claimondo-border px-3 py-2 transition-colors hover:bg-claimondo-bg/60"
              >
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ton.box} ${ton.text}`}
                >
                  {c.tage >= TAGE_WARNUNG && <AlertTriangleIcon className="h-3 w-3" />}
                  {c.tage} {c.tage === 1 ? 'Tag' : 'Tage'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-claimondo-navy">
                  {c.claimNummer ?? 'Ohne Nummer'}
                </span>
                <span className="shrink-0 text-xs text-claimondo-ondo">
                  {c.operativeStatus ?? 'ohne Status'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {weitere > 0 && (
        <p className="mt-2 text-xs text-claimondo-ondo">
          … und {weitere} weitere.{' '}
          <Link href="/admin/aufgaben/alle" className="underline hover:text-claimondo-navy">
            Alle Aufgaben ansehen
          </Link>
        </p>
      )}
    </SectionCard>
  )
}
