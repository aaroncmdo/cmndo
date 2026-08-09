// AAR-939 P3: Warteschlange ausstehender Basic-SVs (paket='basic' + verifizierung_status='ausstehend').
// Aelteste zuerst — 48h-SLA erscheinen oben.

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import { UserCheckIcon } from 'lucide-react'
import BasicFreigabeRowActions from './BasicFreigabeRowActions'

export const dynamic = 'force-dynamic'

const ONBOARDING_QUELLE_LABEL: Record<string, string> = {
  self_service_neu: 'Self-Service (neu)',
  self_service_claim: 'Self-Service (Schaden)',
}

export default async function BasicFreigabenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (me?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const db = createAdminClient()

  // Pending Basic-SVs — oldest first for 48h-SLA visibility.
  // firma ist auf profiles, nicht auf sachverstaendige — via FK-Join.
  const { data: rows, error } = await db
    .from('sachverstaendige')
    .select(
      'id, paket, onboarding_quelle, standort_plz, standort_adresse, created_at, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email, firma)',
    )
    .eq('paket', 'basic')
    .eq('verifizierung_status', 'ausstehend')
    // Nur NOCH-NICHT-freigeschaltete SVs = „wartet auf Admin-Freigabe". Seit dem
    // Tier-2-Enforcement (Spec 2026-08-08) tragen auch FREIGESCHALTETE SVs ohne
    // geprüfte Docs 'ausstehend' (Tier-2-Frist läuft) — die gehören NICHT in die
    // Freigabe-Queue. Der Tier-2-Zustand wird in der SV-Akte/Liste gezeigt.
    .eq('portal_zugang_freigeschaltet', false)
    .is('geloescht_am', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[basic-freigaben] Query-Fehler:', error.message)
  }

  type Row = {
    id: string
    paket: string | null
    onboarding_quelle: string | null
    standort_plz: string | null
    standort_adresse: string | null
    created_at: string | null
    profiles: unknown
  }

  const svList = (rows ?? []) as unknown as Row[]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="flex-shrink-0 px-4 pt-4">
        <Link
          href="/admin/sachverstaendige"
          className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors mb-1.5 inline-block"
        >
          &larr; Gutachter-Übersicht
        </Link>
        <PageHeader
          title="Basic-Freigaben"
          icon={UserCheckIcon}
          description={
            svList.length > 0
              ? `${svList.length} ausstehend${svList.length === 1 ? '' : 'e'} Anfrage${svList.length === 1 ? '' : 'n'} · älteste zuerst`
              : 'Keine ausstehenden Freigaben'
          }
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-claimondo-bg/30">
        <div className="max-w-5xl mx-auto">
          {svList.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={UserCheckIcon}
                title="Keine ausstehenden Freigaben"
                description="Alle Basic-SVs wurden bereits geprüft."
              />
            </div>
          ) : (
            <DataTableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Name / Firma</Th>
                    <Th>Region</Th>
                    <Th>Quelle</Th>
                    <Th>Eingegangen am</Th>
                    <Th>Aktionen</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {svList.map(sv => {
                    const pRel = sv.profiles
                    const p = (Array.isArray(pRel) ? pRel[0] : pRel) as {
                      vorname: string | null
                      nachname: string | null
                      email: string | null
                      firma: string | null
                    } | null

                    const name = p
                      ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim()
                      : '—'
                    const email = p?.email ?? null
                    const firma = p?.firma ?? null
                    const region =
                      sv.standort_plz
                        ? sv.standort_plz
                        : sv.standort_adresse
                          ? sv.standort_adresse.split(',').slice(-1)[0]?.trim() ?? '—'
                          : '—'
                    const quelleLabel = sv.onboarding_quelle
                      ? (ONBOARDING_QUELLE_LABEL[sv.onboarding_quelle] ?? sv.onboarding_quelle)
                      : '—'
                    const eingegangen = sv.created_at
                      ? new Date(sv.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          timeZone: 'Europe/Berlin',
                        })
                      : '—'

                    // SLA-Warnung bei > 48h
                    const stunden = sv.created_at
                      ? (Date.now() - new Date(sv.created_at).getTime()) / (1000 * 60 * 60)
                      : 0
                    const slaKritisch = stunden >= 48

                    return (
                      <Tr
                        key={sv.id}
                        className={slaKritisch ? 'bg-warning-soft/60' : undefined}
                      >
                        <Td>
                          <div className="space-y-0.5">
                            <Link
                              href={`/admin/vertrieb/sachverstaendige/${sv.id}?tab=verifizierung`}
                              className="text-xs font-semibold text-claimondo-navy hover:underline"
                            >
                              {name || '—'}
                            </Link>
                            {firma && (
                              <p className="text-[11px] text-claimondo-ondo">{firma}</p>
                            )}
                            {email && (
                              <p className="text-[10px] text-claimondo-ondo/70">{email}</p>
                            )}
                          </div>
                        </Td>
                        <Td className="text-xs text-claimondo-ondo">{region}</Td>
                        <Td>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-claimondo-bg text-claimondo-ondo border border-claimondo-border">
                            {quelleLabel}
                          </span>
                        </Td>
                        <Td>
                          <div className="space-y-0.5">
                            <p className="text-xs text-claimondo-navy">{eingegangen}</p>
                            {slaKritisch && (
                              <p className="text-[10px] text-warning-strong font-semibold">
                                &gt; 48h — SLA kritisch
                              </p>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <BasicFreigabeRowActions svId={sv.id} />
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </DataTableContainer>
          )}
        </div>
      </div>
    </div>
  )
}
