// Generates every game sound effect: synthesises the audio in Node, then
// encodes and levels it with ffmpeg into public/sounds/*.mp3.
// Output is deterministic. Run with: node scripts/generateSounds.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 44100
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds')

function createRandom(seed) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

const wave = {
    sine: (phase) => Math.sin(2 * Math.PI * phase),
    triangle: (phase) => 4 * Math.abs(phase - Math.floor(phase + 0.5)) - 1,
    saw: (phase) => 2 * (phase - Math.floor(phase + 0.5)),
    square: (phase) => (phase - Math.floor(phase) < 0.5 ? 1 : -1),
}

function createBuffer(seconds) {
    return new Float64Array(Math.ceil(seconds * SAMPLE_RATE))
}

function envelope(t, duration, attack, decayRate) {
    const rise = attack > 0 ? Math.min(1, t / attack) : 1
    const release = Math.min(1, (duration - t) / 0.004)
    return rise * Math.exp(-t * decayRate) * Math.max(0, release)
}

function tone(buffer, { start = 0, duration, from, to = from, type = 'sine', gain = 0.5, attack = 0.002, decay = 6 }) {
    const first = Math.floor(start * SAMPLE_RATE)
    const count = Math.floor(duration * SAMPLE_RATE)
    let phase = 0
    for (let index = 0; index < count && first + index < buffer.length; index++) {
        const t = index / SAMPLE_RATE
        const progress = t / duration
        phase += (from * Math.pow(to / from, progress)) / SAMPLE_RATE
        buffer[first + index] += wave[type](phase) * envelope(t, duration, attack, decay) * gain
    }
}

function noise(buffer, random, { start = 0, duration, gain = 0.4, attack = 0.001, decay = 20, lowFrom = 8000, lowTo = lowFrom, high = 0 }) {
    const first = Math.floor(start * SAMPLE_RATE)
    const count = Math.floor(duration * SAMPLE_RATE)
    let low = 0
    let slow = 0
    for (let index = 0; index < count && first + index < buffer.length; index++) {
        const t = index / SAMPLE_RATE
        const cutoff = lowFrom * Math.pow(lowTo / lowFrom, t / duration)
        low += (1 - Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE)) * (random() * 2 - 1 - low)
        let sample = low
        if (high > 0) {
            slow += (1 - Math.exp((-2 * Math.PI * high) / SAMPLE_RATE)) * (low - slow)
            sample = low - slow
        }
        buffer[first + index] += sample * envelope(t, duration, attack, decay) * gain
    }
}

function clack(buffer, random, start, pitch = 1, gain = 0.6) {
    tone(buffer, { start, duration: 0.05, from: 2600 * pitch, gain: gain * 0.5, decay: 70 })
    tone(buffer, { start, duration: 0.05, from: 4100 * pitch, gain: gain * 0.3, decay: 90 })
    noise(buffer, random, { start, duration: 0.03, gain, decay: 140, lowFrom: 9000, high: 1200 })
}

function notes(buffer, sequence, { type = 'triangle', length = 0.22, gain = 0.45, decay = 9, gap = 0.08, start = 0 } = {}) {
    sequence.forEach((frequency, index) => {
        tone(buffer, { start: start + index * gap, duration: length, from: frequency, type, gain, decay })
        tone(buffer, { start: start + index * gap, duration: length * 0.7, from: frequency * 2, type: 'sine', gain: gain * 0.22, decay: decay * 1.7 })
    })
}

