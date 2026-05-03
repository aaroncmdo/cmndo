// KFZ-182 / AAR-775: Unread-Badges für Fall-Karten.
// Migriert auf shared DropletBadge-Primitive (Wassertropfen-Silhouette).
//  - Ondo-Blau = Chat-Nachrichten
//  - Danger-Rot = Updates / Tasks

import { DropletBadge } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'

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
      {chatCount > 0 && <DropletBadge count={chatCount} tone="ondo" />}
      {updateCount > 0 && <DropletBadge count={updateCount} tone="danger" />}
    </div>
  )
}

// Kleiner Notification-Tropfen oben rechts an der Karte — signalisiert
// "Neuigkeit hier" ohne Zahl. Spitze oben-rechts wie ein hängender Tropfen.
export function NotificationDot() {
  const size = 10
  return (
    <span
      className="absolute -top-1 -right-1"
      style={{
        width: size,
        height: size,
        borderRadius: `${tokens.radius.full}px ${size * 0.2}px ${tokens.radius.full}px ${tokens.radius.full}px`,
        backgroundColor: tokens.colors.danger,
        border: `2px solid ${tokens.colors.white}`,
      }}
    />
  )
}
