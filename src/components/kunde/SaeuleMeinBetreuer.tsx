'use client'

import { useState } from 'react'
import { HeadphonesIcon, MessageSquareIcon, CalendarPlusIcon } from 'lucide-react'
import Link from 'next/link'
// AAR-368: 15/30-Min-Beratungstermin buchen
import BeratungBuchenSheet from './BeratungBuchenSheet'
// AAR-369: Echtes Profilbild des KB (Initialen-Fallback wenn keins hinterlegt)
import Avatar from '@/components/shared/Avatar'

type Props = {
  fallId: string
  kbName: string | null
  kbTelefon: string | null
  kbAvatarUrl?: string | null
  kbBeschreibung?: string | null
}

export default function SaeuleMeinBetreuer({ fallId, kbName, kbTelefon, kbAvatarUrl, kbBeschreibung }: Props) {
  const [terminSheetOpen, setTerminSheetOpen] = useState(false)
  const displayName = kbName ?? 'Claimondo Team'
  const description = kbBeschreibung ?? 'Ihr persönlicher Ansprechpartner'

  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <HeadphonesIcon className="w-5 h-5 text-claimondo-ondo" />
        <h2 className="text-sm font-semibold text-claimondo-navy">Mein Betreuer</h2>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar url={kbAvatarUrl ?? null} name={displayName} size="md" />
          <div className="min-w-0">
            <p className="text-xs text-claimondo-ondo truncate">{description}</p>
            <p className="font-semibold text-claimondo-navy truncate">{displayName}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/kunde/chat"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-[#3a6290] transition-colors"
          >
            <MessageSquareIcon className="w-4 h-4" />
            Chat öffnen
          </Link>
          <button
            type="button"
            onClick={() => setTerminSheetOpen(true)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-claimondo-ondo text-claimondo-ondo text-xs font-medium hover:bg-claimondo-ondo/5 transition-colors"
          >
            <CalendarPlusIcon className="w-4 h-4" />
            Termin buchen
          </button>
        </div>

        {/* TODO AAR-412: PhoneButton-Migration — Kunden-facing, low priority */}
        {/* AAR-452: Touch-Target ≥44px für Daumen-Tap auf Mobile */}
        {kbTelefon && (
          <a
            href={`tel:${kbTelefon}`}
            className="inline-flex items-center min-h-[44px] text-xs text-claimondo-ondo hover:underline"
          >
            {kbTelefon}
          </a>
        )}
      </div>

      <BeratungBuchenSheet
        fallId={fallId}
        open={terminSheetOpen}
        onClose={() => setTerminSheetOpen(false)}
      />
    </div>
  )
}
