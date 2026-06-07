// AAR-939 · Monika-A-Flow · PURE Step-Graph (framework-neutral, vitest-getestet).
// Jeder Step: messages[] (Monika-Chunks, sequentiell getippt) + EIN `then`.
// Routing steckt in option.next. Keine DOM-Abhaengigkeit.

export type Anliegen = 'schadensberatung' | 'haftpflichtgutachten' | 'wertgutachten' | 'gegengutachten'
export type Unfalltyp = 'auffahrunfall' | 'spurwechsel' | 'vorfahrt' | 'parken' | 'sonstiges'
export type SchuldEinschaetzung = 'unverschuldet' | 'nicht_sicher'
export type Bewertungsgrund = 'reparatur' | 'verkauf'
export type WunschTag = 'morgen' | 'uebermorgen' | 'asap'
export type WunschZeit = 'vormittag' | 'nachmittag' | 'abend'

export interface Answers {
  anliegen?: Anliegen
  unfalltyp?: Unfalltyp
  schuld_einschaetzung?: SchuldEinschaetzung
  bewertungsgrund?: Bewertungsgrund
  wunsch_tag?: WunschTag
  wunsch_zeit?: WunschZeit
  vorname?: string
  nachname?: string
  telefon?: string
}

export type AnswerKey = keyof Answers

export type StepId =
  | 'start' | 'beratung' | 'gegen' | 'kontakt'
  | 'hp_unfalltyp' | 'hp_schuld' | 'hp_unsicher' | 'hp_termin_tag' | 'hp_termin_zeit' | 'hp_kapazitaet'
  | 'wert_grund' | 'wert_termin_tag' | 'wert_termin_zeit' | 'wert_kontakt'

export interface ChoiceOption { value: string; label: string; next: StepId }
export interface ActionDef {
  kind: 'call' | 'whatsapp' | 'callback'
  label: string
  next?: StepId // callback → Folge-Step (Kontakt); call/whatsapp = Deeplink, kein next
}
export type StepThen =
  | { kind: 'choices'; key: AnswerKey; options: ChoiceOption[] }
  | { kind: 'actions'; actions: ActionDef[] }
  | { kind: 'contact'; next: StepId } // sammelt vorname/nachname/telefon → Renderer ruft submit
  | { kind: 'submit' } // terminal (reserviert)

export interface Step {
  id: StepId
  messages: string[]
  then: StepThen
}

export const START_STEP: StepId = 'start'

