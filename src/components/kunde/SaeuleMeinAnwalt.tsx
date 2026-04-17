'use client'

import { ScaleIcon, CheckCircleIcon, PhoneIcon, MailIcon, MessageSquareIcon } from 'lucide-react'

type Props = {
  mandatstyp: string | null
  serviceTyp: string | null
  vollmacht_status: boolean
  kanzlei_name: string | null
}

// AAR-367: "Chat öffnen" für die Kanzlei — neben Betreuer-Chat als zweite
// Kontakt-Option. Nutzt WhatsApp direkt (wa.me), weil LexDrive die primäre
// Kanzlei-Kommunikation eh per WhatsApp führt (Vollmacht-Unterschrift,
// Status-Updates). Interne Chat-Anbindung wäre Folge-Scope.
const LEXDRIVE_WHATSAPP = '4932221096850'
const LEXDRIVE_WHATSAPP_INTRO = 'Hallo, ich habe eine Frage zu meinem Fall.'

export default function SaeuleMeinAnwalt({ mandatstyp, serviceTyp, vollmacht_status, kanzlei_name }: Props) {
  // Nicht anzeigen bei nur-Gutachter oder wenn kein Kanzlei-Mandatstyp
  if (serviceTyp === 'nur_gutachter') return null
  if (mandatstyp !== 'kanzlei-claimondo') return null

  const waHref = `https://wa.me/${LEXDRIVE_WHATSAPP}?text=${encodeURIComponent(LEXDRIVE_WHATSAPP_INTRO)}`

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ScaleIcon className="w-5 h-5 text-[#4573A2]" />
        <h2 className="text-sm font-semibold text-[#0D1B3E]">Meine Kanzlei</h2>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500">Ihr juristischer Ansprechpartner</p>
          <p className="font-semibold text-gray-900">{kanzlei_name ?? 'LexDrive'}</p>
          <p className="text-xs text-gray-500 mt-0.5">Fachanwalt für Verkehrsrecht</p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {vollmacht_status ? (
            <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircleIcon className="w-3.5 h-3.5" /> Vollmacht erteilt
            </span>
          ) : (
            <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              Vollmacht ausstehend
            </span>
          )}
        </div>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#3a6290] transition-colors"
        >
          <MessageSquareIcon className="w-4 h-4" />
          Chat öffnen
        </a>

        <div className="flex gap-3 pt-0.5">
          {/* TODO AAR-412: PhoneButton-Migration — Kunden-facing, low priority */}
          <a href={`tel:+${LEXDRIVE_WHATSAPP}`} className="flex items-center gap-1.5 text-xs text-[#4573A2] hover:underline">
            <PhoneIcon className="w-3.5 h-3.5" /> Anrufen
          </a>
          <a href="mailto:kanzlei@claimondo.de" className="flex items-center gap-1.5 text-xs text-[#4573A2] hover:underline">
            <MailIcon className="w-3.5 h-3.5" /> E-Mail
          </a>
        </div>
      </div>
    </div>
  )
}
