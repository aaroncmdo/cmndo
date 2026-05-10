// AAR-491 (M9): Edge-Case wenn der Makler noch keinen aktiven Promo-Code
// hat (sollte durch das Onboarding nicht vorkommen, aber Absicherung).

import { AlertCircleIcon, QrCodeIcon } from 'lucide-react'

export function MaklerPromoEmpty({ firma }: { firma: string }) {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="bg-white rounded-ios-md border border-[#e4e7ef] p-8 text-center space-y-4">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-ios-md bg-orange-50 text-orange-600 border border-orange-200">
          <QrCodeIcon width={24} height={24} />
        </span>
        <h1 className="text-lg font-bold text-claimondo-navy">
          Noch kein Promo-Code aktiv
        </h1>
        <p className="text-sm text-claimondo-ondo max-w-md mx-auto">
          Für <strong>{firma}</strong> ist noch kein Partner-Code hinterlegt.
          Bitte wenden Sie sich an Ihren Claimondo-Kundenbetreuer, damit ein
          Code erzeugt wird.
        </p>
        <div className="inline-flex items-start gap-2 text-xs text-claimondo-shield bg-[#f8f9fb] border border-[#e4e7ef] rounded-lg px-3 py-2 text-left">
          <AlertCircleIcon
            width={14}
            height={14}
            className="mt-0.5 shrink-0 text-claimondo-ondo"
          />
          <span>
            Neue Makler erhalten ihren Code automatisch nach Freigabe des
            Onboardings. Sollten Sie bereits freigegeben sein, kontaktieren Sie
            uns per Email.
          </span>
        </div>
      </div>
    </div>
  )
}
