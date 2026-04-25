'use client'

// AAR-804 / AAR-805: SV-Wrapper über Shared-Spotlight. Sucht nur über die
// eigenen Fälle des SVs (RLS via /api/gutachter/search).

import { useRouter } from 'next/navigation'
import { FileTextIcon } from 'lucide-react'
import {
  Spotlight as SharedSpotlight,
  type SpotlightGroup,
  type SpotlightResult,
} from '@/components/shared/Spotlight'

type ApiPayload = { faelle?: SpotlightResult[] }

export default function SVSpotlight() {
  const router = useRouter()

  function parseResponse(data: unknown): SpotlightGroup[] {
    const d = (data ?? {}) as ApiPayload
    return [
      {
        key: 'fall',
        label: 'Meine Fälle',
        icon: FileTextIcon,
        iconColor: 'text-[var(--brand-secondary,#4573A2)]',
        hoverBg: 'hover:bg-[var(--brand-secondary,#4573A2)]/5',
        results: d.faelle ?? [],
      },
    ]
  }

  function navigate(_groupKey: string, id: string) {
    router.push(`/gutachter/fall/${id}`)
  }

  return (
    <SharedSpotlight
      searchEndpoint="/api/gutachter/search"
      parseResponse={parseResponse}
      navigate={navigate}
      placeholder="Kennzeichen, Fall-Nr, Kunde oder Ort…"
      ariaLabel="SV-Akten-Suche"
    />
  )
}