export const SCRIPT: Record<StepId, Step> = {
  start: {
    id: 'start',
    messages: ['Hi, grüße Sie! 👋', 'Ich bin Monika, Ihre Schadenberaterin bei Claimondo. 😊', 'Wie kann ich Ihnen schnell weiterhelfen?'],
    then: {
      kind: 'choices', key: 'anliegen',
      options: [
        { value: 'schadensberatung', label: 'Schadensberatung', next: 'beratung' },
        { value: 'haftpflichtgutachten', label: 'Haftpflichtschaden', next: 'hp_unfalltyp' },
        { value: 'wertgutachten', label: 'Wertgutachten', next: 'wert_grund' },
        { value: 'gegengutachten', label: 'Gegengutachten', next: 'gegen' },
      ],
    },
  },

  // ── Pfad 1: Schadensberatung ──
  beratung: {
    id: 'beratung',
    messages: ['Gerne berate ich Sie kurz. 📞', 'Möchten Sie direkt anrufen oder lieber zurückgerufen werden?'],
    then: {
      kind: 'actions',
      actions: [
        { kind: 'call', label: 'Jetzt anrufen' },
        { kind: 'callback', label: 'Rückruf anfordern', next: 'kontakt' },
      ],
    },
  },

  // ── Pfad 2: Haftpflichtschaden ──
  hp_unfalltyp: {
    id: 'hp_unfalltyp',
    messages: ['Das tut mir leid. Ich hoffe, Sie sind unversehrt. 🙏', 'Was für ein Unfall war es?'],
    then: {
      kind: 'choices', key: 'unfalltyp',
      options: [
        { value: 'auffahrunfall', label: 'Auffahrunfall', next: 'hp_schuld' },
        { value: 'spurwechsel', label: 'Spurwechsel', next: 'hp_schuld' },
        { value: 'vorfahrt', label: 'Vorfahrt', next: 'hp_schuld' },
        { value: 'parken', label: 'Beim Parken', next: 'hp_schuld' },
        { value: 'sonstiges', label: 'Sonstiges', next: 'hp_schuld' },
      ],
    },
  },
  hp_schuld: {
    id: 'hp_schuld',
    messages: ['Und wie ist die Schuldfrage?'],
    then: {
      kind: 'choices', key: 'schuld_einschaetzung',
      options: [
        { value: 'unverschuldet', label: 'Unverschuldet', next: 'hp_termin_tag' },
        { value: 'nicht_sicher', label: 'Nicht sicher', next: 'hp_unsicher' },
      ],
    },
  },
  hp_unsicher: {
    id: 'hp_unsicher',
    messages: ['Kein Problem, das klären wir gemeinsam. 😊', 'Am schnellsten direkt am Telefon, oder ich rufe Sie zurück.'],
    then: {
      kind: 'actions',
      actions: [
        { kind: 'call', label: 'Jetzt anrufen' },
        { kind: 'whatsapp', label: 'Per WhatsApp' },
        { kind: 'callback', label: 'Rückruf anfordern', next: 'kontakt' },
      ],
    },
  },
  hp_termin_tag: {
    id: 'hp_termin_tag',
    messages: ['Gut. Bei einem unverschuldeten Unfall tragen Anwalt, Gutachter und Mietwagen die Gegenseite. 😊', 'Wann passt Ihnen ein Termin?'],
    then: {
      kind: 'choices', key: 'wunsch_tag',
      options: [
        { value: 'morgen', label: 'Morgen', next: 'hp_termin_zeit' },
        { value: 'uebermorgen', label: 'Übermorgen', next: 'hp_termin_zeit' },
        { value: 'asap', label: 'So schnell wie möglich', next: 'hp_termin_zeit' },
      ],
    },
  },
  hp_termin_zeit: {
    id: 'hp_termin_zeit',
    messages: ['Und welche Tageszeit?'],
    then: {
      kind: 'choices', key: 'wunsch_zeit',
      options: [
        { value: 'vormittag', label: 'Vormittag', next: 'hp_kapazitaet' },
        { value: 'nachmittag', label: 'Nachmittag', next: 'hp_kapazitaet' },
        { value: 'abend', label: 'Abend', next: 'hp_kapazitaet' },
      ],
    },
  },
  hp_kapazitaet: {
    id: 'hp_kapazitaet',
    messages: ['Einen Moment… ✅', 'Der Gutachter hat zu der Zeit Kapazität.', 'Wie darf ich Sie erreichen?'],
    then: { kind: 'contact', next: 'start' },
  },

  // ── Pfad 3: Wertgutachten ──
  wert_grund: {
    id: 'wert_grund',
    messages: ['Gerne! Geht es um eine Reparatur oder einen Verkauf?'],
    then: {
      kind: 'choices', key: 'bewertungsgrund',
      options: [
        { value: 'reparatur', label: 'Reparatur', next: 'wert_termin_tag' },
        { value: 'verkauf', label: 'Verkauf', next: 'wert_termin_tag' },
      ],
    },
  },
  wert_termin_tag: {
    id: 'wert_termin_tag',
    messages: ['Wann passt Ihnen ein Termin?'],
    then: {
      kind: 'choices', key: 'wunsch_tag',
      options: [
        { value: 'morgen', label: 'Morgen', next: 'wert_termin_zeit' },
        { value: 'uebermorgen', label: 'Übermorgen', next: 'wert_termin_zeit' },
        { value: 'asap', label: 'So schnell wie möglich', next: 'wert_termin_zeit' },
      ],
    },
  },
  wert_termin_zeit: {
    id: 'wert_termin_zeit',
    messages: ['Welche Tageszeit?'],
    then: {
      kind: 'choices', key: 'wunsch_zeit',
      options: [
        { value: 'vormittag', label: 'Vormittag', next: 'wert_kontakt' },
        { value: 'nachmittag', label: 'Nachmittag', next: 'wert_kontakt' },
        { value: 'abend', label: 'Abend', next: 'wert_kontakt' },
      ],
    },
  },
  wert_kontakt: {
    id: 'wert_kontakt',
    messages: ['Top. Wie darf ich Sie erreichen?'],
    then: { kind: 'contact', next: 'start' },
  },

  // ── Pfad 4: Gegengutachten ──
  gegen: {
    id: 'gegen',
    messages: ['Für ein Gegengutachten rufe ich Sie am besten zurück.'],
    then: { kind: 'actions', actions: [{ kind: 'callback', label: 'Rückruf anfordern', next: 'kontakt' }] },
  },

  // ── Geteilter Kontakt-Step (Pfade 1, 2-unsicher, 4) ──
  kontakt: {
    id: 'kontakt',
    messages: ['Wie darf ich Sie erreichen?'],
    then: { kind: 'contact', next: 'start' },
  },
}

export interface Bubble {
  role: 'monika' | 'user'
  text: string
}
