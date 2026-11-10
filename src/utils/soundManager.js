// Shared sound effects for every game. Files are decoded without an audio
// context so nothing touches the output device until the first user gesture,
// which is what browser autoplay rules require.
const MUTE_KEY = 'game_sound_muted'
const MASTER_VOLUME = 0.8
const MAX_VOICES = 14
const DEFAULT_MIN_INTERVAL_MS = 20
const MIN_INTERVAL_MS = { peg: 40, tick: 30, draw: 30 }

const buffers = new Map()
const loading = new Map()
const lastPlayed = new Map()
const listeners = new Set()

let context = null
let masterGain = null
let decoder = null
let activeVoices = 0
let muted = readStoredMute()
let unlockInstalled = false

function readStoredMute() {
    try {
        return localStorage.getItem(MUTE_KEY) === '1'
    } catch {
        return false
    }
}

function getAudioConstructor() {
    if (typeof window === 'undefined') return null
    return window.AudioContext || window.webkitAudioContext || null
}

function unlock() {
    const AudioContextClass = getAudioConstructor()
    if (!AudioContextClass) return
    if (!context) {
        context = new AudioContextClass()
        masterGain = context.createGain()
        masterGain.gain.value = muted ? 0 : MASTER_VOLUME
        masterGain.connect(context.destination)
    }
    if (context.state === 'suspended') context.resume().catch(() => {})
}

function installUnlock() {
    if (unlockInstalled || typeof window === 'undefined') return
    unlockInstalled = true
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true })
    window.addEventListener('keydown', unlock, { capture: true })
}

function getDecoder() {
    if (decoder) return decoder
    const Offline = typeof window === 'undefined'
        ? null
        : window.OfflineAudioContext || window.webkitOfflineAudioContext
    decoder = Offline ? new Offline(1, 1, 44100) : null
    return decoder
}

async function load(name) {
    if (buffers.has(name)) return buffers.get(name)
    if (loading.has(name)) return loading.get(name)

    const offline = getDecoder()
    if (!offline) return null

    const task = fetch(`/sounds/${name}.mp3`)
        .then((response) => {
            if (!response.ok) throw new Error(`Missing sound: ${name}`)
            return response.arrayBuffer()
        })
        .then((data) => offline.decodeAudioData(data))
        .then((buffer) => {
            buffers.set(name, buffer)
            return buffer
        })
        .catch(() => null) // Sound must never be able to break a game.
        .finally(() => loading.delete(name))

    loading.set(name, task)
    return task
}

export function preloadSounds(names = []) {
    installUnlock()
    names.forEach((name) => { load(name) })
}

export function playSound(name, { volume = 1, rate = 1 } = {}) {
    installUnlock()
    if (muted) return

    const buffer = buffers.get(name)
    if (!buffer) {
        load(name)
        return
    }
    if (!context || context.state !== 'running' || activeVoices >= MAX_VOICES) return

    const now = performance.now()
    const interval = MIN_INTERVAL_MS[name] ?? DEFAULT_MIN_INTERVAL_MS
    if (now - (lastPlayed.get(name) ?? -Infinity) < interval) return
    lastPlayed.set(name, now)

    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    source.playbackRate.value = rate
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(masterGain)
    activeVoices++
    source.onended = () => {
        activeVoices--
        source.disconnect()
        gain.disconnect()
    }
    source.start()
}

export function isSoundMuted() {
    return muted
}

export function setSoundMuted(next) {
    muted = Boolean(next)
    try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
        // Private browsing can block storage; the toggle still works this session.
    }
    if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOLUME
    listeners.forEach((listener) => listener())
}

export function toggleSoundMuted() {
    setSoundMuted(!muted)
}

export function subscribeSoundMuted(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
