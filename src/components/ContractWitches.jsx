import React, { useEffect, useState } from 'react'
import './ContractWitches.css'

// Purely fictional jokes: never use this content as contract knowledge or as a decision source.
export const CONTRACT_WITCH_JOKES = [
  'Chuck Norris beantragt keine Genehmigung. Die Genehmigung beantragt Chuck Norris.',
  'Wenn Chuck Norris einen Vertragsbeitritt prüft, tritt der Vertrag freiwillig bei.',
  'Chuck Norris kennt alle LEGS. Auch die, die noch nicht erfunden wurden.',
  'Das Hilfsmittelverzeichnis sucht bei Chuck Norris nach seiner Nummer.',
  'Chuck Norris wartet nicht auf den eKVA. Der eKVA wartet auf Chuck Norris.',
  'Chuck Norris hat keine Fristen. Termine tragen sich selbst in seinen Kalender ein.',
  'Bei Chuck Norris wird jede Vertragsversion automatisch zur Vorversion.',
  'Chuck Norris liest keine Fußnoten. Die Fußnoten stellen sich freiwillig vor.',
  'Chuck Norris fragt nicht nach der PQ. Die PQ fragt nach Chuck Norris.',
  'Chuck Norris muss Vertragsanlagen nicht suchen. Sie heften sich selbst an.',
  'Wenn Chuck Norris eine Genehmigungsfreigrenze überschreitet, entschuldigt sich die Freigrenze.',
  'Eine Krankenkasse wollte Chuck Norris eine Rückfrage schicken. Jetzt hat sie selbst eine offene Frage.',
  'Chuck Norris kennt den Unterschied zwischen Vertragsposition und HMV-Code. Beide kennen seinen Namen.',
  'Bei Chuck Norris ist selbst die Prüfliste fertig, bevor man sie öffnet.',
]

const STORAGE_KEY = 'vn:contract-witches:enabled'
const FIRST_APPEARANCE_MS = 12000
const NEXT_APPEARANCE_MS = 43000
const SPEECH_DURATION_MS = 15000

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
      <span className="vn-hx-character-name">{isPurple ? 'Paragrafina' : 'Klausulina'}</span>
    </div>
  )
}

export default function ContractWitches() {
  const [enabled, setEnabled] = useState(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) !== 'off' }
    catch { return true }
  })
  const [scene, setScene] = useState({ index: 0, show: false })
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const first = window.setTimeout(() => setScene(s => ({ ...s, show: true })), FIRST_APPEARANCE_MS)
    const repeat = window.setInterval(
      () => setScene(s => ({ index: (s.index + 1) % CONTRACT_WITCH_JOKES.length, show: true })),
      NEXT_APPEARANCE_MS,
    )
    return () => { window.clearTimeout(first); window.clearInterval(repeat) }
  }, [enabled])

  useEffect(() => {
    if (!scene.show) return undefined
    const timeout = window.setTimeout(() => setScene(s => ({ ...s, show: false })), SPEECH_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [scene.show, scene.index])

  useEffect(() => {
    if (!scene.show) return undefined
    const joke = CONTRACT_WITCH_JOKES[scene.index]
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(joke.length)
      return undefined
    }
    setTyped(0)
    const timer = window.setInterval(
      () => setTyped(n => Math.min(joke.length, n + 2)),
      35,
    )
    return () => window.clearInterval(timer)
  }, [scene.show, scene.index])

  const switchEnabled = () => {
    const next = !enabled
    setEnabled(next)
    setScene(s => ({ ...s, show: next }))
    try { window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off') }
    catch { /* Still works if browser storage is disabled. */ }
  }

  const nextJoke = () => setScene(s => ({
    index: (s.index + 1) % CONTRACT_WITCH_JOKES.length,
    show: true,
  }))

  const joke = CONTRACT_WITCH_JOKES[scene.index]
  const speaker = scene.index % 2 === 0 ? 'Paragrafina' : 'Klausulina'

  return (
    <aside className="vn-hx-widget" aria-label="Vertragshexen – humorvolle Einlage">
      {enabled && scene.show && (
        <div className="vn-hx-stage">
          <div className="vn-hx-cast" aria-hidden="true">
            <div className="vn-hx-flight vn-hx-flight-left">
              <WitchOnBroom variant="paragrafina" speaking={speaker === 'Paragrafina'} />
            </div>
            <div className="vn-hx-flight vn-hx-flight-right">
              <WitchOnBroom variant="klausulina" speaking={speaker === 'Klausulina'} />
            </div>
          </div>
          <div className="vn-hx-bubble" role="group" aria-label={`${speaker} sagt: ${joke} Nur Spaß, keine Vertragsauskunft.`}>
            <div className="vn-hx-bubble-head">
              <strong>{speaker} schreibt …</strong>
              <button type="button" onClick={() => setScene(s => ({ ...s, show: false }))} aria-label="Spruch ausblenden" title="Spruch ausblenden">×</button>
            </div>
            <p aria-hidden="true">{joke.slice(0, typed)}<span className="vn-hx-cursor" aria-hidden="true">▍</span></p>
            <div className="vn-hx-bubble-bottom">
              <small>Hexenhumor · keine Vertragsauskunft</small>
              <button type="button" onClick={nextJoke}>Nächster Spruch ›</button>
            </div>
          </div>
        </div>
      )}
      <button
        className="vn-hx-launcher"
        type="button"
        aria-pressed={enabled}
        onClick={switchEnabled}
        title={enabled ? 'Vertragshexen dauerhaft ausschalten' : 'Vertragshexen einschalten'}
      >
        <span aria-hidden="true">✦</span> {enabled ? 'Vertragshexen: an' : 'Vertragshexen: aus'}
      </button>
    </aside>
  )
}
