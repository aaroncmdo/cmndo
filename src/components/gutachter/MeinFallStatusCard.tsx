// CMM-23: Schlanke Status-Card für die SV-Fall-View nach Gutachten-
// Freigabe. Eine Card pro Fall-Phase, rendert exakt das was der SV in
// dieser Phase wissen muss — Aaron-Spec: "jede Karte in jedem
// Prozessschritt = eine Funktion".
//
//   gutachten-freigegeben → "Wir haben dein Gutachten freigegeben"
//   bei-kanzlei           → "Dein Gutachten liegt bei der Kanzlei" + LexDrive-Link
//   stellungnahme         → wird von der bestehenden StellungnahmeCard übernommen
//   nachbesichtigung      → wird von der bestehenden NachbesichtigungCard übernommen
//   auszahlung            → "Honorar X € am Y eingegangen"
//   abgeschlossen-fall    → "Fall abgeschlossen"

import Link from 'next/link'
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  EuroIcon,
  ScrollIcon,
} from 'lucide-react'
import type { FallPhase } from '@/lib/auftrag/phase'
import { getLexdriveDeepLink, getLexdriveLoginUrl } from '@/lib/kanzlei/lexdrive-link'

type Props = {
  phase: FallPhase
  /** Geforderte Gesamtsumme — Kunden-Anspruch gegen die VS (faelle.gutachten_betrag).
   *  Treibt den Kanzleifall-Lifecycle, ist aber NICHT das SV-Grundhonorar. */
  geforderteGesamtsumme: number | null
  /** Vom SV gefordertes Grundhonorar (auftraege.grundhonorar_netto/brutto).
   *  Bewusst „gefordert" weil VS noch nicht ausgezahlt hat. */
  geforderterGrundhonorarBetrag: number | null
  gutachtenUrl: string | null
  gutachtenFreigegebenAm: string | null
  lexdriveCaseId: string | null
  svHonorarBetrag: number | null
  svHonorarEingegangenAm: string | null
}

function fmtEuro(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function fmtDatum(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function MeinFallStatusCard(props: Props) {
  // gutachten-freigegeben + bei-kanzlei + auszahlung + abgeschlossen rendern
  // wir hier; stellungnahme + nachbesichtigung sind separate Cards.
  if (props.phase === 'stellungnahme' || props.phase === 'nachbesichtigung') {
    return null
  }

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
          <CheckCircle2Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-claimondo-navy">
            {props.phase === 'gutachten-freigegeben' && 'Gutachten freigegeben'}
            {props.phase === 'bei-kanzlei' && 'Bei der Kanzlei'}
            {props.phase === 'auszahlung' && 'Honorar ausgezahlt'}
            {props.phase === 'abgeschlossen-fall' && 'Fall abgeschlossen'}
          </p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            {props.phase === 'gutachten-freigegeben' &&
              `Wir haben dein Gutachten am ${fmtDatum(props.gutachtenFreigegebenAm)} freigegeben.`}
            {props.phase === 'bei-kanzlei' &&
              'Das Gutachten liegt jetzt bei der Partnerkanzlei. Du findest den Vorgang im LexDrive-Portal.'}
            {props.phase === 'auszahlung' &&
              `Dein Honorar wurde am ${fmtDatum(props.svHonorarEingegangenAm)} überwiesen.`}
            {props.phase === 'abgeschlossen-fall' &&
              'Der Fall ist vollständig reguliert.'}
          </p>
        </div>
      </div>

      {/* Forderungen: Gesamtsumme (gegen VS) + SV-Grundhonorar + Link aufs PDF.
          Beide Betraege sind „gefordert" — VS hat noch nicht ausgezahlt. Das
          treibt den Kanzleifall-Lifecycle. */}
      {(props.geforderteGesamtsumme != null ||
        props.geforderterGrundhonorarBetrag != null ||
        props.gutachtenUrl) && (
        <div className="rounded-xl bg-[#f8f9fb] border border-claimondo-border p-3 space-y-2">
          {props.geforderteGesamtsumme != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-claimondo-ondo flex items-center gap-1.5">
                <EuroIcon className="w-3.5 h-3.5" /> Geforderte Gesamtsumme
              </span>
              <span className="text-sm font-semibold text-claimondo-navy">
                {fmtEuro(props.geforderteGesamtsumme)}
              </span>
            </div>
          )}
          {props.geforderterGrundhonorarBetrag != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-claimondo-ondo flex items-center gap-1.5">
                <EuroIcon className="w-3.5 h-3.5" /> Gefordertes Grundhonorar
              </span>
              <span className="text-sm font-semibold text-claimondo-navy">
                {fmtEuro(props.geforderterGrundhonorarBetrag)}
              </span>
            </div>
          )}
          {props.gutachtenUrl && (
            <Link
              href={props.gutachtenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-claimondo-navy hover:text-claimondo-shield"
            >
              <ScrollIcon className="w-3.5 h-3.5" /> Gutachten ansehen
              <ExternalLinkIcon className="w-3 h-3" />
            </Link>
          )}
        </div>
      )}

      {/* LexDrive-Deep-Link bei bei-kanzlei */}
      {props.phase === 'bei-kanzlei' && (() => {
        const deepLink = getLexdriveDeepLink(props.lexdriveCaseId)
        if (deepLink) {
          return (
            <Link
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full min-h-12 rounded-xl bg-claimondo-navy hover:bg-claimondo-shield text-white text-sm font-semibold transition-colors"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              Vorgang im LexDrive-Portal öffnen
            </Link>
          )
        }
        return (
          <div className="space-y-2">
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Aktenzeichen folgt sobald die Kanzlei das Mandat angenommen hat.
              Du erhältst dann hier den Direkt-Link zum Vorgang.
            </p>
            <Link
              href={getLexdriveLoginUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy underline decoration-dotted underline-offset-2"
            >
              Manuell ins Kanzlei-Portal einloggen
              <ExternalLinkIcon className="w-3 h-3" />
            </Link>
          </div>
        )
      })()}

      {/* Auszahlungs-Detail */}
      {props.phase === 'auszahlung' && props.svHonorarBetrag != null && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
          <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
            <EuroIcon className="w-3.5 h-3.5" /> Honorar
          </span>
          <span className="text-sm font-bold text-emerald-900">
            {fmtEuro(props.svHonorarBetrag)}
          </span>
        </div>
      )}
    </div>
  )
}
