// KFZ-182 Phase D: Unread-Badges für Fall-Karten.
// Blau (#4573A2) = Chat, Rot (#DC2626) = Updates/Tasks.
// Wenn beide > 0: zusätzlich kleiner roter Punkt am Karten-Rand.

export default function FallCardBadges({
  chatCount,
  updateCount,
}: {
  chatCount: number
  updateCount: number
}) {
  if (chatCount === 0 && updateCount === 0) return null

  return (
    <div className="flex items-center gap-1">
      {chatCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] bg-[#4573A2] text-white text-[9px] font-bold px-1 rounded-full">
          {chatCount > 99 ? '99+' : chatCount}
        </span>
      )}
      {updateCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] bg-[#DC2626] text-white text-[9px] font-bold px-1 rounded-full">
          {updateCount > 99 ? '99+' : updateCount}
        </span>
      )}
    </div>
  )
}

// Notification dot for card border — renders a small red dot at top-right of parent.
export function NotificationDot() {
  return (
    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#DC2626] rounded-full border-2 border-white" />
  )
}
