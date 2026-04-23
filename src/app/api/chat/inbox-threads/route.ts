import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type InboxThread = {
  fallId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
  kanaele: string[]
}

const ADMIN_KANAELE = ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv']
const SV_KANAELE = ['whatsapp', 'chat_kunde_sv', 'gruppenchat']
const KUNDE_KANAELE = ['whatsapp', 'chat_kb_kunde', 'chat_kunde_sv', 'gruppenchat']

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

  let kanaele: string[] = ADMIN_KANAELE
  let fallFilter: { column: string; value: string } | null = null

  if (rolle === 'sachverstaendiger') {
    kanaele = SV_KANAELE
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (sv?.id) fallFilter = { column: 'sv_id', value: sv.id }
  } else if (rolle === 'kunde') {
    kanaele = KUNDE_KANAELE
    fallFilter = { column: 'kunde_id', value: user.id }
  }

  let fallIds: string[] = []
  if (fallFilter) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select('id')
      .eq(fallFilter.column, fallFilter.value)
      .not('status', 'in', '("storniert")')
      .limit(100)
    fallIds = (faelle ?? []).map(f => f.id)
    if (fallIds.length === 0) return NextResponse.json({ threads: [] })
  }

  let query = supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_rolle, nachricht, gelesen, richtung, created_at')
    .in('kanal', kanaele)
    .not('fall_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (fallIds.length > 0) {
    query = query.in('fall_id', fallIds)
  }

  const { data: nachrichten } = await query
  if (!nachrichten?.length) return NextResponse.json({ threads: [] })

  const allFallIds = Array.from(new Set(nachrichten.map(n => n.fall_id).filter(Boolean) as string[]))

  const { data: faelleMeta } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id')
    .in('id', allFallIds.slice(0, 100))

  const leadIds = Array.from(new Set((faelleMeta ?? []).map(f => f.lead_id).filter(Boolean) as string[]))
  const { data: leads } = leadIds.length
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const fallMap = new Map((faelleMeta ?? []).map(f => [f.id, f]))
  const leadMap = new Map((leads ?? []).map(l => [l.id, l]))

  const threadMap = new Map<string, InboxThread>()
  for (const n of nachrichten) {
    if (!n.fall_id) continue
    const existing = threadMap.get(n.fall_id)
    const fall = fallMap.get(n.fall_id)
    const lead = fall?.lead_id ? leadMap.get(fall.lead_id) : null
    const kundeName = lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ')
      : 'Unbekannt'
    const isUnread = !n.gelesen && n.richtung === 'inbound'

    if (!existing) {
      threadMap.set(n.fall_id, {
        fallId: n.fall_id,
        fallNummer: fall?.fall_nummer ?? null,
        kundeName,
        lastMessage: n.nachricht ?? '',
        lastAt: n.created_at,
        unreadCount: isUnread ? 1 : 0,
        kanaele: [n.kanal],
      })
    } else {
      if (isUnread) existing.unreadCount++
      if (!existing.kanaele.includes(n.kanal)) existing.kanaele.push(n.kanal)
    }
  }

  const threads = Array.from(threadMap.values()).sort((a, b) => {
    if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  })

  return NextResponse.json({ threads })
}
