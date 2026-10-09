import test from 'node:test'
import assert from 'node:assert/strict'
import { CHUCK_JOKES } from '../src/components/witchChuckJokes.js'
import { PAYER_JOKES } from '../src/components/witchPayerJokes.js'
import { CONTRACT_WISDOM } from '../src/components/witchContractWisdom.js'
import { OFFICE_WISDOM } from '../src/components/witchOfficeWisdom.js'
import {
  WITCH_JOKES, WITCH_WISDOM, localDateKey, getDailyWisdom,
  createShuffledJokeBag, restoreJokeBag, nextRandomDelay,
} from '../src/components/witchRotation.js'

test('exactly 300 distinct sayings in four categories', () => {
  assert.deepEqual(
    [CHUCK_JOKES.length, CONTRACT_WISDOM.length, PAYER_JOKES.length, OFFICE_WISDOM.length],
    [100, 100, 50, 50],
  )
  assert.equal(WITCH_JOKES.length, 150)
  assert.equal(WITCH_WISDOM.length, 150)
  const all = [...WITCH_JOKES, ...WITCH_WISDOM].map(entry => entry.text)
  assert.equal(all.length, 300)
  assert.equal(new Set(all).size, 300)
  for (const saying of all) {
    assert.equal(typeof saying, 'string')
    assert.ok(saying.length > 20)
  }
})

test('local daily wisdom stays stable and advances on the next day', () => {
  const morning = new Date(2026, 9, 9, 8, 0, 0)
  const evening = new Date(2026, 9, 9, 23, 45, 0)
  const nextDay = new Date(2026, 9, 10, 9, 0, 0)
  assert.equal(localDateKey(morning), '2026-10-09')
  assert.equal(localDateKey(evening), '2026-10-09')
  assert.equal(getDailyWisdom(morning).text, getDailyWisdom(evening).text)
  assert.notEqual(getDailyWisdom(morning).text, getDailyWisdom(nextDay).text)
})

test('shuffle bag visits 150 jokes exactly once', () => {
  const bag = createShuffledJokeBag(-1, () => 0.5)
  assert.equal(bag.length, 150)
  assert.equal(new Set(bag).size, 150)
  assert.deepEqual([...bag].sort((a, b) => a - b), Array.from({ length: 150 }, (_, index) => index))
})

test('new shuffle bag cannot immediately repeat the final joke of the old bag', () => {
  const prior = 99
  const bag = createShuffledJokeBag(prior, () => 0)
  assert.notEqual(bag[bag.length - 1], prior)
  assert.equal(new Set(bag).size, WITCH_JOKES.length)
})

test('stored joke bag is accepted only if all IDs are valid and unique', () => {
  assert.deepEqual(restoreJokeBag([1, 5, 8]), [1, 5, 8])
  assert.deepEqual(restoreJokeBag([5, 5]), [])
  assert.deepEqual(restoreJokeBag([-1, 12]), [])
  assert.deepEqual(restoreJokeBag([WITCH_JOKES.length]), [])
  assert.deepEqual(restoreJokeBag('not an array'), [])
})

test('automatic interval stays between 2 and 3 minutes', () => {
  assert.equal(nextRandomDelay(() => 0), 120000)
  assert.equal(nextRandomDelay(() => 0.5), 150000)
  assert.equal(nextRandomDelay(() => 0.999999), 180000)
})
