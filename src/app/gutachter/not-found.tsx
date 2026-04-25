import EmptyState from '@/components/shared/EmptyState'

export default function GutachterNotFound() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          title="Seite nicht gefunden"
          description="Diese Gutachter-Seite existiert nicht oder wurde verschoben."
          action={{ label: 'Zum Gutachter-Portal', href: '/gutachter', variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
