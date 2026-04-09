import Link from 'next/link'
import { CheckCircle2Icon } from 'lucide-react'

// KFZ-148: Stripe Checkout Redirect-Target nach erfolgreicher Anzahlung.
export default function SoloOnboardingSuccessPage() {
  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2Icon className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Anzahlung eingegangen</h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Vielen Dank! Dein Portal-Zugang ist freigeschaltet — du kannst ab sofort Auftraege erhalten.
          Die Bestaetigung mit deinem unterzeichneten Vertrag wurde dir per Email zugeschickt.
        </p>
        <Link
          href="/gutachter"
          className="inline-block w-full py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors"
        >
          Zum Gutachter-Portal
        </Link>
      </div>
    </div>
  )
}
