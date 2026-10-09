/** Static fiction only; never a source for contractual decisions. */
import { CHUCK_JOKES } from './witchChuckJokes.js'
import { PAYER_JOKES } from './witchPayerJokes.js'
import { CONTRACT_WISDOM } from './witchContractWisdom.js'
import { OFFICE_WISDOM } from './witchOfficeWisdom.js'

export const WITCH_JOKES = [
  ...CHUCK_JOKES.map(text => ({ text, category: 'Chuck-Norris-Vertragswitz' })),
  ...PAYER_JOKES.map(text => ({ text, category: 'Krankenkassenhumor' })),
]
export const WITCH_WISDOM = [
  ...CONTRACT_WISDOM.map(text => ({ text, category: 'Vertragsweisheit' })),
  ...OFFICE_WISDOM.map(text => ({ text, category: 'Büroweisheit' })),
]

/** Local civil date, independent of the user's timezone offset. */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's wisdom is stable throughout the day and changes on the next date. */
export function getDailyWisdom(date = new Date()) {
  const utcDay = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
  const index = ((utcDay % WITCH_WISDOM.length) + WITCH_WISDOM.length) % WITCH_WISDOM.length
  return WITCH_WISDOM[index]
}

/** Shuffle bag: every joke is used before it repeats, including a distinct wrap-around. */
export function createShuffledJokeBag(previous = -1, random = Math.random) {
  const bag = Array.from({ length: WITCH_JOKES.length }, (_, index) => index)
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const picked = Math.floor(random() * (index + 1))
    ;[bag[index], bag[picked]] = [bag[picked], bag[index]]
  }
  if (bag.length > 1 && bag[bag.length - 1] === previous) {
    ;[bag[bag.length - 1], bag[bag.length - 2]] = [bag[bag.length - 2], bag[bag.length - 1]]
  }
  return bag
}

/** Recover browser-persisted remaining jokes without trusting malformed storage. */
export function restoreJokeBag(value) {
  if (!Array.isArray(value) || value.length > WITCH_JOKES.length) return []
  if (new Set(value).size !== value.length) return []
  return value.every(id => Number.isInteger(id) && id >= 0 && id < WITCH_JOKES.length) ? value : []
}

export function nextRandomDelay(random = Math.random) {
  return 120000 + Math.floor(random() * 60001)
}
