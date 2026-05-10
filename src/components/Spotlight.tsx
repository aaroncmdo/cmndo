'use client'

// AAR-805: Admin-Wrapper über Shared-Spotlight. Zeigt Faelle/Leads/SVs.
// Logik (Cmd+K, Debounce, Pfeil-Navigation, Modal-Chrome) liegt jetzt in
// components/shared/Spotlight.

// AAR-805: Admin-Wrapper über Shared-Spotlight. Zeigt Faelle/Leads/SVs.
// Logik (Cmd+K, Debounce, Pfeil-Navigation, Modal-Chrome) liegt jetzt in
// components/shared/Spotlight.

import { useRouter } from 'next/navigation'
import { FileTextIcon, UserIcon, HardHatIcon } from 'lucide-react'
import {
  Spotlight as SharedSpotlight,
  type SpotlightGroup,
  type SpotlightResult,
} from '@/components/shared/Spotlight'

type ApiPayload = {
  faelle?: SpotlightResult[]
  leads?: SpotlightResult[]
  sv?: SpotlightResult[]
}

export default function Spotlight() {
  const router = useRouter()

  function parseResponse(data: unknown): SpotlightGroup[] {
    const d = (data ?? {}) as ApiPayload
    return [
      {
        key: 'fall',
        label: 'Fälle',
        icon: FileTextIcon,
        iconColor: 'text-[#4573A2]',
        hoverBg: 'hover:bg-[#4573A2]/5',
        results: d.faelle ?? [],
      },
      {
        key: 'lead',
        label: 'Leads',
        icon: UserIcon,
        iconColor: 'text-green-500',
        hoverBg: 'hover:bg-green-50',
        results: d.leads ?? [],
      },
      {
        key: 'sv',
        label: 'Sachverständige',
        icon: HardHatIcon,
        iconColor: 'text-purple-500',
        hoverBg: 'hover:bg-purple-50',
        results: d.sv ?? [],
      },
    ]
  }

  function navigate(groupKey: string, id: string) {
    if (groupKey === 'fall') router.push(`/faelle/${id}`)
    else if (groupKey === 'lead') router.push(`/dispatch/leads/${id}`)
    else if (groupKey === 'sv') router.push(`/admin/sachverstaendige/${id}`)
  }

  return (
    <SharedSpotlight
      searchEndpoint="/api/search"
      parseResponse={parseResponse}
      navigate={navigate}
      placeholder="Suche nach Name, Kennzeichen, Aktenzeichen…"
      ariaLabel="Admin-Spotlight"
    />
  )
}
