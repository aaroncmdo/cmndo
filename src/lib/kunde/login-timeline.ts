// Dispatcher/KB sehen am Lead, dass der Kunde sich selbst angemeldet hat
// (Soll-Blatt 2026-09-19-kunde-kommt-ohne-link-ins-konto, 1c Schritt 7).
// kanal='gruppenchat' wie system-messages.ts: 'system' waere CHECK-erlaubt, aber kein Reader
// kennt den Wert (gemessen 19.09.: is_system-Zeilen tragen email/gruppenchat/whatsapp).
// Best-effort: ein Fehler hier bricht den Login nie.
import { createAdminClient } from '@/lib/supabase/admin'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'

type LoginUser = { id: string; email?: string | null; phone?: string | null }

export async function schreibeLoginTimeline(user: LoginUser, weg: 'telefon' | 'email'): Promise<void> {
  try {
    if (!user.email && !user.phone) return
    const admin = createAdminClient()
    const { leadIds } = await findeVorgaengeZuKontakt(admin, { email: user.email ?? null, telefon: user.phone ?? null })
    const text =
      weg === 'telefon'
        ? 'Kunde hat sich per Telefonnummer angemeldet (Login ohne Link).'
        : 'Kunde hat sich per E-Mail-Link angemeldet (Login ohne Link).'
    for (const leadId of leadIds.slice(0, 3)) {
      const { error } = await admin.from('nachrichten').insert({
        lead_id: leadId,
        kanal: 'gruppenchat',
        sender_id: null,
        sender_rolle: 'system',
        nachricht: text,
        hat_anhang: false,
        is_system: true,
        system_event: 'kunde_selbst_angemeldet',
      })
      if (error) console.warn('[login-timeline]', error.message)
    }
  } catch (err) {
    console.warn('[login-timeline]', err)
  }
}