const sounds = {
    click: { seconds: 0.06, level: 0.45, draw(b, r) {
        tone(b, { duration: 0.05, from: 1700, to: 1100, gain: 0.5, decay: 75 })
        noise(b, r, { duration: 0.012, gain: 0.25, decay: 300, high: 2000 })
    } },
    bet: { seconds: 0.2, level: 0.62, draw(b, r) {
        clack(b, r, 0, 1, 0.65)
        clack(b, r, 0.07, 0.86, 0.5)
        tone(b, { duration: 0.14, from: 190, to: 120, gain: 0.3, decay: 26 })
    } },
    chip: { seconds: 0.09, level: 0.55, draw(b, r) { clack(b, r, 0, 1.08, 0.7) } },
    tick: { seconds: 0.04, level: 0.4, draw(b) { tone(b, { duration: 0.032, from: 1050, type: 'triangle', gain: 0.6, decay: 110 }) } },
    win: { seconds: 0.55, level: 0.7, draw(b) { notes(b, [523.25, 659.25, 783.99], { length: 0.32 }) } },
    'win-big': { seconds: 1.3, level: 0.8, draw(b, r) {
        notes(b, [523.25, 659.25, 783.99, 1046.5, 1318.51], { length: 0.5, gap: 0.095, decay: 5 })
        notes(b, [1567.98, 2093], { length: 0.6, gap: 0.1, decay: 5, gain: 0.25, type: 'sine', start: 0.45 })
        noise(b, r, { start: 0.36, duration: 0.8, gain: 0.1, attack: 0.05, decay: 4, lowFrom: 12000, high: 6000 })
    } },
    lose: { seconds: 0.5, level: 0.6, draw(b) {
        tone(b, { duration: 0.45, from: 330, to: 95, type: 'triangle', gain: 0.55, attack: 0.004, decay: 5 })
        tone(b, { duration: 0.45, from: 165, to: 60, type: 'sine', gain: 0.4, attack: 0.004, decay: 5 })
    } },
    cashout: { seconds: 0.6, level: 0.72, draw(b) {
        for (const [start, frequency] of [[0, 1975.53], [0.08, 2637.02]]) {
            tone(b, { start, duration: 0.5, from: frequency, gain: 0.42, decay: 8 })
            tone(b, { start, duration: 0.3, from: frequency * 2.76, gain: 0.14, decay: 18 })
        }
    } },
    push: { seconds: 0.32, level: 0.5, draw(b) { notes(b, [440, 440], { length: 0.16, gap: 0.12, decay: 14 }) } },
    correct: { seconds: 0.32, level: 0.6, draw(b) { notes(b, [659.25, 987.77], { length: 0.22, gap: 0.075, decay: 12 }) } },
    wrong: { seconds: 0.36, level: 0.56, draw(b) { notes(b, [311.13, 233.08], { length: 0.24, gap: 0.09, decay: 10, type: 'saw', gain: 0.3 }) } },
    gem: { seconds: 0.42, level: 0.62, draw(b) {
        for (const [frequency, gain] of [[1760, 0.4], [2637, 0.24], [3520, 0.16], [5274, 0.07]]) {
            tone(b, { duration: 0.4, from: frequency, gain, decay: 11 })
        }
    } },
    explosion: { seconds: 1.1, level: 0.85, draw(b, r) {
        noise(b, r, { duration: 1.05, gain: 1, attack: 0.002, decay: 4.2, lowFrom: 5200, lowTo: 180 })
        tone(b, { duration: 0.8, from: 120, to: 34, gain: 0.8, attack: 0.002, decay: 4.5 })
        noise(b, r, { duration: 0.04, gain: 0.5, decay: 90, high: 1500 })
    } },
    launch: { seconds: 1.3, level: 0.55, draw(b, r) {
        noise(b, r, { duration: 1.25, gain: 0.8, attack: 0.25, decay: 0.8, lowFrom: 260, lowTo: 2800 })
        tone(b, { duration: 1.25, from: 70, to: 300, type: 'saw', gain: 0.16, attack: 0.2, decay: 0.6 })
    } },
    peg: { seconds: 0.05, level: 0.32, draw(b) {
        tone(b, { duration: 0.045, from: 1480, gain: 0.5, decay: 90 })
        tone(b, { duration: 0.03, from: 3100, gain: 0.16, decay: 150 })
    } },
    drop: { seconds: 0.14, level: 0.5, draw(b) { tone(b, { duration: 0.13, from: 760, to: 310, gain: 0.6, decay: 22 }) } },
    land: { seconds: 0.2, level: 0.48, draw(b, r) {
        tone(b, { duration: 0.18, from: 210, to: 110, gain: 0.7, decay: 26 })
        noise(b, r, { duration: 0.03, gain: 0.25, decay: 120, lowFrom: 3000 })
    } },
    'dice-roll': { seconds: 0.5, level: 0.62, draw(b, r) {
        ;[0, 0.06, 0.13, 0.21, 0.29, 0.38].forEach((start, index) => clack(b, r, start, 0.6 + (index % 3) * 0.13, 0.7 - index * 0.06))
    } },
    rise: { seconds: 0.56, level: 0.42, draw(b) {
        tone(b, { duration: 0.54, from: 260, to: 1500, type: 'triangle', gain: 0.5, attack: 0.02, decay: 0.8 })
        tone(b, { duration: 0.54, from: 520, to: 3000, gain: 0.12, attack: 0.02, decay: 0.8 })
    } },
    pick: { seconds: 0.08, level: 0.45, draw(b) { tone(b, { duration: 0.07, from: 520, to: 880, type: 'triangle', gain: 0.6, decay: 50 }) } },
    draw: { seconds: 0.08, level: 0.38, draw(b, r) {
        tone(b, { duration: 0.07, from: 300, to: 180, gain: 0.6, decay: 60 })
        noise(b, r, { duration: 0.02, gain: 0.25, decay: 200, lowFrom: 2600 })
    } },
    hit: { seconds: 0.3, level: 0.62, draw(b) {
        tone(b, { duration: 0.28, from: 1318.51, gain: 0.5, decay: 14 })
        tone(b, { duration: 0.2, from: 1975.53, gain: 0.25, decay: 20 })
    } },
    card: { seconds: 0.12, level: 0.5, draw(b, r) {
        noise(b, r, { duration: 0.1, gain: 0.8, attack: 0.012, decay: 30, lowFrom: 2600, lowTo: 7500, high: 900 })
    } },
    flip: { seconds: 0.17, level: 0.52, draw(b, r) {
        noise(b, r, { duration: 0.08, gain: 0.7, attack: 0.01, decay: 34, lowFrom: 2200, lowTo: 6200, high: 800 })
        noise(b, r, { start: 0.08, duration: 0.07, gain: 0.8, attack: 0.002, decay: 50, lowFrom: 4800, lowTo: 2000, high: 500 })
    } },
    bust: { seconds: 0.55, level: 0.62, draw(b, r) {
        tone(b, { duration: 0.5, from: 180, to: 52, gain: 0.8, attack: 0.002, decay: 7 })
        noise(b, r, { duration: 0.16, gain: 0.45, decay: 24, lowFrom: 1400, lowTo: 300 })
    } },
    wheel: { seconds: 2.7, level: 0.58, draw(b, r) {
        noise(b, r, { duration: 2.65, gain: 0.24, attack: 0.08, decay: 0.9, lowFrom: 900, lowTo: 240 })
        let start = 0.02
        let interval = 0.045
        while (start < 2.45) {
            clack(b, r, start, 0.82 + r() * 0.1, 0.34 * Math.max(0.35, 1 - start / 3.2))
            start += interval
            interval *= 1.075
        }
    } },
    'ball-drop': { seconds: 0.45, level: 0.6, draw(b, r) {
        ;[0, 0.14, 0.25, 0.32].forEach((start, index) => clack(b, r, start, 0.7, 0.8 - index * 0.17))
    } },
}

