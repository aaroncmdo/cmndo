// KFZ-201: Central Communications Registry — Types

export type CommunicationChannel = 'whatsapp' | 'email' | 'whatsapp+email' | 'portal' | 'intern'
export type RecipientType = 'kunde' | 'sv' | 'kb' | 'admin' | 'kanzlei' | 'system'

export type TriggerConfig = {
  trigger_name: string
  channel: CommunicationChannel
  recipient: RecipientType
  t_number: number | null  // WhatsApp T-number
  whatsapp_template_name: string | null  // key in template-sids.ts
  has_attachment: boolean
  description: string
}
