// Vertrieb-Konsole (Ein-Dach) — Layout mit Unter-Navigation.
// Bewusst KEIN PageContainer-Escape auf Layout-Ebene: die eingebetteten Verwaltungs-
// Seiten (Sachverständige-Karte, eigene Karte) bringen ihren eigenen Full-Bleed-Escape
// (104.17% von 96% = 100% Main-Breite) mit — ein zweiter Escape hier würde doppelt
// greifen und überlaufen. Header/Tabs sitzen daher im normalen 96%-Raster, Karten
// laufen full-bleed darunter.
import VertriebKonsoleTabs from './VertriebKonsoleTabs'

export default function VertriebKonsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6 pt-4">
        <h1 className="text-heading-md text-claimondo-navy">Vertrieb</h1>
        <p className="text-caption text-claimondo-ondo/70 mb-2">
          Partner &amp; Leads — Akquise, Bestand und Karte unter einem Dach.
        </p>
        <VertriebKonsoleTabs />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
