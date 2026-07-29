import { describe, it, expect } from 'vitest'
import { ZIELROLLE_TO_ENTITY } from '../freunde'

describe('ZIELROLLE_TO_ENTITY mapping', () => {
  it('werkstatt → werkstaetten.user_id', () => {
    expect(ZIELROLLE_TO_ENTITY.werkstatt).toEqual({ tabelle: 'werkstaetten', profilSpalte: 'user_id' })
  })
  it('gutachter → sachverstaendige.profile_id', () => {
    expect(ZIELROLLE_TO_ENTITY.gutachter).toEqual({ tabelle: 'sachverstaendige', profilSpalte: 'profile_id' })
  })
})
