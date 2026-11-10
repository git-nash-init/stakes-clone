import { rankOf } from '../GameKit/cards.js'

export const HILO_MAX_ACTIONS = 52
export const HILO_FLOATS = HILO_MAX_ACTIONS + 1
export const HILO_MAX_MULTIPLIER = 1000
const HOUSE_FACTOR = 0.99
const RANK_COUNT = 13

export function cardFromFloat(float) {
    return Math.floor(float * 52)
}

// "High" means same or higher; "low" means same or lower.
export function guessChance(rank, guess) {
    return guess === 'high' ? (RANK_COUNT - rank) / RANK_COUNT : (rank + 1) / RANK_COUNT
}

export function canGuess(rank, guess) {
    return guessChance(rank, guess) < 1
}

function cashMultiplier(product) {
    return Math.min(HILO_MAX_MULTIPLIER, Math.floor(HOUSE_FACTOR * product * 100) / 100)
}

export function createHiLo(floats) {
    return {
        floats,
        cursor: 1,
        current: cardFromFloat(floats[0]),
        product: 1,
        correct: 0,
        actions: 0,
        status: 'playing',
        trail: [],
    }
}

export function currentMultiplier(state) {
    return state.correct === 0 ? 1 : cashMultiplier(state.product)
}

export function nextMultiplier(state, guess) {
    const chance = guessChance(rankOf(state.current), guess)
    return cashMultiplier(state.product / chance)
}

function advance(state, card, outcome, patch) {
    const actions = state.actions + 1
    const next = {
        ...state,
        ...patch,
        current: card,
        cursor: state.cursor + 1,
        actions,
        trail: [...state.trail, { from: state.current, card, outcome }],
    }
    if (next.status === 'playing' && (actions >= HILO_MAX_ACTIONS || currentMultiplier(next) >= HILO_MAX_MULTIPLIER)) {
        next.status = 'capped'
    }
    return next
}

export function applyGuess(state, guess) {
    const rank = rankOf(state.current)
    if (state.status !== 'playing' || !canGuess(rank, guess)) return state

    const card = cardFromFloat(state.floats[state.cursor])
    const nextRank = rankOf(card)
    const correct = guess === 'high' ? nextRank >= rank : nextRank <= rank

    if (!correct) return advance(state, card, 'wrong', { status: 'lost' })
    return advance(state, card, 'correct', {
        product: state.product / guessChance(rank, guess),
        correct: state.correct + 1,
    })
}

export function applySkip(state) {
    if (state.status !== 'playing') return state
    return advance(state, cardFromFloat(state.floats[state.cursor]), 'skip', {})
}
