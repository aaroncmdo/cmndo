// AAR-326 (Child 6 von AAR-320): Box für unzugeordnete Kunden-Uploads.
//
// Kunden können über den AAR-324-Freier-Upload Dokumente als
// `kunde-nachreichung` oder `sonstiges` hochladen — ohne konkretes Slot
// gewählt zu haben. Diese Dokumente landen in fall_dokumente und müssen
// vom KB nachträglich einem Katalog-Slot zugewiesen werden, damit das
// Pflicht-Dashboard korrekt anzeigt.
//
// Die Box rendert die Liste der betroffenen Dokumente + je einen
// „Zuordnen"-Button, der das DokumenteZuordnungsModal öffnet.

'use client'

import { useState } from 'react'
import { ExternalLinkIcon, FileTextIcon, InboxIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import DokumenteZuordnungsModal, {
  type UnzugeordnetDoc,
  type ZuordnungsSlot,
} from './DokumenteZuordnungsModal'

export default function DokumenteUnzugeordnetBox({
  docs,
  slots,
}: {
  docs: UnzugeordnetDoc[]
  slots: ZuordnungsSlot[]
}) {
  const [activeDoc, setActiveDoc] = useState<UnzugeordnetDoc | null>(null)
  const [open, setOpen] = useState(false)

  if (docs.length === 0) return null

  return (
    <div className="bg-amber-50/40 border border-amber-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200/60 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2">
          <InboxIcon className="w-3.5 h-3.5" />
          Unzugeordnete Uploads
          <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-200 text-amber-900 text-[10px] tabular-nums">
            {docs.length}
          </span>
        </h3>
      </div>

      <div className="divide-y divide-amber-200/40">
        {docs.map((doc) => (
          <div key={doc.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileTextIcon className="w-4 h-4 text-amber-700 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-claimondo-navy truncate">
                  {doc.original_filename ?? 'Unbenannt'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge colorCls="bg-white/70 text-amber-700 border border-amber-200">
                    {doc.dokument_typ === 'kunde-nachreichung' ? 'Nachreichung' : 'Sonstiges'}
                  </StatusBadge>
                  <span className="text-[9px] text-claimondo-ondo">
                    {new Date(doc.hochgeladen_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
                  </span>
                </div>
                {doc.beschreibung && (
                  <p className="text-[11px] text-claimondo-ondo italic mt-0.5 line-clamp-1">
                    „{doc.beschreibung}"
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {doc.previewUrl && (
                <a
                  href={doc.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-claimondo-ondo/70 hover:text-claimondo-ondo p-1"
                  title="Dokument öffnen"
                >
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveDoc(doc)
                  setOpen(true)
                }}
                className="text-[10px] font-medium text-white bg-claimondo-ondo hover:bg-claimondo-shield px-2.5 py-1 rounded-md"
              >
                Zuordnen
              </button>
            </div>
          </div>
        ))}
      </div>

      <DokumenteZuordnungsModal
        doc={activeDoc}
        slots={slots}
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setActiveDoc(null)
        }}
      />
    </div>
  )
}
