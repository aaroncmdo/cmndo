// AAR-528 (A4): Finanzen-Hub Layout — Tab-Nav über 4 Sub-Views.
// Route Group (hub) schützt /admin/finance/provisionen und andere
// Ausnahmen vor der Tab-Nav.

import FinanceHubTabs from './FinanceHubTabs'

export default function FinanceHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6">
        <FinanceHubTabs />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
