
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookOpenText, Laugh, MoonStar, Sparkles, X, WandSparkles } from 'lucide-react'
import {
  WITCH_JOKES, WITCH_WISDOM, getDailyWisdom, localDateKey,
  createShuffledJokeBag, restoreJokeBag, nextRandomDelay,
} from './witchRotation.js'
import './ContractWitches.css'

// Decorative humor only. Does not interact with Supabase or contractual decisions.
const ENABLED_KEY = 'vn:contract-witches:enabled'
const DAILY_SEEN_KEY = 'vn:contract-witches:daily-seen-v2'
const JOKE_BAG_KEY = 'vn:contract-witches:remaining-jokes-v2'
const LAST_JOKE_KEY = 'vn:contract-witches:last-joke-v2'
const FIRST_APPEARANCE_MS = 12000
const SPEECH_DURATION_MS = 17000

export const CONTRACT_WITCH_JOKES = WITCH_JOKES.map(entry => entry.text)
export const CONTRACT_WITCH_WISDOM = WITCH_WISDOM.map(entry => entry.text)

// The approved PNG/WebP character artwork can be dropped into public/witches.
// A self-contained vector fallback is used while the image files are unavailable.
export const WITCH_ASSETS = Object.freeze({
  caro: 'witches/caro.webp',
  julie: 'witches/julie.webp',
  duo: 'witches/caro-julie.webp',
  flight: 'witches/caro-julie-flug.webp',
})
export const WITCH_SCENES = Object.freeze(['caro', 'julie', 'duo', 'flight'])

function readStorage(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value) } catch { /* private mode */ }
}

/** Deterministic sequence: solo Caro, solo Julie, standing together, flying together. */
export function nextWitchScene(previousIndex = -1) {
  const index = (previousIndex + 1) % WITCH_SCENES.length
  return { index, variant: WITCH_SCENES[index] }
}

function VectorWitch({ name }) {
  const caro = name === 'Caro'
  const hair = caro ? '#ec8a37' : '#ecca75'
  const coat = caro ? '#66338d' : '#168b91'
  const hat = caro ? '#512368' : '#155c66'
  const outline = caro ? '#432451' : '#234451'
  return (
    <svg className="vn-witch-vector" viewBox="0 0 170 196" role="img" aria-label={name + ' auf dem Besen'} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="86" cy="188" rx="65" ry="5" fill="#e8dfe6"/>
      <path d="M14 170 154 149" stroke="#926039" strokeWidth="6" strokeLinecap="round"/>
      <path d="M14 159 2 171 17 184 27 167 Z" fill="#d5ab65"/>
      <path d="M9 161 6 177 M15 160 16 181 M21 160 24 175" stroke="#9b6a38" strokeWidth="2"/>
      <path d="M62 130 53 154 42 155 M102 130 112 158 122 157" fill="none" stroke={outline} strokeWidth="13" strokeLinecap="round"/>
      <path d="M53 152 41 160 M112 155 125 164" fill="none" stroke={hat} strokeWidth="15" strokeLinecap="round"/>
      <path d="M47 103 Q85 85 115 101 L129 141 Q85 157 35 137 Z" fill={coat} stroke={outline} strokeWidth="2"/>
      <path d="M68 105 78 142 91 143 101 105" fill={caro ? '#be9add' : '#75c9c1'}/>
      <path d="M50 112 33 135 M113 113 130 129" fill="none" stroke={coat} strokeWidth="20" strokeLinecap="round"/>
      <path d="M31 134 22 139 M130 129 143 135" fill="none" stroke="#f5c6a3" strokeWidth="9" strokeLinecap="round"/>
      <path d="M52 111 Q46 83 52 62 Q40 32 66 22 Q102 7 115 48 Q134 84 116 121" fill={hair}/>
      <ellipse cx="85" cy="79" rx="29" ry="32" fill="#f8cbaa" stroke="#db9f80" strokeWidth="1.4"/>
      <path d="M55 70 Q45 42 64 36 Q98 22 114 55 Q104 39 78 49 Q65 60 55 70Z" fill={hair}/>
      <path d="M72 75 Q79 70 85 77" fill="none" stroke={outline} strokeWidth="2.7" strokeLinecap="round"/>
      <circle cx="99" cy="77" r="3.7" fill="#223343"/>
      <path d="M79 94 Q92 103 103 93" fill="none" stroke="#b45c66" strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="67" cy="91" r="4" fill="#edb6a1" opacity=".7"/>
      <circle cx="109" cy="89" r="4" fill="#edb6a1" opacity=".7"/>
      <path d="M50 49 81 5 102 6 106 41" fill={hat} stroke={outline} strokeWidth="2"/>
      <path d="M43 49 Q84 65 129 50" fill="none" stroke={hat} strokeWidth="16" strokeLinecap="round"/>
      <path d="M54 48 116 52" fill="none" stroke={outline} strokeWidth="4" strokeLinecap="round"/>
      <path d="m105 24 5 9 10-4-7 10 5 6-11-1-5 8-2-12-8-4 11-3Z" fill="#f4ca69"/>
      <circle cx="86" cy="116" r="7" fill="#f7d37c" stroke={outline} strokeWidth="2"/>
      <path d="M68 113 Q85 126 104 113" fill="none" stroke="#f6d39d" strokeWidth="2"/>
      <path d="M132 120 148 97" stroke="#8b6847" strokeWidth="3" strokeLinecap="round"/>
      <path d="M144 98 151 86 157 100" fill="#fbf0cb" stroke="#b89773" strokeWidth="1.5"/>
      <path d="m132 23 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill={caro?'#c88add':'#69d2d1'} />
    </svg>
  )
}

