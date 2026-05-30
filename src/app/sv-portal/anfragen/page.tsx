// AAR-939 · Monika-Embed · Stream 7 — SV-Lead-Inbox (PLATZHALTER).
//
// Die echte Inbox braucht das DB-Artefakt v_sv_inbox (spaltenreduzierte
// SECURITY-INVOKER-View, Owner-Scope ueber embed_site_id → embed_sites →
// inhaber_profile_id). Das ist die einzige DB-Aenderung von Stream 6/7 und haengt
// an der DB-Sperre (apply_migration). Bis dahin: ehrlicher Platzhalter, damit der
// Nav-Link nicht 404t. Siehe docs/30.05.2026/AAR-939-stream6-7-sv-portal-spec.md §4.

import { InboxIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

export default function SVPortalAnfragen() {
  return (
    <div className="py-6 space-y-4">
      <PageHeader title="Anfragen" size="lg" />
      <EmptyState
        icon={InboxIcon}
        title="Inbox folgt mit Stream 7"
        description="Deine eingegangenen Anfragen erscheinen hier, sobald die SV-Inbox freigeschaltet ist."
      />
    </div>
  )
}
