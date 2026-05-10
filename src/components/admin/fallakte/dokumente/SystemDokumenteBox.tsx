'use client'

// AAR-755 (Phase D): aus dem DokumenteTab-Monolithen extrahiert.
// Zeigt System-generierte/externe Dokumente (SA, Vollmacht, Gutachten,
// Kanzlei-Paket, Vorschaden-PDF). Keine Schreib-Interaktion — die Files
// werden von anderen Systemen (FlowLink, SV-Portal, Kanzlei-Paket-
// Generator, CarDentity-Worker) erzeugt.
//
// Tokens: Claimondo-CI (navy/ondo/border), statt alter gray-*.

import { DownloadIcon, EyeIcon, FileTextIcon, ServerIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'

export type SystemDokumenteProps = {
  sa_pdf_url: string | null
  sa_unterschrift_url: string | null
  vollmacht_pdf: string | null
  vorschaden_typ_b_pdf_url: string | null
  gutachten: {
    id: string
    datei_url: string
    datei_name: string
    hochgeladen_am: string | null
  } | null
  kanzleiPaket: {
    id: string
    datei_url: string
    datei_name: string
    hochgeladen_am: string | null
  } | null
}

type SystemDokumenteBoxProps = {
  systemDokumente: SystemDokumenteProps
}

export function SystemDokumenteBox({ systemDokumente }: SystemDokumenteBoxProps) {
  const rows: { key: string; label: string; url: string | null; hint: string }[] = [
    { key: 'sa', label: 'Sachverständigen-Auftrag (SA)', url: systemDokumente.sa_pdf_url, hint: 'aus FlowLink-Signatur' },
    { key: 'sa_sig', label: 'SA-Unterschrift', url: systemDokumente.sa_unterschrift_url, hint: 'Unterschrift-Bucket' },
    { key: 'vollmacht', label: 'Vollmacht', url: systemDokumente.vollmacht_pdf, hint: 'aus FlowLink-Signatur' },
    { key: 'gutachten', label: 'Gutachten-PDF', url: systemDokumente.gutachten?.datei_url ?? null, hint: 'vom Sachverständigen' },
    { key: 'kanzlei', label: 'Kanzlei-Paket', url: systemDokumente.kanzleiPaket?.datei_url ?? null, hint: 'system-generiert' },
    { key: 'vorschaden', label: 'Vorschadenbericht (CarDentity)', url: systemDokumente.vorschaden_typ_b_pdf_url, hint: 'Typ-B-Abfrage' },
  ]
  return (
    <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-claimondo-border bg-claimondo-bg">
        <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider flex items-center gap-2">
          <ServerIcon className="w-3.5 h-3.5" /> System-Dokumente
        </h3>
      </div>
      <div className="divide-y divide-claimondo-border">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between px-4 py-2.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileTextIcon
                className={`w-4 h-4 shrink-0 ${r.url ? 'text-emerald-500' : 'text-claimondo-ondo/40'}`}
              />
              <div className="min-w-0">
                <p className="text-sm text-claimondo-navy truncate">{r.label}</p>
                <p className="text-[10px] text-claimondo-ondo/70">{r.hint}</p>
              </div>
            </div>
            {r.url ? (
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-claimondo-ondo hover:text-claimondo-navy"
                >
                  <EyeIcon className="w-3 h-3" /> Vorschau
                </a>
                <a
                  href={r.url}
                  download
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-claimondo-ondo hover:text-claimondo-navy"
                >
                  <DownloadIcon className="w-3 h-3" /> Download
                </a>
              </div>
            ) : (
              <StatusBadge tone="neutral" className="shrink-0">
                Ausstehend
              </StatusBadge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
