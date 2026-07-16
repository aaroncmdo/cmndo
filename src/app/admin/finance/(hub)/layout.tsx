// AAR-528 / Portal-Header P1: Finanzen-Hub Layout. Die Tab-Nav ist in die
// Header-Card der Hub-Page gewandert (FinanceHubShell) — hier bleibt nur der
// Full-Height-Container fuer die Client-State-Views + die Redirect-Stub-Routen.
export default function FinanceHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="h-full">{children}</div>
}
