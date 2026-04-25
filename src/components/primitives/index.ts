// AAR-769 Phase 2 / AAR-806: Barrel-Export für alle Primitives.
// Consumer: import { Box, Card, Button, Modal } from '@/components/primitives'
//
// AAR-806: BackButton (0 Consumer) und Sheet (0 Consumer, Use-Case durch
// Modal placement='bottom-sheet' abgedeckt) entfernt.

export { Box } from './Box'
export type { BoxProps } from './Box'

export { Stack } from './Stack'
export type { StackProps } from './Stack'

export { Row } from './Row'
export type { RowProps } from './Row'

export { Text } from './Text'
export type { TextProps } from './Text'

export { Card } from './Card'
export type { CardProps } from './Card'

export { Button } from './Button'
export type { ButtonProps } from './Button'

export { Icon } from './Icon'
export type { IconProps } from './Icon'

export { Badge } from './Badge'
export type { BadgeProps } from './Badge'

export { DropletBadge } from './DropletBadge'
export type { DropletBadgeProps } from './DropletBadge'

export { CloseButton } from './CloseButton'
export type { CloseButtonProps } from './CloseButton'

export { Modal } from './Modal'
export type { ModalProps } from './Modal'

export { Drawer } from './Drawer'
export type { DrawerProps } from './Drawer'