function CharacterImage({ name, image, className = '' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [image])
  const base = import.meta.env.BASE_URL || '/'
  if (failed) return <span className={'vn-hx-fallback ' + className}><VectorWitch name={name}/></span>
  return (
    <img
      className={'vn-hx-character-image ' + className}
      src={base + WITCH_ASSETS[image]}
      alt={image === 'caro' || image === 'julie' ? name + ' als Vertragshexe' : 'Caro und Julie als Vertragshexen'}
      loading="eager"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

function CharacterStage({ scene, reducedMotion }) {
  const variant = scene.variant
  const duo = variant === 'duo' || variant === 'flight'
  const label = variant === 'caro' ? 'Caro' : variant === 'julie' ? 'Julie' : 'Caro und Julie'
  return (
    <motion.div
      className={'vn-hx-character-stage vn-hx-mode-' + variant}
      key={'witch-stage-' + scene.sequence}
      initial={reducedMotion ? false : { opacity: 0, x: variant === 'julie' ? 90 : -90, y: 20, rotate: variant === 'flight' ? -8 : 0 }}
      animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: variant === 'julie' ? 70 : -70, y: -12, scale: 0.9 }}
      transition={{ duration: reducedMotion ? 0 : 0.75, ease: [0.2, 0.8, 0.2, 1] }}
      aria-label={label}
    >
      <div className="vn-hx-character-float">
        <CharacterImage name={label} image={variant}/>
      </div>
      {!reducedMotion && <div className="vn-hx-magic vn-hx-magic-a" aria-hidden="true">✦</div>}
      {!reducedMotion && <div className="vn-hx-magic vn-hx-magic-b" aria-hidden="true">✧</div>}
    </motion.div>
  )
}

function SpeechCard({ scene, kindLabel, message, reducedMotion, onClose, onWisdom, onJoke }) {
  const duo = scene.variant === 'duo' || scene.variant === 'flight'
  const speaker = duo ? 'Caro & Julie' : scene.variant === 'caro' ? 'Caro' : 'Julie'
  const isJulie = scene.variant === 'julie'
  return (
    <motion.section
      className={'vn-hx-card ' + (isJulie ? 'vn-hx-card-teal' : 'vn-hx-card-purple')}
      key={'witch-card-' + scene.sequence}
      role="group"
      aria-label={speaker + ': ' + kindLabel}
      initial={reducedMotion ? false : { opacity: 0, y: 18, scale: .95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 9, scale: .97 }}
      transition={{ duration: reducedMotion ? 0 : .32, delay: reducedMotion ? 0 : .16 }}
    >
      <div className="vn-hx-card-head">
        <span className="vn-hx-name-pill"><MoonStar size={17} aria-hidden="true" />{speaker}<Sparkles size={14} aria-hidden="true"/></span>
        <button type="button" className="vn-hx-icon-button" onClick={onClose} aria-label="Vertragshexen ausblenden" title="Ausblenden"><X size={17} /></button>
      </div>
      <div className="vn-hx-subtitle">{kindLabel}</div>
      <p className="vn-hx-message">{message}</p>
      <p className="vn-hx-disclaimer">Nur Humor · keine Vertragsauskunft</p>
      <div className="vn-hx-card-actions">
        <button type="button" className="vn-hx-action-primary" onClick={onWisdom}><BookOpenText size={16} aria-hidden="true"/> Tagesweisheit</button>
        <button type="button" className="vn-hx-action-secondary" onClick={onJoke}><Laugh size={16} aria-hidden="true"/> Nächster Witz</button>
      </div>
    </motion.section>
  )
}

