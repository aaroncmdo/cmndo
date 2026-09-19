'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'

// Login ohne Link (Soll-Blatt 2026-09-19-kunde-kommt-ohne-link-ins-konto, 1c Weg 2 Schritt 5):
// "Jetzt fortsetzen" auf der Karte einer offenen Schadenmeldung -> frischer FlowLink.
// Muster: kunde/faelle/[id]/unterschrift/route.ts (ensureCanonicalFlowLinkForLead + redirect).
//
// Bewusst KEIN Result-Object: endet immer in redirect() (wie bestaetigeMagicLink).
// Ownership-Guard: der Lead muss zum Kontakt des eingeloggten Users gehoeren —
// eine fremde leadId im Formular landet auf /kunde, nie im fremden Flow.
export async function fortsetzeSchadenmeldung(formData: FormData): Promise<void> {
  const leadId = (formData.get('leadId') as string | null)?.trim() || null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!leadId) redirect('/kunde')

  const admin = createAdminClient()
  const { leadIds } = await findeVorgaengeZuKontakt(admin, { email: user.email ?? null, telefon: user.phone ?? null })
  if (!leadIds.includes(leadId)) redirect('/kunde')

  const link = await ensureCanonicalFlowLinkForLead(leadId, { admin })
  if (!link.ok) redirect('/kunde')
  redirect(`/flow/${link.token}`)
}
