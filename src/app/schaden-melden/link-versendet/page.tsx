import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// AAR-902 Prototyp: Bestaetigungs-Page nach Mini-Wizard-Submit.
// Zeigt maskierte Email + Hinweise. Resend-Button kommt im naechsten Slice
// (rate-limited 1x/Min, max 3x).

export const metadata: Metadata = {
  title: 'Login-Link gesendet',
  robots: { index: false, follow: false },
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 3) return `${local.slice(0, 1)}***@${domain}`
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`
}

export default async function LinkVersendetPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; kanal?: string }>
}) {
  const { email, kanal } = await searchParams
  const maskedEmail = email ? maskEmail(email) : null
  const istWhatsApp = kanal === 'whatsapp'

  return (
    <div className="min-h-screen bg-claimondo-bg py-10">
      <div className="mx-auto max-w-xl px-4">
        <div className="mb-6">
          <PageHeader title="Login-Link unterwegs" size="lg" />
        </div>
        <div className="rounded-ios-lg border border-claimondo-border bg-white p-8 text-center shadow-claimondo-md">
          <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-claimondo-ondo/10 text-claimondo-ondo">
            <Mail className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold text-claimondo-navy">
            {istWhatsApp
              ? 'Wir haben Ihnen einen Login-Link per WhatsApp geschickt'
              : 'Wir haben Ihnen einen Login-Link geschickt'}
          </h2>
          {istWhatsApp ? (
            <p className="mt-2 text-sm text-claimondo-ondo">
              Schauen Sie kurz in Ihren WhatsApp-Chat. Eine Kopie haben wir
              zusätzlich per E-Mail an Ihre Adresse geschickt.
            </p>
          ) : maskedEmail ? (
            <p className="mt-2 text-sm text-claimondo-ondo">
              an <strong className="text-claimondo-navy">{maskedEmail}</strong>
            </p>
          ) : null}
          <p className="mt-4 text-sm text-claimondo-ondo">
            Mit einem Klick auf den Button in der E-Mail kommen Sie direkt zu Ihrem Schadenfall.
            Dort unterschreiben Sie Vollmacht + Sachverständigen-Auftrag — den Rest übernehmen
            wir.
          </p>
          <div className="mt-6 rounded-ios-sm bg-claimondo-bg p-4 text-left text-sm text-claimondo-shield">
            <p className="font-semibold text-claimondo-navy">Keine E-Mail erhalten?</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Prüfen Sie den Spam-Ordner</li>
              <li>Der Link kann bis zu 2 Minuten brauchen</li>
              <li>
                <Link href="/schaden-melden" className="underline">
                  Noch einmal von vorne anfangen
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