export default function ContractWitches() {
  const reducedMotion = useReducedMotion()
  const [enabled, setEnabled] = useState(() => readStorage(ENABLED_KEY) !== 'off')
  const [scene, setScene] = useState({ visible: false, entry: null, kind: 'joke', variant: 'caro', sceneIndex: -1, sequence: 0 })
  const remainingJokes = useRef(null)
  const lastJokeIndex = useRef(null)

  const takeJoke = useCallback(() => {
    if (lastJokeIndex.current === null) {
      const previousRaw = readStorage(LAST_JOKE_KEY)
      const previous = previousRaw === null ? -1 : Number(previousRaw)
      lastJokeIndex.current = Number.isInteger(previous) && previous >= 0 && previous < WITCH_JOKES.length ? previous : -1
    }
    if (remainingJokes.current === null) {
      let recovered
      try { recovered = JSON.parse(readStorage(JOKE_BAG_KEY) || 'null') } catch { recovered = null }
      remainingJokes.current = restoreJokeBag(recovered)
    }
    if (remainingJokes.current.length === 0) remainingJokes.current = createShuffledJokeBag(lastJokeIndex.current)
    const index = remainingJokes.current.pop()
    lastJokeIndex.current = index
    writeStorage(LAST_JOKE_KEY, String(index))
    writeStorage(JOKE_BAG_KEY, JSON.stringify(remainingJokes.current))
    return WITCH_JOKES[index]
  }, [])

  const displayEntry = useCallback((entry, kind) => {
    setScene(previous => {
      const next = nextWitchScene(previous.sceneIndex)
      return { entry, kind, visible: true, sequence: previous.sequence + 1, variant: next.variant, sceneIndex: next.index }
    })
  }, [])

  const showJoke = useCallback(() => displayEntry(takeJoke(), 'joke'), [takeJoke, displayEntry])
  const showWisdom = useCallback(() => {
    writeStorage(DAILY_SEEN_KEY, localDateKey())
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

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    setScene(previous => ({ ...previous, visible: false }))
    writeStorage(ENABLED_KEY, next ? 'on' : 'off')
  }

  const hideScene = () => setScene(previous => ({ ...previous, visible: false }))
  const kindLabel = scene.kind === 'wisdom' ? 'Weisheit des Tages' : scene.entry?.category || 'Vertragswitz'
  return (
    <aside className="vn-hx-widget" aria-label="Caro und Julie – humorvolle Vertragshexen">
      <AnimatePresence mode="wait">
        {enabled && scene.visible && scene.entry && (
          <motion.div className="vn-hx-panel" key={'witch-panel-' + scene.sequence}
            initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : .2 }}>
            <CharacterStage scene={scene} reducedMotion={reducedMotion}/>
            <SpeechCard scene={scene} kindLabel={kindLabel} message={scene.entry.text}
              reducedMotion={reducedMotion} onClose={hideScene} onWisdom={showWisdom} onJoke={showJoke}/>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="vn-hx-footer-controls">
        {enabled && !scene.visible && (
          <button type="button" className="vn-hx-open-button" onClick={showAutomatic} aria-label="Caro und Julie öffnen">
            <WandSparkles size={14} aria-hidden="true" /> Spruch anzeigen
          </button>
        )}
        <button type="button" className="vn-hx-launcher" aria-pressed={enabled} onClick={toggleEnabled}
          title={enabled ? 'Caro und Julie dauerhaft ausschalten' : 'Caro und Julie einschalten'}>
          <Sparkles size={15} aria-hidden="true"/> {enabled ? 'Caro & Julie: an' : 'Caro & Julie: aus'}
        </button>
      </div>
    </aside>
  )
}
