// Route-Segment-Loading-State (Suspense-Fallback fuers Root-Segment).
export default function Loading() {
  return (
    <div className="container-narrow flex min-h-[50vh] items-center justify-center px-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-au-sand-dark border-t-au-amber"
        role="status"
        aria-label="Lädt …"
      />
    </div>
  )
}
