// AAR-78: LexDrive-Videocall-Link fuer juristische Fragen.
// SLA-Meeting Regel: Juristische Fragen gehen primaer an LexDrive (Videocall, KEIN Telefon).
import { ScaleIcon, VideoIcon } from 'lucide-react'

const LEXDRIVE_VIDEOCALL_URL = process.env.NEXT_PUBLIC_LEXDRIVE_VIDEOCALL_URL ?? 'https://lexdrive.de/termin'

type Variant = 'banner' | 'card'

export default function LexDriveLink({ variant = 'banner' }: { variant?: Variant }) {
  if (variant === 'banner') {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
            <ScaleIcon className="w-5 h-5 text-violet-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-violet-900">Juristische Fragen?</p>
            <p className="text-xs text-violet-700 mt-0.5">
              Rechtliche Beratung uebernimmt unser Partner LexDrive. Buchen Sie einen Videocall — KEINE Telefontermine.
            </p>
            <a
              href={LEXDRIVE_VIDEOCALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-900"
            >
              <VideoIcon className="w-3.5 h-3.5" />
              Videocall buchen
              <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </div>
    )
  }

  // card variant fuer Dashboard
  return (
    <a
      href={LEXDRIVE_VIDEOCALL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-xl border border-violet-200 shadow-sm p-4 hover:shadow-md transition-shadow active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          <ScaleIcon className="w-5 h-5 text-violet-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#0D1B3E] font-semibold text-sm">Anwaltlicher Videocall</p>
          <p className="text-xs text-gray-500 mt-0.5">Juristische Fragen mit LexDrive klaeren</p>
        </div>
        <span className="text-violet-700 text-sm">→</span>
      </div>
    </a>
  )
}
