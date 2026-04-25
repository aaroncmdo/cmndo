import EmptyState from '@/components/shared/EmptyState'

export default function MaklerNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Makler-Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zum Makler-Portal', href: '/makler', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
