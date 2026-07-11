// Vertrieb-Konsole — Layout (nur Titel; die Navigation lebt jetzt als Pills im Cockpit).
// Bewusst KEIN PageContainer-Escape auf Layout-Ebene: die eingebetteten Verwaltungs-
// Seiten (Sachverständige-Karte, eigene Karte) bringen ihren eigenen Full-Bleed-Escape
// mit — ein zweiter Escape hier würde doppelt greifen und überlaufen.
import Link from 'next/link'

export default function VertriebKonsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6 pt-4 pb-3 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-heading-md text-claimondo-navy">Vertrieb</h1>
          <p className="text-caption text-claimondo-ondo/70">
            Partner &amp; Leads — Akquise, Bestand und Karte in einer Übersicht.
          </p>
        </div>
        <Link
          href="/admin/vertrieb/vorlagen"
          className="shrink-0 mt-1 text-caption text-claimondo-ondo/70 underline hover:text-claimondo-navy"
        >
          Mail-Vorlagen
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
