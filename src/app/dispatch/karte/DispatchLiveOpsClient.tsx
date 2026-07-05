'use client'

import { useRouter } from 'next/navigation'
import LiveOpsMap from '@/components/live-ops/LiveOpsMap'
import type { LiveOpsData } from '@/components/live-ops/types'

type Props = {
  data: LiveOpsData
}

export default function DispatchLiveOpsClient({ data }: Props) {
  const router = useRouter()
  return (
    <LiveOpsMap
      role="dispatch"
      data={data}
      onRefresh={() => router.refresh()}
    />
  )
}
