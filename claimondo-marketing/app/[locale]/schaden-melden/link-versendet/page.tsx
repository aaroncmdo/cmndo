import type { Metadata } from 'next'
import { ShieldCheck, ArrowRight, Mail } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { SheetCard } from '@/components/shared/SheetCard'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { RueckrufBuchenCard } from './RueckrufBuchenCard'

// AAR-902 / 2026-06-26: Bestaetigungsseite nach Mini-Wizard-Submit. Statt nur
// "Login-Link gesendet" zeigt sie jetzt: den zugewiesenen Ansprechpartner (Trust),
// den direkten Self-Service-Link und eine Rueckruftermin-Buchung.

export const metadata: Metadata = {
  title: 'Schadensmeldung eingegangen',
  robots: { index: false, follow: false },
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 3) return `${local.slice(0, 1)}***@${domain}`
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`
}

// Server-seitig: zugewiesener Ansprechpartner + FlowLink (Token NUR im Button-href,
// nicht in der Seiten-URL). UUID-gekeyt -> kein Enumerieren.
async function ladeKontext(leadId: string): Promise<{
  person: { vorname: string | null; avatarUrl: string | null } | null
  flowUrl: string | null
}> {
  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('zugewiesen_an')
    .eq('id', leadId)
    .maybeSingle()

  let person: { vorname: string | null; avatarUrl: string | null } | null = null
  const zid = (lead?.zugewiesen_an as string | null) ?? null
  if (zid) {
    const { data: p } = await admin
      .from('profiles')
      .select('vorname, avatar_url')
      .eq('id', zid)
      .maybeSingle()
    if (p) {
      person = {
        vorname: (p.vorname as string | null) ?? null,
        avatarUrl: (p.avatar_url as string | null) ?? null,
      }
    }
  }

  const { data: fl } = await admin
    .from('flow_links')
    .select('token, expires_at')
    .eq('lead_id', leadId)
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  let flowUrl: string | null = null
  if (
    fl?.token &&
    (!fl.expires_at || new Date(fl.expires_at as string).getTime() > Date.now())
  ) {
    flowUrl = `${APP_URL}/flow/${fl.token as string}`
  }

  return { person, flowUrl }
}

export default async function LinkVersendetPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; email?: string; kanal?: string }>
}) {
  const { lead, email, kanal } = await searchParams
  const maskedEmail = email ? maskEmail(email) : null
  const istWhatsApp = kanal === 'whatsapp'
  const { person, flowUrl } = lead
    ? await ladeKontext(lead)
    : { person: null, flowUrl: null }

  const ansprechpartnerName = person?.vorname?.trim() || 'Unser Team'

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden py-12 text-center sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 20% 15%, rgba(123,163,204,0.22), transparent 50%)',
              'radial-gradient(circle at 85% 35%, rgba(69,115,162,0.14), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Schadensmeldung eingegangen
          </div>
          <h1
            className="text-balance text-[2rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Geschafft. Wir kümmern uns.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-base text-claimondo-ondo">
            Ihre Angaben sind bei uns. So geht es weiter:
          </p>
        </div>
      </section>

      {/* Drei Blöcke */}
      <section className="pb-16">
        <div className="mx-auto max-w-2xl space-y-5 px-4 sm:px-6">
          {/* 1 – Ansprechpartner */}
          <SheetCard size="full" padding="md" animateIn={false}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-claimondo-ondo">
              Ihr persönlicher Ansprechpartner
            </p>
            <div className="mt-4 flex items-center gap-4">
              {person?.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={person.avatarUrl}
                  alt={ansprechpartnerName}
                  className="h-16 w-16 shrink-0 rounded-full border-2 border-white object-cover shadow-claimondo-md"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-2xl font-bold text-white">
                  {ansprechpartnerName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-lg font-bold text-claimondo-navy">{ansprechpartnerName}</p>
                <p className="text-sm text-claimondo-ondo">
                  kümmert sich um Ihren Fall und meldet sich persönlich bei Ihnen.
                </p>
              </div>
            </div>
          </SheetCard>

          {/* 2 – Self-Service */}
          <SheetCard size="full" padding="md" animateIn={false}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-claimondo-ondo">
              Schaden direkt selbst bearbeiten
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm text-claimondo-shield">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
              <span>
                {istWhatsApp
                  ? 'Wir haben Ihnen Ihren sicheren Link per WhatsApp geschickt'
                  : 'Wir haben Ihnen Ihren sicheren Link geschickt'}
                {maskedEmail ? (
                  <>
                    {' '}
                    an <strong className="text-claimondo-navy">{maskedEmail}</strong>
                  </>
                ) : null}
                . Dort unterschreiben Sie Vollmacht + Gutachter-Auftrag, den Rest übernehmen wir.
              </span>
            </p>
            {flowUrl ? (
              <a
                href={flowUrl}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-claimondo-shield"
              >
                Jetzt fortfahren
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
          </SheetCard>

          {/* 3 – Rückruf */}
          <RueckrufBuchenCard leadId={lead ?? null} />
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
