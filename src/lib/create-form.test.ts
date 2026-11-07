import { expect, it } from 'vitest'
import { cleanName, normalizeName, splitNames, validateNames } from './create-form'

it('catches duplicate names despite case, outer space or repeated inner space', () => {
  expect(normalizeName('  ALEX  Smith\t')).toBe(normalizeName('Alex Smith'))
  expect(cleanName(' Alex\u00a0 Smith ')).toBe('Alex Smith')
  expect(validateNames(['Alex Smith',' alex  smith ','Casey','Devon'])).toContain('same name')
  expect(validateNames(['Alex','alex'])).toContain('same name')
  expect(validateNames(['Alex S','Alex R','Casey','Devon'])).toBeNull()
  expect(splitNames('Alex  Smith, Blair\nCasey')).toEqual(['Alex Smith','Blair','Casey'])
})
