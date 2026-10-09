import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  WITCH_JOKES, WITCH_WISDOM, getDailyWisdom, localDateKey,
  createShuffledJokeBag, restoreJokeBag, nextRandomDelay,
} from './witchRotation.js'
import './ContractWitches.css'

// All messages are fictional humor; no Supabase access, legal conclusions or contract claims.
const ENABLED_KEY = 'vn:contract-witches:enabled'
const DAILY_SEEN_KEY = 'vn:contract-witches:daily-seen-v2'
const JOKE_BAG_KEY = 'vn:contract-witches:remaining-jokes-v2'
const LAST_JOKE_KEY = 'vn:contract-witches:last-joke-v2'
const FIRST_APPEARANCE_MS = 12000
const SPEECH_DURATION_MS = 17000
export const CONTRACT_WITCH_JOKES = WITCH_JOKES.map(entry => entry.text)
export const CONTRACT_WITCH_WISDOM = WITCH_WISDOM.map(entry => entry.text)

function readStorage(key) {
  try { return window.localStorage.getItem(key) }
  catch { return null }
}
function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value) }
  catch { /* Browser privacy settings must not break the widget. */ }
}

function WitchOnBroom({ variant, speaking }) {
  const isPurple = variant === 'paragrafina'
  const coat = isPurple ? '#763a87' : '#147e81'
  const hat = isPurple ? '#4b245e' : '#15535d'
  const hair = isPurple ? '#ed9b4f' : '#b7bddb'

  return (
    <div className={`vn-hx-character ${speaking ? 'vn-hx-speaking' : ''}`}>
      <div className="vn-hx-hover">
        <svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
          <path d="M15 78 L120 80" stroke="#745137" strokeWidth="5" strokeLinecap="round" />
          <path d="M114 70 L137 76 L131 89 L111 83 Z" fill="#d7a453" />
          <path d="M115 72 L134 73 M115 77 L136 80 M114 83 L131 87" stroke="#986a35" strokeWidth="2" />
          <path d="M58 65 L49 79 L41 78 M78 65 L85 81 L91 81" fill="none" stroke="#302f43" strokeWidth="7" strokeLinecap="round" />
          <path d="M44 37 Q54 41 49 54 L35 72 Q65 68 99 75 L84 43 Z" fill={coat} />
          <path d="M49 48 Q62 39 77 48 L90 72 L48 72 Z" fill={hat} />
          <path d="M46 22 Q39 32 43 47 L52 51 L56 21 Z" fill={hair} />
          <path d="M78 21 Q90 30 88 46 L77 50 L73 20 Z" fill={hair} />
          <circle cx="65" cy="34" r="15" fill="#f5c49e" />
          <path d="M62 33 L64 34 M73 33 L75 34" stroke="#29323d" strokeWidth="2" strokeLinecap="round" />
          <path d="M66 40 Q71 44 76 39" fill="none" stroke="#954b52" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M64 7 L50 28 L86 28 L73 7 Z" fill={hat} />
          <path d="M50 25 Q70 30 91 26" fill="none" stroke={hat} strokeWidth="6" strokeLinecap="round" />
          <path d="M58 20 L81 23" stroke="#ebc267" strokeWidth="3" strokeLinecap="round" />
          <path d="M78 48 Q94 54 99 73" stroke="#f5c49e" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M100 73 L105 67" stroke="#f5c49e" strokeWidth="5" strokeLinecap="round" />
          <path d="M105 65 L116 53" stroke="#806a54" strokeWidth="2" />
          <path d="M109 61 L118 48 L116 61 Z" fill="#edf5ea" />
          <path d="M50 48 Q37 57 40 70" stroke="#f5c49e" strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="39" cy="73" r="4" fill="#f5c49e" />
        </svg>
      </div>
      <span className="vn-hx-character-name">{isPurple ? 'Caro' : 'Julie'}</span>
    </div>
  )
}

