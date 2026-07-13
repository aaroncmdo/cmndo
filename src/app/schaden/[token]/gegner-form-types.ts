// Plain module — NO 'use server'. Exported types must not come from a 'use server' file
// because the client bundle would receive undefined (AAR-664).

export type GegnerFormData = {
  name: string
  telefon?: string
  email?: string
  kennzeichen?: string
  fahrzeugtyp?: string
  versicherungId?: string // Gegner-Haftpflicht (versicherungen.id)
  schadennummer?: string
  hergang?: string // Unfallhergang-Text (evtl. Groq-diktiert)
  consent: boolean // DPIA-Consent-Checkbox
}
