// Task #9 — Prospect-Selbstbuchung des Beratungs-/Onboarding-Gespraechs.
// Einstieg via signiertem Cold-Mail-Link {{Beratungslink}}:
//   /beratung/<leadId>?exp=&sig=   (HMAC, 30d TTL — lib/start-link/beratung-sig)
// Verify hier server-seitig; die Buchung verified NOCHMAL in der Action
// (Client koennte die Action sonst direkt aufrufen).

import { verifyBeratungsSig } from '@/lib/start-link/beratung-sig'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeFreieBeratungsSlots } from '@/lib/partner/beratungs-booking'
import { BeratungBuchenClient } from './BeratungBuchenClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Beratungsgespräch buchen | Claimondo',
  robots: { index: false, follow: false },
}

function HinweisCard({ titel, text }: { titel: string; text: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-claimondo-bg p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-heading-md text-claimondo-navy font-bold">{titel}</h1>
        <p className="text-body text-claimondo-ondo">{text}</p>
        <a
          href="https://claimondo.de/beratung-anfragen"
          className="inline-flex items-center justify-center rounded-ios-lg bg-claimondo-navy px-5 py-2.5 font-medium text-white"
        >
          Beratung anfragen
        </a>
      </div>
    </main>
  )
}

export default async function BeratungBuchenPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>
  searchParams: Promise<{ exp?: string; sig?: string }>
}) {
  const { leadId } = await params
  const sp = await searchParams
  const exp = sp?.exp ?? null
  const sig = sp?.sig ?? null

  const v = verifyBeratungsSig(leadId, exp, sig)
  if (!v.ok) {
    return (
      <HinweisCard
        titel="Link abgelaufen"
        text="Dieser Buchungslink ist nicht mehr gültig. Fragen Sie einfach eine neue Beratung an — wir melden uns umgehend."
      />
    )
  }

  const db = createAdminClient()
  const { data: lead } = await db
    .from('partner_leads')
    .select('id, firma, ansprechpartner_vorname')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) {
    return (
      <HinweisCard
        titel="Link ungültig"
        text="Zu diesem Link wurde kein Kontakt gefunden. Fragen Sie einfach eine neue Beratung an."
      />
    )
  }

  const slots = await ladeFreieBeratungsSlots(db)

  return (
    <main className="min-h-dvh bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo">
            Claimondo Partner-Beratung
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Beratungsgespräch buchen
          </h1>
          <p className="mt-3 text-sm text-claimondo-shield">
            30 Minuten per Google Meet — wählen Sie einfach einen Termin, die Einladung kommt
            automatisch per E-Mail.
          </p>
        </div>
        <BeratungBuchenClient
          leadId={leadId}
          exp={exp as string}
          sig={sig as string}
          firma={(lead.firma as string | null) ?? null}
          slots={slots}
        />
      </div>
    </main>
  )
}
