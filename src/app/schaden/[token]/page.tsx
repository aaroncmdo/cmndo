// Firmen-Flotte Layer 2 Slice 2a Task 3 — Public Token-Page
// Resolves the NFC karten_token → vehicle/firma context, then renders the
// SchadenGegnerWizard. PUBLIC: the opponent has no account; the token IS the
// authorisation (analogous to /flow/[token] and /upload/[token]).
// No layout.tsx needed — /flow/[token] has none either; the wizard owns its chrome.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveSchadenTokenContext } from '@/lib/schadenkarte/gegner-flow'
import { resolveSchadenkarteToFahrzeug } from '@/lib/schadenkarte/schadenkarte'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { findeErsterfassungClaim } from '@/lib/flotte/schaden-fortsetzung'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import { schadenZweig } from './schaden-zweig'
import { FlottenmanagerKartePanel } from './FlottenmanagerKartePanel'
import { SchadenGegnerWizard } from './SchadenGegnerWizard'
import { SectionCard } from '@/components/shared/SectionCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export const dynamic = 'force-dynamic'

export default async function SchadenTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ melden?: string }>
}) {
  const { token } = await params
  const { melden } = await searchParams
  const db = createAdminClient() as AnyDb

  // ─── Rollen-bewusster Bind/Manage-Einstieg (Flottenmanager der Karten-Firma) ───
  // Fremde/anonyme Besucher (auth=null) fallen durch zum Gegner-Flow (kein Regress).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const fmFirma = user ? await getFlottenmanagerFirma(db, user.id) : null
  const karte = await resolveSchadenkarteToFahrzeug(db, token)
  const zweig = schadenZweig({
    istFlottenmanager: !!fmFirma,
    fmFirmaId: fmFirma?.id ?? null,
    kartenFirmaId: karte?.firmaId ?? null,
    status: karte?.status ?? null,
  })

  // Bind-Panel (ungebunden) bzw. Verwaltung (gebunden). Bei 'manage' + ?melden=1
  // startet der Flottenmanager bewusst den Schaden-Flow -> faellt durch zum Wizard.
  if (fmFirma && (zweig === 'bind' || (zweig === 'manage' && melden !== '1'))) {
    const fahrzeuge = await getKundeFlotte(db, fmFirma.id)
    // T5-3a: gebundenes Fahrzeug mit bestehendem ersterfassung-Claim → „Gutachter finden".
    const fortsetzenClaimId = karte?.fahrzeugId ? await findeErsterfassungClaim(db, karte.fahrzeugId) : null
    return (
      <FlottenmanagerKartePanel
        zweig={zweig}
        token={token}
        firmaName={fmFirma.name}
        fahrzeuge={fahrzeuge}
        gebundenesFahrzeugId={karte?.fahrzeugId ?? null}
        fortsetzenClaimId={fortsetzenClaimId}
      />
    )
  }

  const ctx = await resolveSchadenTokenContext(db, token)

  // ─── Invalid / unbound token — friendly error, NO redirect (Redirect-Stub-Gate) ───
  if (!ctx.ok) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <SectionCard>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-warning-soft flex items-center justify-center text-2xl">
                &#x26A0;&#xFE0F;
              </div>
              <h1 className="text-heading-md text-claimondo-navy">
                Netzwerkkarte nicht gefunden
              </h1>
              <p className="text-body-sm text-claimondo-ondo">
                Diese Netzwerkkarte ist ungültig oder wurde noch keinem Fahrzeug
                zugewiesen. Bitte wenden Sie sich an den Fahrzeughalter.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    )
  }

  // ─── Load insurer list for the Versicherung-Picker in Step 2 ─────────────────
  const { data: versRaw } = await db
    .from('versicherungen')
    .select('id,name')
    .order('name')

  const versicherer = (versRaw ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
  }))

  // ─── Render wizard ────────────────────────────────────────────────────────────
  return (
    <SchadenGegnerWizard
      token={token}
      context={ctx.context}
      versicherer={versicherer}
    />
  )
}
