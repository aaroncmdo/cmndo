// Dezente Kontinuitaets-Klammer fuer den zusammenhaengenden Aufnahme-Flow
// (Ersteinschaetzung -> Foto-Tool -> Gutachter-Finder): signalisiert, dass der aktuelle
// Schritt eine Fortsetzung ist, kein Frisch-Start. Genutzt vom Foto-Tool (Ankunft aus
// /check via ?schuld=) und vom Gutachter-Finder (Ankunft aus dem Foto-Tool via ?schaetzung=).
// Text pro Kontext uebergeben. Single-Source, damit beide Surfaces visuell identisch sind.
export function AufnahmeFlowHinweis({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-ios-md bg-claimondo-bg px-3 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-claimondo-ondo" aria-hidden />
      <p className="text-caption text-claimondo-shield">{text}</p>
    </div>
  )
}
