'use client'

import dynamic from 'next/dynamic'

const WaitlistApplyDynamic = dynamic(() => import('./WaitlistApply'), { ssr: false })

export default function WaitlistApplyLoader() {
  return <WaitlistApplyDynamic />
}
