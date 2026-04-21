// AAR-527 (A3): Partner-Hub Layout — Tab-Nav über 3 Sub-Views.
// Kein Route-Group nötig, weil /admin/partner komplett neu ist (keine
// konkurrierenden Sub-Routes, auf die die Tab-Nav ungewollt wirken würde).

import PartnerHubTabs from './PartnerHubTabs'

export default function PartnerHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 md:px-6">
        <PartnerHubTabs />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
