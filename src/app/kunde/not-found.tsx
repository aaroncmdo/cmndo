import EmptyState from '@/components/shared/EmptyState'

export default function KundeNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zur Übersicht', href: '/kunde', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
