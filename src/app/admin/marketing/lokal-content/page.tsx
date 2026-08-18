// Hyperlokale Ortsinhalte — Review-Portal.
// Pattern: force-dynamic + Auth-Guard + createAdminClient() + DataTable,
// wie src/app/admin/wissen-artikel/page.tsx.
//
// Zeigt ALLE Stadt-Pages, nicht nur die mit Inhalt: die Staedte ohne Tiefe
// sind die eigentliche Arbeit, und eine Liste, die sie verschweigt, verschweigt
// den Rueckstand.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { STAEDTE_STAMMDATEN } from '@/lib/lokalinhalt/staedte'
import LokalContentActions from './LokalContentActions'

export const dynamic = 'force-dynamic'

// Reine Label-Map ohne Farblogik — bewusst: der Status-Registry-Ratchet blockt
// neue inline Status-FARB-Maps, Labels sind erlaubt.
const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  in_review: 'Zur Prüfung',
  veroeffentlicht: 'Veröffentlicht',
  abgelehnt: 'Verworfen',
  archiviert: 'Archiviert',
}

/** Sortier-Rang: was Arbeit macht, steht oben. */
const RANG: Record<string, number> = { in_review: 0, entwurf: 0, __ohne__: 1, veroeffentlicht: 2 }

type Zeile = {
  id: string
  stadt_slug: string
  status: string
  substanz_score: number
  updated_at: string
}

export default async function LokalContentPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const admin = createAdminClient()

  // Nur die relevanten Zustaende: verworfene/archivierte Fassungen sind Historie
  // und wuerden die Liste zumuellen.
  const { data: rows } = await admin
    .from('stadt_lokalinhalte')
    .select('id, stadt_slug, status, substanz_score, updated_at')
    .in('status', ['entwurf', 'in_review', 'veroeffentlicht'])
    .order('updated_at', { ascending: false })

  const proStadt = new Map<string, Zeile>()
  for (const r of (rows ?? []) as Zeile[]) {
    // Ein offener Entwurf hat Vorrang vor einer bereits veroeffentlichten Fassung.
    const vorhanden = proStadt.get(r.stadt_slug)
    if (!vorhanden || (vorhanden.status === 'veroeffentlicht' && r.status !== 'veroeffentlicht')) {
      proStadt.set(r.stadt_slug, r)
    }
  }

  const liste = STAEDTE_STAMMDATEN.map((s) => {
    const eintrag = proStadt.get(s.slug) ?? null
    return { stadt: s, eintrag }
  }).sort((a, b) => {
    const ra = RANG[a.eintrag?.status ?? '__ohne__'] ?? 1
    const rb = RANG[b.eintrag?.status ?? '__ohne__'] ?? 1
    return ra - rb || a.stadt.name.localeCompare(b.stadt.name)
  })

  const zurPruefung = liste.filter(
    (x) => x.eintrag?.status === 'in_review' || x.eintrag?.status === 'entwurf',
  ).length
  const veroeffentlicht = liste.filter((x) => x.eintrag?.status === 'veroeffentlicht').length
  const ohneInhalt = liste.length - zurPruefung - veroeffentlicht

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="Hyperlokale Ortsinhalte"
        description="Stadtbezirke, Verkehrsachsen, Unfallschwerpunkte und ortsspezifische FAQs je Stadtseite"
        size="lg"
      />

      <SectionCard>
        <p className="text-body-sm text-claimondo-slate">
          <strong className="text-claimondo-navy">{liste.length}</strong> Stadtseiten ·{' '}
          <strong className="text-claimondo-navy">{veroeffentlicht}</strong> mit veröffentlichtem
          Ortsinhalt · <strong className="text-claimondo-navy">{zurPruefung}</strong> zur Prüfung ·{' '}
          <strong className="text-claimondo-navy">{ohneInhalt}</strong> ohne Inhalt
        </p>
        <p className="text-body-xs text-claimondo-slate mt-2">
          Inhalte, die das Qualitäts-Gate bestehen, gehen direkt live. Verlangt werden mindestens
          drei harte Ortsfakten; Unfallschwerpunkte ohne belegbare Quell-URL werden verworfen und
          erscheinen als Hinweis. Was das Gate nicht besteht, landet hier zur Prüfung und wartet
          auf eine Freigabe.
        </p>
      </SectionCard>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Stadt</Th>
              <Th>Gerichte</Th>
              <Th>Status</Th>
              <Th>Substanz</Th>
              <Th>Aktion</Th>
            </Tr>
          </Thead>
          <Tbody>
            {liste.map(({ stadt, eintrag }) => (
              <Tr key={stadt.slug}>
                <Td>
                  <div className="font-medium text-claimondo-navy">{stadt.name}</div>
                  <div className="text-body-xs text-claimondo-slate">
                    {stadt.bundesland} · PLZ {stadt.plzPrefix}
                  </div>
                </Td>
                <Td>
                  <div className="text-body-xs text-claimondo-slate">{stadt.amtsgericht}</div>
                  <div className="text-body-xs text-claimondo-slate">{stadt.landgericht}</div>
                </Td>
                <Td>{eintrag ? (STATUS_LABEL[eintrag.status] ?? eintrag.status) : '—'}</Td>
                <Td>{eintrag ? `${eintrag.substanz_score}/4` : '—'}</Td>
                <Td>
                  <LokalContentActions
                    stadtSlug={stadt.slug}
                    eintragId={eintrag?.id ?? null}
                    status={eintrag?.status ?? null}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
