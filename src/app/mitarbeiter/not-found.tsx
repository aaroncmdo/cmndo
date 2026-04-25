import EmptyState from '@/components/shared/EmptyState'

export default function MitarbeiterNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zum Mitarbeiter-Portal', href: '/mitarbeiter', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
