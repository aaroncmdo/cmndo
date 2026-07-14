import type { ReactNode } from 'react'

// Der fruehere `drawer`-Parallel-Slot wurde ENTFERNT (Prod-Smoke 14.07.):
// Seit der Partner-Hub-Konsolidierung redirected /admin/organisationen (308) auf
// /admin/partner — die Liste lebt also in einem ANDEREN Route-Segment. Ein Klick
// dort ist eine Cross-Segment-Navigation, die den Intercept `@drawer/(.)[id]`
// NIE matcht. Der Drawer konnte damit nicht mehr feuern (auf prod verifiziert);
// die Full-Page [id]/page.tsx uebernimmt — fuer die edit-/tab-lastige Detail-View
// ohnehin das bessere Affordance.
//
// Das `h-full` bleibt load-bearing: EntityDetailShell ist `h-full flex flex-col`
// und kollabiert ohne vollhohen Parent.

export default function OrganisationenLayout({ children }: { children: ReactNode }) {
  return <div className="h-full">{children}</div>
}