function toWav(samples) {
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1
    const data = Buffer.alloc(samples.length * 2)
    samples.forEach((value, index) => {
        data.writeInt16LE(Math.round((value / peak) * 32000), index * 2)
    })
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + data.length, 4)
    header.write('WAVEfmt ', 8)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(SAMPLE_RATE, 24)
    header.writeUInt32LE(SAMPLE_RATE * 2, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36)
    header.writeUInt32LE(data.length, 40)
    return Buffer.concat([header, data])
}

mkdirSync(OUTPUT_DIR, { recursive: true })
const workDir = mkdtempSync(join(tmpdir(), 'game-sounds-'))

try {
    Object.entries(sounds).forEach(([name, sound], index) => {
        const buffer = createBuffer(sound.seconds)
        sound.draw(buffer, createRandom(1000 + index))
        const wavPath = join(workDir, `${name}.wav`)
        writeFileSync(wavPath, toWav(buffer))

        const result = spawnSync('ffmpeg', [
            '-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath,
            '-af', `highpass=f=35,volume=${sound.level},alimiter=limit=0.95:level=false`,
            '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '96k',
            '-map_metadata', '-1', join(OUTPUT_DIR, `${name}.mp3`),
        ], { encoding: 'utf8' })

        if (result.status !== 0) {
            throw new Error(`ffmpeg failed for ${name}: ${result.stderr || result.error}`)
        }
    })
    console.log(`Generated ${Object.keys(sounds).length} sounds in ${OUTPUT_DIR}`)
} finally {
    rmSync(workDir, { recursive: true, force: true })
}
