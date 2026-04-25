import EmptyState from '@/components/shared/EmptyState'

export default function KanzleiNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Kanzlei-Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zur Kanzlei-Übersicht', href: '/kanzlei', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
