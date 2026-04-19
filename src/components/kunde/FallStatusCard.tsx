'use client'

// AAR-558 (C9) Brutto-Leak-Fix: Keine `regulierung_betrag` / `zahlung_betrag`-
// Felder mehr — Kunde sieht Brutto-Beträge nicht. Die Auszahlungs-Summe kommt
// ausschließlich aus AuszahlungCard (auszahlung_kunde_betrag aus faelle_kunde_view).
import { CalendarIcon, TruckIcon, FileTextIcon, ShieldCheckIcon, MailIcon, ClockIcon, XCircleIcon, PartyPopperIcon, CheckCircle2Icon, AlertCircleIcon } from 'lucide-react'
import { formatDatum, formatDatumUhrzeit } from '@/lib/format'

type StatusFall = {
  id: string
  status: string
  fall_nummer: string | null
  sv_termin: string | null
  anschlussschreiben_am: string | null
  vs_ablehnungsgrund: string | null
  storno_grund: string | null
  abgeschlossen_am: string | null
  google_review_gesendet: boolean | null
  // AAR-545 Cluster D: Gegner-VS aus faelle.gegner_versicherung (Freitext).
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

function daysUntil(d: string): number {
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000))
}

export default function FallStatusCard({ fall, svName }: { fall: StatusFall; svName?: string }) {
  const s = fall.status

  const config = getStatusConfig(fall, svName)

  return (
    <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-6 space-y-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.color} bg-white/80`}>
          <config.icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900">{config.title}</h2>
          <p className="text-sm text-gray-600 mt-1">{config.description}</p>
        </div>
      </div>

      {/* Termin-Countdown */}
      {(s === 'ersterfassung' || s === 'sv-termin' || s === 'sv-zugewiesen') && fall.sv_termin && (
        <div className="bg-white/60 rounded-xl px-4 py-3 flex items-center gap-3">
          <CalendarIcon className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {formatDatumUhrzeit(fall.sv_termin)}
            </p>
            <p className="text-xs text-gray-500">in {daysUntil(fall.sv_termin)} Tagen</p>
          </div>
        </div>
      )}

      {/* AS Frist-Counter */}
      {s === 'anschlussschreiben' && fall.anschlussschreiben_am && (
        <div className="bg-white/60 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Versendet am {formatDatum(fall.anschlussschreiben_am)}</p>
          <p className="text-sm font-semibold text-gray-900">
            Die Versicherung hat {Math.max(0, 14 - daysSince(fall.anschlussschreiben_am))} Tage Zeit zu antworten
          </p>
        </div>
      )}

      {/* AAR-558 (C9) Brutto-Leak-Fix: Regulierungs-/Zahlungs-Betrag entfernt —
          die Netto-Kunden-Auszahlung wird von AuszahlungCard aus
          auszahlung_kunde_betrag (faelle_kunde_view) angezeigt. */}

      {/* VS-Ablehnung Grund */}
      {s === 'vs-abgelehnt' && fall.vs_ablehnungsgrund && (
        <div className="bg-white/60 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Ablehnungsgrund</p>
          <p className="text-sm text-gray-700">{fall.vs_ablehnungsgrund}</p>
        </div>
      )}

      {/* Storno Grund */}
      {s === 'storniert' && fall.storno_grund && (
        <div className="bg-white/60 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Grund</p>
          <p className="text-sm text-gray-700">{fall.storno_grund}</p>
        </div>
      )}

      {/* Google Review */}
      {s === 'abgeschlossen' && !fall.google_review_gesendet && (
        <a
          href="https://g.page/claimondo/review"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white rounded-xl px-4 py-3 text-center hover:shadow-sm transition-shadow border border-amber-200"
        >
          <p className="text-sm font-semibold text-amber-700">Zufrieden? Bewerte uns auf Google!</p>
          <p className="text-xs text-gray-500 mt-0.5">Dein Feedback hilft anderen Geschädigten</p>
        </a>
      )}

      {/* Action hint */}
      {config.action && (
        <p className="text-xs text-gray-400 italic">{config.action}</p>
      )}
    </div>
  )
}

function getStatusConfig(fall: StatusFall, svName?: string): StatusConfig {
  const s = fall.status
  const sv = svName ?? 'Dein Sachverständiger'

  if (s === 'ersterfassung' || s === 'sv-gesucht' || s === 'sv-zugewiesen')
    return { icon: CalendarIcon, title: 'Dein Termin wird vorbereitet', description: 'Wir suchen den besten Sachverständigen in deiner Nähe. Du wirst benachrichtigt sobald der Termin steht.', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }

  if (s === 'sv-termin')
    return { icon: CalendarIcon, title: 'Dein Termin steht!', description: `${sv} kommt zum vereinbarten Termin. Halte dein Fahrzeug bereit und stelle sicher, dass alle Schäden zugänglich sind.`, action: 'Termin verschieben? Ruf uns an.', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }

  if (s === 'besichtigung' || s === 'begutachtung-laeuft')
    return { icon: TruckIcon, title: 'Sachverständiger ist unterwegs', description: `${sv} ist auf dem Weg zu dir. Du wirst benachrichtigt wenn er gleich da ist.`, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' }

  if (s === 'gutachten-eingegangen' || s === 'filmcheck' || s === 'qc-pruefung')
    return { icon: FileTextIcon, title: 'Gutachten wird geprüft', description: 'Das Gutachten wurde erstellt und wird jetzt von unserem Qualitätsteam geprüft. Sobald alles in Ordnung ist, geht es weiter.', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' }

  if (s === 'kanzlei-uebergeben')
    return { icon: ShieldCheckIcon, title: 'Deine Akte ist bei der Kanzlei', description: `${fall.kanzlei_ansprechpartner_name ?? 'Die Partnerkanzlei'} prüft deinen Fall und erstellt das Anspruchsschreiben an die Versicherung.`, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' }

  if (s === 'anschlussschreiben')
    return { icon: MailIcon, title: 'Anspruchsschreiben versendet', description: `Das Anspruchsschreiben wurde an ${fall.gegner_versicherung ?? 'die Versicherung'} gesendet. Jetzt läuft die gesetzliche Frist.`, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' }

  if (s === 'regulierung-laeuft' || s === 'regulierung')
    return { icon: PartyPopperIcon, title: 'Regulierung angekündigt', description: 'Die Versicherung hat die Regulierung angekündigt. Ihre Auszahlung wird in den nächsten Tagen erwartet.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'vs-abgelehnt')
    return { icon: XCircleIcon, title: 'Die Versicherung hat abgelehnt', description: 'Dein Kundenberater meldet sich bei dir um die nächsten Schritte zu besprechen. Eventuell wird eine Klage eingereicht.', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }

  if (s === 'zahlung-eingegangen')
    return { icon: PartyPopperIcon, title: 'Zahlung eingegangen!', description: 'Die Versicherung hat gezahlt! Die Schlussabrechnung wird erstellt. Den ausgezahlten Netto-Anteil sehen Sie in der Auszahlungs-Card.', action: 'Prüfe deine Bankdaten im Bereich unten.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'abgeschlossen')
    return { icon: CheckCircle2Icon, title: 'Dein Fall ist abgeschlossen!', description: 'Alles erledigt. Vielen Dank für dein Vertrauen!', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }

  if (s === 'storniert')
    return { icon: AlertCircleIcon, title: 'Dein Fall wurde storniert', description: 'Bei Rückfragen erreichst du uns jederzeit per WhatsApp oder Telefon.', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' }

  return { icon: ClockIcon, title: 'Dein Fall wird bearbeitet', description: 'Wir kümmern uns um alles. Du wirst über jeden Schritt informiert.', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }
}
