import EmptyState from '@/components/shared/EmptyState'

export default function DispatchNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Dispatch-Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zum Dispatch-Dashboard', href: '/dispatch/dashboard', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
