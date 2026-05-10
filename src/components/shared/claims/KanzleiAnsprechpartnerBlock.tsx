// AAR-842: Kanzlei-Ansprechpartner-Block
//
// Zwei Variants laut Master-Doc 9.3:
//   normal     — neutrale Card neben dem KB-Block (Sidebar)
//   prominent  — orangene Border + Hinweis-Banner bei phase=9_abgelehnt
//
// Component ist "dumm": Parent entscheidet ob sie gerendert wird und mit
// welcher Variant. Keine Datenfetches in der Component selbst — alle Daten
// kommen über Props.
//
// QR-Code wird server-seitig generiert (qr-code.ts) und als inline SVG
// reingereicht (kein Client-Roundtrip, kein Caching-Problem).

import { ScaleIcon, MessageSquareIcon, CalendarPlusIcon, AlertTriangleIcon } from 'lucide-react'

type KanzleiBlockProps = {
  /** Anzeige-Name der Kanzlei (z.B. "LexDrive" oder "Müller & Partner") */
  kanzleiName: string
  /** Kontaktperson — z.B. "Dr. Schmidt" */
  kontaktperson?: string | null
  telefon?: string | null
  email?: string | null
  /** WhatsApp-URL für QR-Code (Partnerkanzlei). Falls leer: kein QR-Block. */
  whatsappUrl?: string | null
  /** Termin-URL für QR-Code (Partnerkanzlei) */
  terminUrl?: string | null
  /** Inline-SVG-Strings, server-seitig via generateQrCodeSvg generiert */
  whatsappQrSvg?: string | null
  terminQrSvg?: string | null
  /** Render-Variant — Parent entscheidet basierend auf claim.phase */
  variant?: 'normal' | 'prominent'
}

export function KanzleiAnsprechpartnerBlock({
  kanzleiName,
  kontaktperson,
  telefon,
  email,
  whatsappUrl,
  terminUrl,
  whatsappQrSvg,
  terminQrSvg,
  variant = 'normal',
}: KanzleiBlockProps) {
  const isProminent = variant === 'prominent'

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${
        isProminent ? 'border-amber-400 border-2' : 'border-claimondo-border'
      }`}
    >
      {isProminent && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            Die Versicherung hat abgelehnt — sprich mit deiner Kanzlei. Sie übernimmt jetzt die rechtliche Vertretung.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <ScaleIcon className="w-5 h-5 text-claimondo-ondo" />
        <h2 className="text-sm font-semibold text-claimondo-navy">Dein Ansprechpartner Kanzlei</h2>
      </div>

      <div className="space-y-3">
        {/* Identity */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-claimondo-navy/10 flex items-center justify-center shrink-0">
            <ScaleIcon className="w-6 h-6 text-claimondo-navy" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-claimondo-ondo">{kontaktperson ?? 'Kanzlei'}</p>
            <p className="font-semibold text-claimondo-navy truncate">{kanzleiName}</p>
          </div>
        </div>

        {/* QR-Codes nur bei Partnerkanzlei (URLs gesetzt + SVGs gerendert) */}
        {(whatsappQrSvg || terminQrSvg) && (
          <div className="flex gap-3 justify-around bg-claimondo-bg rounded-lg p-3">
            {whatsappQrSvg && whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <div
                  className="w-20 h-20"
                  dangerouslySetInnerHTML={{ __html: whatsappQrSvg }}
                />
                <span className="text-[10px] text-claimondo-ondo font-medium">WhatsApp</span>
              </a>
            )}
            {terminQrSvg && terminUrl && (
              <a
                href={terminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <div
                  className="w-20 h-20"
                  dangerouslySetInnerHTML={{ __html: terminQrSvg }}
                />
                <span className="text-[10px] text-claimondo-ondo font-medium">Termin</span>
              </a>
            )}
          </div>
        )}

        {/* Action-Buttons */}
        <div className="flex flex-col gap-2">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-[#3a6290] transition-colors"
            >
              <MessageSquareIcon className="w-4 h-4" />
              WhatsApp öffnen
            </a>
          )}
          {terminUrl && (
            <a
              href={terminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-claimondo-ondo text-claimondo-ondo text-xs font-medium hover:bg-claimondo-ondo/5 transition-colors"
            >
              <CalendarPlusIcon className="w-4 h-4" />
              Termin buchen
            </a>
          )}
        </div>

        {/* Phone + Email Direct-Links */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[#E2E8F3]">
          {telefon && (
            <a
              href={`tel:${telefon}`}
              className="inline-flex items-center min-h-[36px] text-xs text-claimondo-ondo hover:underline"
            >
              📞 {telefon}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center min-h-[36px] text-xs text-claimondo-ondo hover:underline truncate"
            >
              ✉️ {email}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
