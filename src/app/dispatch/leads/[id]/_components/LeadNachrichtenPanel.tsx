// Zeigt die Nachrichten, die an diesem Lead haengen (`nachrichten.lead_id`).
//
// WARUM: Bis 23.08.2026 hatte `nachrichten.lead_id` KEINEN Leser. Eine
// WhatsApp von einem Interessenten ohne Fall war damit nirgends sichtbar —
// die Posteingaenge filtern `thread_id IS NOT NULL`, und ein Thread setzt einen
// Claim voraus (`chat_threads.claim_id` ist NOT NULL). Ein Lead hat keinen.
// Ergebnis: 200 von 200 inbound-WhatsApp-Nachrichten lagen unsichtbar in der DB,
// darunter echte Kundenanfragen. Diese Komponente ist der erste Leser.
//
// Spec: docs/superpowers/specs/2026-08-23-whatsapp-erstkontakt-lead-design.md §4.3

import { createAdminClient } from '@/lib/supabase/admin'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'

type LeadNachricht = {
  id: string
  kanal: string | null
  richtung: string | null
  nachricht: string | null
  hat_anhang: boolean | null
  empfaenger_kontakt: string | null
  created_at: string
}

const KANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-Mail',
  sms: 'SMS',
  anruf: 'Anruf',
}

function formatiereZeit(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function LeadNachrichtenPanel({ leadId }: { leadId: string }) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('nachrichten')
    .select('id, kanal, richtung, nachricht, hat_anhang, empfaenger_kontakt, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    // Sichtbar scheitern statt still leer bleiben — eine leere Liste sieht sonst
    // aus wie „keine Nachrichten", und genau diese Verwechslung ist der Grund,
    // warum die Anfragen ein Vierteljahr lang niemandem auffielen.
    return (
      <SectionCard title="Nachrichten">
        <p className="text-body-sm text-danger-strong">
          Nachrichten konnten nicht geladen werden: {error.message}
        </p>
      </SectionCard>
    )
  }

  const nachrichten = (data ?? []) as LeadNachricht[]

  return (
    <SectionCard
      title="Nachrichten"
      subtitle="Eingehende und ausgehende Nachrichten zu diesem Interessenten"
      hint={nachrichten.length > 0 ? `${nachrichten.length}` : undefined}
    >
      {nachrichten.length === 0 ? (
        <EmptyState
          title="Noch keine Nachrichten"
          description="Sobald der Interessent schreibt oder angeschrieben wird, erscheint es hier."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {nachrichten.map((n) => {
            const eingehend = n.richtung === 'inbound'
            return (
              <li
                key={n.id}
                className={`rounded-ios-md border border-claimondo-border p-3 ${
                  eingehend ? 'bg-claimondo-bg' : 'bg-white'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-caption text-claimondo-steel">
                  <span className="font-medium">
                    {eingehend ? '← Eingegangen' : '→ Gesendet'}
                  </span>
                  <span>·</span>
                  <span>{KANAL_LABEL[n.kanal ?? ''] ?? n.kanal ?? 'unbekannt'}</span>
                  <span>·</span>
                  <span>{formatiereZeit(n.created_at)}</span>
                  {n.empfaenger_kontakt ? (
                    <>
                      <span>·</span>
                      <span>{n.empfaenger_kontakt}</span>
                    </>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-body-sm text-claimondo-navy">
                  {n.nachricht?.trim() || '—'}
                </p>
                {n.hat_anhang ? (
                  // Der Hinweis bleibt auch dann stehen, wenn keine Datei ankam:
                  // „hier fehlt etwas" ist brauchbar, „nichts zu sehen" nicht.
                  <p className="mt-1 text-caption text-claimondo-steel">📎 Enthält einen Anhang</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