export default function ContractWitches() {
  const [enabled, setEnabled] = useState(() => readStorage(ENABLED_KEY) !== 'off')
  const [scene, setScene] = useState({ visible: false, entry: null, kind: 'joke', speaker: 'Julie', sequence: 0 })
  const [typed, setTyped] = useState(0)
  const remainingJokes = useRef(null)
  const lastJokeIndex = useRef(null)

  const takeJoke = useCallback(() => {
    if (lastJokeIndex.current === null) {
      const previous = Number(readStorage(LAST_JOKE_KEY))
      lastJokeIndex.current = Number.isInteger(previous) && previous >= 0 && previous < WITCH_JOKES.length ? previous : -1
    }
    if (remainingJokes.current === null) {
      let recovered
      try { recovered = JSON.parse(readStorage(JOKE_BAG_KEY) || 'null') }
      catch { recovered = null }
      remainingJokes.current = restoreJokeBag(recovered)
    }
    if (remainingJokes.current.length === 0) {
      remainingJokes.current = createShuffledJokeBag(lastJokeIndex.current)
    }
    const index = remainingJokes.current.pop()
    lastJokeIndex.current = index
    writeStorage(LAST_JOKE_KEY, String(index))
    writeStorage(JOKE_BAG_KEY, JSON.stringify(remainingJokes.current))
    return WITCH_JOKES[index]
  }, [])

  const displayEntry = useCallback((entry, kind) => {
    setScene(previous => ({
      entry, kind, visible: true, sequence: previous.sequence + 1,
      speaker: previous.speaker === 'Caro' ? 'Julie' : 'Caro',
    }))
  }, [])

  const showJoke = useCallback(() => displayEntry(takeJoke(), 'joke'), [takeJoke, displayEntry])

  const showWisdom = useCallback(() => {
    const date = localDateKey()
    writeStorage(DAILY_SEEN_KEY, date)
    displayEntry(getDailyWisdom(), 'wisdom')
  }, [displayEntry])

  const showAutomatic = useCallback(() => {
    if (document.visibilityState === 'hidden') return
    if (readStorage(DAILY_SEEN_KEY) !== localDateKey()) showWisdom()
    else showJoke()
  }, [showJoke, showWisdom])

  useEffect(() => {
    if (!enabled) return undefined
    let timeout
    const schedule = delay => {
      timeout = window.setTimeout(() => {
        showAutomatic()
        schedule(nextRandomDelay())
      }, delay)
    }
    schedule(FIRST_APPEARANCE_MS)
    return () => window.clearTimeout(timeout)
  }, [enabled, showAutomatic])

  useEffect(() => {
    if (!scene.visible) return undefined
    const timeout = window.setTimeout(
      () => setScene(previous => ({ ...previous, visible: false })),
      SPEECH_DURATION_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [scene.visible, scene.sequence])

  useEffect(() => {
    if (!scene.visible || !scene.entry) return undefined
    const message = scene.entry.text
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(message.length)
      return undefined
    }
    setTyped(0)
    const timer = window.setInterval(() => {
      setTyped(previous => {
        if (previous + 2 >= message.length) {
          window.clearInterval(timer)
          return message.length
        }
        return previous + 2
      })
    }, 35)
    return () => window.clearInterval(timer)
  }, [scene.visible, scene.sequence, scene.entry])

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    setScene(previous => ({ ...previous, visible: false }))
    writeStorage(ENABLED_KEY, next ? 'on' : 'off')
  }

  const kindLabel = scene.kind === 'wisdom' ? 'Weisheit des Tages' : scene.entry?.category || 'Vertragswitz'
  return (
    <aside className="vn-hx-widget" aria-label="Caro und Julie – humorvolle Vertragshexen">
      {enabled && scene.visible && scene.entry && (
        <div className="vn-hx-stage">
          <div className="vn-hx-cast" aria-hidden="true">
            <div className="vn-hx-flight vn-hx-flight-left">
              <WitchOnBroom variant="paragrafina" speaking={scene.speaker === 'Caro'} />
            </div>
            <div className="vn-hx-flight vn-hx-flight-right">
              <WitchOnBroom variant="klausulina" speaking={scene.speaker === 'Julie'} />
            </div>
          </div>
          <div className="vn-hx-bubble" role="group" aria-label={`${scene.speaker}: ${kindLabel}. ${scene.entry.text} Humor, keine Vertragsauskunft.`}>
            <div className="vn-hx-bubble-head">
              <strong>{scene.speaker} · {kindLabel}</strong>
              <button type="button" onClick={() => setScene(previous => ({ ...previous, visible: false }))} aria-label="Spruch ausblenden" title="Spruch ausblenden">×</button>
            </div>
            <p aria-hidden="true">{scene.entry.text.slice(0, typed)}<span className="vn-hx-cursor" aria-hidden="true">▍</span></p>
            <div className="vn-hx-bubble-bottom">
              <small>Nur Humor · keine Vertragsauskunft</small>
              <div className="vn-hx-actions">
                <button type="button" onClick={showWisdom} aria-label="Weisheit des Tages anzeigen">Tagesweisheit</button>
                <button type="button" onClick={showJoke}>Nächster Witz ›</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        className="vn-hx-launcher"
        type="button"
        aria-pressed={enabled}
        onClick={toggleEnabled}
        title={enabled ? 'Caro und Julie dauerhaft ausschalten' : 'Caro und Julie einschalten'}
      >
        <span aria-hidden="true">✦</span> {enabled ? 'Caro & Julie: an' : 'Caro & Julie: aus'}
      </button>
    </aside>
  )
}
