import type { ReactNode } from 'react'

// Der fruehere `drawer`-Parallel-Slot wurde ENTFERNT (Prod-Smoke 14.07.):
// /admin/versicherungen redirected (308) auf /admin/partner/versicherer — die
// Liste lebt in einem ANDEREN Route-Segment, ein Klick dort matcht den Intercept
// `@drawer/(.)[id]` NIE (Cross-Segment-Nav). Der Drawer war damit toter Code;
// die Full-Page [id]/page.tsx uebernimmt (prod-verifiziert).
//
// Das `h-full` bleibt load-bearing: EntityDetailShell ist `h-full flex flex-col`.

export default function VersicherungenLayout({ children }: { children: ReactNode }) {
  return <div className="h-full">{children}</div>
}
