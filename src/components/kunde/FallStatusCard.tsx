'use client'

// AAR-558 (C9) Brutto-Leak-Fix: Keine `regulierung_betrag` / `zahlung_betrag`-
// Felder mehr — Kunde sieht Brutto-Beträge nicht. Die Auszahlungs-Summe kommt
// ausschließlich aus AuszahlungCard (auszahlung_kunde_betrag aus faelle_kunde_view).
import { CalendarIcon, TruckIcon, FileTextIcon, ShieldCheckIcon, MailIcon, ClockIcon, XCircleIcon, PartyPopperIcon, CheckCircle2Icon, AlertCircleIcon, ScaleIcon } from 'lucide-react'
import { formatDatum } from '@/lib/format'

type StatusFall = {
  id: string
  status: string
  /** claims.phase-Wert (via faelle.aktuelle_phase), optional für Feindetails */
  aktuelle_phase?: string | null
  claim_nummer: string | null
  sv_termin: string | null
  anschlussschreiben_am: string | null
  vs_ablehnungsgrund: string | null
  storno_grund: string | null
  abgeschlossen_am: string | null
  google_review_gesendet: boolean | null
  gegner_versicherung: string | null
  kanzlei_ansprechpartner_name: string | null
}

type StatusConfig = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: string
  actionHref?: string
  color: string
  bg: string
  border: string
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export default function FallStatusCard({ fall, svName }: { fall: StatusFall; svName?: string }) {
  const s = fall.status

  const config = getStatusConfig(fall, svName)

  return (
    <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-6 space-y-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-ios-xl flex items-center justify-center shrink-0 ${config.color} bg-white/80`}>
          <config.icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-claimondo-navy">{config.title}</h2>
          <p className="text-sm text-claimondo-ondo mt-1">{config.description}</p>
        </div>
      </div>

      {/* AAR-703: Termin-Countdown entfernt — Termin wird bereits prominent
          via TerminSectionCard (AAR-448) im /kunde/faelle/<id>-Render gezeigt
          (Card mit Status-Badge, Adresse, Quick-Actions zum Verschieben).
          Doppelte Anzeige hat Aaron im Live-Test als verwirrend gemeldet. */}

      {/* AS Frist-Counter */}
      {s === 'anschlussschreiben' && fall.anschlussschreiben_am && (
        <div className="bg-white/60 rounded-ios-xl px-4 py-3">
          <p className="text-xs text-claimondo-ondo">Versendet am {formatDatum(fall.anschlussschreiben_am)}</p>
          <p className="text-sm font-semibold text-claimondo-navy">
            Die Versicherung hat {Math.max(0, 14 - daysSince(fall.anschlussschreiben_am))} Tage Zeit zu antworten
          </p>
        </div>
      )}

      {/* AAR-558 (C9) Brutto-Leak-Fix: Regulierungs-/Zahlungs-Betrag entfernt —
          die Netto-Kunden-Auszahlung wird von AuszahlungCard aus
          auszahlung_kunde_betrag (faelle_kunde_view) angezeigt. */}

      {/* VS-Ablehnung Grund */}
      {(s === 'vs-abgelehnt' || s === 'abgelehnt') && fall.vs_ablehnungsgrund && (
        <div className="bg-white/60 rounded-ios-xl px-4 py-3">
          <p className="text-xs text-claimondo-ondo">Ablehnungsgrund</p>
          <p className="text-sm text-claimondo-navy">{fall.vs_ablehnungsgrund}</p>
        </div>
      )}

      {/* Storno Grund */}
      {s === 'storniert' && fall.storno_grund && (
        <div className="bg-white/60 rounded-ios-xl px-4 py-3">
          <p className="text-xs text-claimondo-ondo">Grund</p>
          <p className="text-sm text-claimondo-navy">{fall.storno_grund}</p>
        </div>
      )}

      {/* Google Review */}
      {(s === 'abgeschlossen' || s === 'reguliert') && !fall.google_review_gesendet && (
        <a
          href="https://g.page/claimondo/review"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white rounded-ios-xl px-4 py-3 text-center hover:shadow-sm transition-shadow border border-amber-200"
        >
          <p className="text-sm font-semibold text-amber-700">Zufrieden? Bewerte uns auf Google!</p>
          <p className="text-xs text-claimondo-ondo mt-0.5">Dein Feedback hilft anderen Geschädigten</p>
        </a>
      )}

      {/* Action hint */}
      {config.action && (
        <p className="text-xs text-claimondo-ondo/70 italic">{config.action}</p>
      )}
    </div>
  )
}

function getStatusConfig(fall: StatusFall, svName?: string): StatusConfig {
  const s = fall.status
  const phase = fall.aktuelle_phase ?? ''
  const sv = svName ?? 'Dein Sachverständiger'

  // ── Welle-7 Endzustände (claims.status via AAR-854 Trigger) ─────────────
  if (s === 'reguliert')
    return { icon: CheckCircle2Icon, title: 'Dein Fall ist reguliert!', description: 'Alles erledigt. Vielen Dank für dein Vertrauen!', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'abgelehnt')
    return { icon: XCircleIcon, title: 'Die Versicherung hat abgelehnt', description: 'Dein Kundenberater meldet sich bei dir um die nächsten Schritte zu besprechen.', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }

  if (s === 'kanzlei')
    return { icon: ScaleIcon, title: 'Deine Akte ist bei der Kanzlei', description: `${fall.kanzlei_ansprechpartner_name ?? 'Die Partnerkanzlei'} übernimmt die rechtliche Vertretung für deinen Fall.`, color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo/[0.06]', border: 'border-claimondo-light-blue' }

  if (s === 'vs_kontakt')
    return { icon: MailIcon, title: 'Wir verhandeln mit der Versicherung', description: `Wir sind in direktem Kontakt mit ${fall.gegner_versicherung ?? 'der Versicherung'} und arbeiten an deiner Regulierung.`, color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo/[0.06]', border: 'border-claimondo-light-blue' }

  // Welle-7 in_bearbeitung: Feindetails via aktuelle_phase
  if (s === 'onboarding' || s === 'in_bearbeitung') {
    if (phase.includes('sv_unterwegs') || phase === 'sv_vor_ort')
      return { icon: TruckIcon, title: 'Sachverständiger ist unterwegs', description: `${sv} ist auf dem Weg zu dir. Du wirst benachrichtigt wenn er gleich da ist.`, color: 'text-claimondo-navy', bg: 'bg-claimondo-navy/[0.06]', border: 'border-claimondo-navy/20' }
    if (phase === 'begutachtung_abgeschlossen' || phase.includes('gutachten'))
      return { icon: FileTextIcon, title: 'Gutachten wird geprüft', description: 'Das Gutachten wurde erstellt und wird jetzt geprüft. Sobald alles in Ordnung ist, geht es weiter.', color: 'text-claimondo-navy', bg: 'bg-claimondo-ondo/[0.06]', border: 'border-claimondo-ondo/30' }
    if (phase === 'termin_bestaetigt')
      return { icon: CalendarIcon, title: 'Dein Termin steht!', description: `${sv} kommt zum vereinbarten Termin. Halte dein Fahrzeug bereit.`, action: 'Termin verschieben? Ruf uns an.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-bg', border: 'border-claimondo-border' }
    return { icon: CalendarIcon, title: 'Dein Termin wird vorbereitet', description: 'Wir suchen den besten Sachverständigen in deiner Nähe. Du wirst benachrichtigt sobald der Termin steht.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-bg', border: 'border-claimondo-border' }
  }

  // ── Welle-6 Werte (Backward-Compatibility für ältere Fälle) ──────────────
  if (s === 'ersterfassung' || s === 'sv-gesucht' || s === 'sv-zugewiesen')
    return { icon: CalendarIcon, title: 'Dein Termin wird vorbereitet', description: 'Wir suchen den besten Sachverständigen in deiner Nähe. Du wirst benachrichtigt sobald der Termin steht.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-bg', border: 'border-claimondo-border' }

  if (s === 'sv-termin')
    return { icon: CalendarIcon, title: 'Dein Termin steht!', description: `${sv} kommt zum vereinbarten Termin. Halte dein Fahrzeug bereit und stelle sicher, dass alle Schäden zugänglich sind.`, action: 'Termin verschieben? Ruf uns an.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-bg', border: 'border-claimondo-border' }

  if (s === 'besichtigung' || s === 'begutachtung-laeuft')
    return { icon: TruckIcon, title: 'Sachverständiger ist unterwegs', description: `${sv} ist auf dem Weg zu dir. Du wirst benachrichtigt wenn er gleich da ist.`, color: 'text-claimondo-navy', bg: 'bg-claimondo-navy/[0.06]', border: 'border-claimondo-navy/20' }

  if (s === 'gutachten-eingegangen' || s === 'filmcheck' || s === 'qc-pruefung')
    return { icon: FileTextIcon, title: 'Gutachten wird geprüft', description: 'Das Gutachten wurde erstellt und wird jetzt von unserem Qualitätsteam geprüft. Sobald alles in Ordnung ist, geht es weiter.', color: 'text-claimondo-navy', bg: 'bg-claimondo-ondo/[0.06]', border: 'border-claimondo-ondo/30' }

  if (s === 'kanzlei-uebergeben')
    return { icon: ShieldCheckIcon, title: 'Deine Akte ist bei der Kanzlei', description: `${fall.kanzlei_ansprechpartner_name ?? 'Die Partnerkanzlei'} prüft deinen Fall und erstellt das Anspruchsschreiben an die Versicherung.`, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' }

  if (s === 'anschlussschreiben')
    return { icon: MailIcon, title: 'Anspruchsschreiben versendet', description: `Das Anspruchsschreiben wurde an ${fall.gegner_versicherung ?? 'die Versicherung'} gesendet. Jetzt läuft die gesetzliche Frist.`, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' }

  if (s === 'regulierung-laeuft' || s === 'regulierung')
    return { icon: PartyPopperIcon, title: 'Regulierung angekündigt', description: 'Die Versicherung hat die Regulierung angekündigt. Deine Auszahlung wird in den nächsten Tagen erwartet.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'vs-abgelehnt')
    return { icon: XCircleIcon, title: 'Die Versicherung hat abgelehnt', description: 'Dein Kundenberater meldet sich bei dir um die nächsten Schritte zu besprechen. Eventuell wird eine Klage eingereicht.', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }

  if (s === 'zahlung-eingegangen')
    return { icon: PartyPopperIcon, title: 'Zahlung eingegangen!', description: 'Die Versicherung hat gezahlt! Die Schlussabrechnung wird erstellt.', action: 'Prüfe deine Bankdaten im Bereich unten.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'abgeschlossen')
    return { icon: CheckCircle2Icon, title: 'Dein Fall ist abgeschlossen!', description: 'Alles erledigt. Vielen Dank für dein Vertrauen!', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'storniert')
    return { icon: AlertCircleIcon, title: 'Dein Fall wurde storniert', description: 'Bei Rückfragen erreichst du uns jederzeit per WhatsApp oder Telefon.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-bg', border: 'border-claimondo-border' }

  return { icon: ClockIcon, title: 'Dein Fall wird bearbeitet', description: 'Wir kümmern uns um alles. Du wirst über jeden Schritt informiert.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-bg', border: 'border-claimondo-border' }
}
