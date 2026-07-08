import { cn } from '@/lib/utils'

// Dezente Kontinuitaets-Klammer fuer den zusammenhaengenden Aufnahme-Flow
// (Ersteinschaetzung -> Foto-Tool -> Gutachter-Finder): signalisiert, dass der aktuelle
// Schritt eine Fortsetzung ist, kein Frisch-Start. Genutzt vom Foto-Tool (Ankunft aus
// /check via ?schuld=) und vom Gutachter-Finder (Ankunft aus dem Foto-Tool via ?schaetzung=).
// Text pro Kontext uebergeben. Single-Source, damit beide Surfaces visuell identisch sind.
// className optional: der Default mb-4 passt in Nicht-Flex-Container (Foto-Tool); in einem
// flex/gap-Container (Finder-GlassSurface) mit `mb-0` neutralisieren, damit nicht doppelt gespact wird.
export function AufnahmeFlowHinweis({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-center gap-2 rounded-ios-md bg-claimondo-bg px-3 py-2', className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-claimondo-ondo" aria-hidden />
      <p className="text-caption text-claimondo-shield">{text}</p>
    </div>
  )
}
