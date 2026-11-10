import { floorCents } from '../GameKit/money.js'

export const KENO_TILES = 40
export const KENO_DRAWS = 10
export const KENO_MAX_PICKS = 10
export const KENO_TARGET_RTP = 0.99
export const KENO_MAX_MULTIPLIER = 1000

export const KENO_RISKS = {
    low: { label: 'Low', base: 2.2, minHitRatio: 0.3 },
    classic: { label: 'Classic', base: 3.2, minHitRatio: 0.4 },
    medium: { label: 'Medium', base: 4.5, minHitRatio: 0.5 },
    high: { label: 'High', base: 8, minHitRatio: 0.6 },
}

function combinations(n, k) {
    if (k < 0 || k > n) return 0
    let result = 1
    for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
    return result
}

export function hitProbabilities(picks) {
    const total = combinations(KENO_TILES, KENO_DRAWS)
    return Array.from({ length: picks + 1 }, (_, hits) =>
        (combinations(picks, hits) * combinations(KENO_TILES - picks, KENO_DRAWS - hits)) / total)
}

function buildPaytable(picks, riskId) {
    const risk = KENO_RISKS[riskId]
    const minHit = Math.max(1, Math.ceil(picks * risk.minHitRatio))
    const weights = Array.from({ length: picks + 1 }, (_, hits) =>
        hits < minHit ? 0 : Math.pow(risk.base, hits - minHit))
    const probabilities = hitProbabilities(picks)
    const rtpAt = (scale) => weights.reduce((sum, weight, hits) =>
        sum + probabilities[hits] * Math.min(KENO_MAX_MULTIPLIER, scale * weight), 0)

    let low = 0
    let high = KENO_MAX_MULTIPLIER * 4
    for (let i = 0; i < 80; i++) {
        const middle = (low + high) / 2
        if (rtpAt(middle) < KENO_TARGET_RTP) low = middle
        else high = middle
    }

    return weights.map((weight) => floorCents(Math.min(KENO_MAX_MULTIPLIER, low * weight)))
}

const paytables = {}

export function kenoPaytable(picks, risk) {
    const key = `${risk}:${picks}`
    if (!paytables[key]) paytables[key] = buildPaytable(picks, risk)
    return paytables[key]
}

export function drawKeno(floats) {
    const tiles = Array.from({ length: KENO_TILES }, (_, index) => index + 1)
    for (let i = 0; i < KENO_DRAWS; i++) {
        const swap = i + Math.floor(floats[i] * (KENO_TILES - i))
        ;[tiles[i], tiles[swap]] = [tiles[swap], tiles[i]]
    }
    return tiles.slice(0, KENO_DRAWS)
}

export function settleKeno(floats, picks, risk) {
    const drawn = drawKeno(floats)
    const selected = new Set(picks)
    const hits = drawn.filter((tile) => selected.has(tile)).length
    return { drawn, hits, multiplier: kenoPaytable(picks.length, risk)[hits] }
}
