import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'
import { aggregiereInbox, type AggClaimMeta, type AggMessage } from '@/lib/chat/inbox-aggregation'

export type { InboxThread } from '@/lib/chat/inbox-aggregation'

// Phase 2b DEEPER: thread-nativer globaler Posteingang. Aggregiert die kunde_gruppe-Threads
// (= die Konversation, die das FAB-Fenster oeffnet), NICHT mehr kanal-basiert. Reine Logik in
// aggregiereInbox (getestet); hier nur die I/O. Zugriffs-Scope unveraendert (Staff: alle,
// SV/Kunde: eigene Claims).
export async function GET() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ threads: [] }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!rolle) return NextResponse.json({ threads: [] })

  const istStaff = rolle === 'admin' || rolle === 'kundenbetreuer' || rolle === 'dispatch'

  // Zugriffs-Scope: Staff sieht alle Claims (kein Filter), SV/Kunde nur eigene.
  // claim_id:id (echte claims-PK) aus der claim-anchored View v_claim_full.
  let claimFilter: string[] | null = null // null = kein Filter (Staff)
  if (!istStaff) {
    let fallFilter: { column: string; value: string } | null = null
    if (rolle === 'sachverstaendiger') {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('id')
        .eq('profile_id', user.id)
        // multi-standort-safe: Ordering+limit(1) wie getGutachterForUser.
        .order('ist_parent_account', { ascending: true, nullsFirst: true })
        .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (sv?.id) fallFilter = { column: 'sv_id', value: sv.id }
    } else if (rolle === 'kunde') {
      fallFilter = { column: 'kunde_id', value: user.id }
    }
    if (!fallFilter) return NextResponse.json({ threads: [] })
    const { data: claims } = await supabase
      .from('v_claim_full')
      .select('claim_id:id')
      .eq(fallFilter.column, fallFilter.value)
      .not('operative_status', 'in', '("storniert")')
      .not('id', 'is', null)
      .limit(200)
    claimFilter = (claims ?? [])
      .map((c) => (c as { claim_id: string | null }).claim_id)
      .filter(Boolean) as string[]
    if (claimFilter.length === 0) return NextResponse.json({ threads: [] })
  }

  // kunde_gruppe-Thread-Nachrichten via Service-Role, explizit auf die Zugriffs-Claims gescoped
  // (Staff: alle). Ersetzt die fruehere kanal-Aggregation (getInboxKanaele).
  const admin = createAdminClient() as unknown as SupabaseClient
  // Filter VOR order/limit (order/limit liefern einen Transform-Builder ohne .in).
  let q = admin
    .from('nachrichten')
    .select('created_at, nachricht, chat_threads!inner(claim_id, art)')
    .not('thread_id', 'is', null)
    .eq('chat_threads.art', 'kunde_gruppe')
  if (claimFilter) q = q.in('chat_threads.claim_id', claimFilter)
  const { data: rows } = await q.order('created_at', { ascending: false }).limit(500)

  type Row = { created_at: string; nachricht: string | null; chat_threads: { claim_id: string } | { claim_id: string }[] }
  const messages: AggMessage[] = ((rows ?? []) as Row[])
    .map((r) => {
      const ct = Array.isArray(r.chat_threads) ? r.chat_threads[0] : r.chat_threads
      return ct?.claim_id ? { claimId: ct.claim_id, nachricht: r.nachricht, createdAt: r.created_at } : null
    })
    .filter(Boolean) as AggMessage[]

  const claimIds = Array.from(new Set(messages.map((m) => m.claimId)))
  if (claimIds.length === 0) return NextResponse.json({ threads: [] })

  // Claim-Meta: fall_id (Store-Key des FAB) + claim_nummer + lead_id -> Kundenname.
  const { data: metaRaw } = await admin
    .from('v_claim_full')
    .select('id, fall_id, claim_nummer, lead_id')
    .in('id', claimIds.slice(0, 200))
  type MetaRow = { id: string; fall_id: string | null; claim_nummer: string | null; lead_id: string | null }
  const metaRows = (metaRaw ?? []) as MetaRow[]

  const leadIds = Array.from(new Set(metaRows.map((m) => m.lead_id).filter(Boolean) as string[]))
  const { data: leads } = leadIds.length
    ? await admin.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null }> }
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]))

  const claimMeta = new Map<string, AggClaimMeta>()
  for (const m of metaRows) {
    const lead = m.lead_id ? leadMap.get(m.lead_id) : null
    const kundeName = lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt' : 'Unbekannt'
    claimMeta.set(m.id, { claimId: m.id, fallId: m.fall_id, fallNummer: m.claim_nummer, kundeName })
  }

  const unreadRes = await ladeClaimUnreadCounts(claimIds)
  const unread = unreadRes.ok ? unreadRes.data : {}

  const threads = aggregiereInbox(messages, claimMeta, unread)
  return NextResponse.json({ threads })
}
