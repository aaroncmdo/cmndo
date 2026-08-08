'use server'

// Kunde-Termin-Funnel T4: Portal-Wunschtermin, wenn dem Claim noch KEIN SV zugewiesen ist.
// Der Kunde wählt eine Wunschzeit im Akte-Kalender → sv_gesucht-Termin (bezug-nativ, kein
// Assignee) landet in der Dispatch-Terminwunsch-Queue → Dispatch weist einen echten SV zu
// (weiseSvGesuchtZu). Auth/Ownership am Rand (createClient-Session), Schreibung via Admin
// (gutachter_termine ist für Kunden nicht RLS-schreibbar).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'
import { resolveWunschterminIso } from '@/app/flow/[token]/wunschtermin'
import { erstelleSvGesuchtTermin } from '@/lib/termine/erstelle-sv-gesucht-termin'
import { revalidatePath } from 'next/cache'

export async function erbitteWunschterminPortal(
  fallId: string,
  wunschterminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!fallId || !wunschterminLokal) {
    return { ok: false, error: 'Fall und Wunschtermin sind erforderlich.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Ownership + Claim-Auflösung (claim_parties-SSoT). NUR der Owner kommt hierher.
  const ownership = await assertKundeOwnsFall(createAdminClient(), user.id, user.email ?? null, fallId)
  if (!ownership.ok || !ownership.claimId) return { ok: false, error: 'Fall nicht gefunden.' }

  // Berlin-Wandzeit → UTC-ISO (resolveWunschterminIso wirft nicht, gibt null zurück).
  const utc = resolveWunschterminIso(wunschterminLokal)
  if (!utc) return { ok: false, error: 'Ungültiger Wunschtermin.' }

  const admin = createAdminClient()
  const res = await erstelleSvGesuchtTermin(admin, { claimId: ownership.claimId, startIso: utc })
  if (!res.ok) return { ok: false, error: res.error ?? 'Wunschtermin konnte nicht gespeichert werden.' }

  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}/kalender`)
  return { ok: true }
}
