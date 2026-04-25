import EmptyState from '@/components/shared/EmptyState'

export default function AdminNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Admin-Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zum Admin-Dashboard', href: '/admin', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
