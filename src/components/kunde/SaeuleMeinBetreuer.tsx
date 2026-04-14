'use client'

import { HeadphonesIcon, MessageSquareIcon } from 'lucide-react'
import Link from 'next/link'

type Props = {
  fallId: string
  kbName: string | null
  kbTelefon: string | null
}

export default function SaeuleMeinBetreuer({ fallId, kbName, kbTelefon }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <HeadphonesIcon className="w-5 h-5 text-[#4573A2]" />
        <h2 className="text-sm font-semibold text-[#0D1B3E]">Mein Betreuer</h2>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500">Ihr persönlicher Ansprechpartner</p>
          <p className="font-semibold text-gray-900">{kbName ?? 'Claimondo Team'}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/kunde/chat"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#3a6290] transition-colors"
          >
            <MessageSquareIcon className="w-4 h-4" />
            Chat öffnen
          </Link>
        </div>

        {kbTelefon && (
          <a href={`tel:${kbTelefon}`} className="text-xs text-[#4573A2] hover:underline block">
            {kbTelefon}
          </a>
        )}
      </div>
    </div>
  )
}
