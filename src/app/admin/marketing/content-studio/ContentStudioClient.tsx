'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  ClickableTr,
} from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import { erstelleClip } from './actions'
import { STATUS_LABEL, STATUS_TONE } from './status-display'
import { AutoRefresh } from './AutoRefresh'

export interface Job {
  id: string
  thema: string
  format: string
  status: string
  dauer_sekunden: number | null
  kosten_cents: number | null
  erstellt_am: string
}

export default function ContentStudioClient({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const [thema, setThema] = useState('')
  const [format, setFormat] = useState<'ratgeber' | 'ad'>('ratgeber')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await erstelleClip(thema, format)
      if (!r.ok) {
        setError(r.error ?? 'Erstellung fehlgeschlagen.')
        return
      }
      setThema('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 py-6">
      {/* Liste live halten, solange ein Job in Arbeit ist (generiert/gequeued/rendert) */}
      <AutoRefresh
        active={jobs.some(
          (j) => j.status === 'entwurf' || j.status === 'render_queued' || j.status === 'audio_erzeugt',
        )}
        intervalMs={3000}
      />
      <PageHeader
        title="Content-Studio"
        description="KI-generierte Kurzvideos (Ratgeber & Ads) für TikTok & Meta"
        size="md"
      />

      <SectionCard>
        <h2 className="mb-3 text-heading-sm font-semibold text-claimondo-navy">Neuer Clip</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <TextField
            label="Thema"
            placeholder="z.B. Was tun direkt nach einem Autounfall?"
            value={thema}
            onChange={(e) => setThema(e.target.value)}
            error={error}
          />
          <SelectField
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'ratgeber' | 'ad')}
            options={[
              { value: 'ratgeber', label: 'Ratgeber' },
              { value: 'ad', label: 'Ad / Werbung' },
            ]}
          />
          <Button variant="navy" onClick={submit} loading={pending} disabled={pending || !thema.trim()}>
            Generieren
          </Button>
        </div>
        <p className="mt-2 text-body-xs text-claimondo-shield">
          Das Skript wird generiert und wartet dann auf deine Freigabe („Review nötig“). Nach dem
          Prüfen/Editieren startest du den Render — Voiceover, Untertitel und Video laufen dann
          automatisch.
        </p>
      </SectionCard>

      <DataTableContainer variant="card">
        <Table>
          <Thead>
            <Tr>
              <Th>Thema</Th>
              <Th>Format</Th>
              <Th>Status</Th>
              <Th>Dauer</Th>
              <Th>Erstellt</Th>
            </Tr>
          </Thead>
          <Tbody>
            {jobs.length === 0 ? (
              <Tr>
                <Td colSpan={5}>Noch keine Clips — erstelle oben deinen ersten.</Td>
              </Tr>
            ) : (
              jobs.map((j) => (
                <ClickableTr
                  key={j.id}
                  onClick={() => router.push(`/admin/marketing/content-studio/${j.id}`)}
                >
                  <Td>{j.thema}</Td>
                  <Td>{j.format === 'ad' ? 'Ad' : 'Ratgeber'}</Td>
                  <Td>
                    <StatusBadge tone={STATUS_TONE[j.status] ?? 'neutral'} size="xs">
                      {STATUS_LABEL[j.status] ?? j.status}
                    </StatusBadge>
                  </Td>
                  <Td>{j.dauer_sekunden ? `${j.dauer_sekunden}s` : '–'}</Td>
                  <Td>{new Date(j.erstellt_am).toLocaleDateString('de-DE')}</Td>
                </ClickableTr>
              ))
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
