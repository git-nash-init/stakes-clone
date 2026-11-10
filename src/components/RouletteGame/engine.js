import { floorCents } from '../GameKit/money.js'

export const POCKETS = 37
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export function pocketFromFloat(float) {
    return Math.floor(float * POCKETS)
}

export function pocketColor(pocket) {
    if (pocket === 0) return 'green'
    return RED_NUMBERS.has(pocket) ? 'red' : 'black'
}

const OUTSIDE_BETS = {
    red: { multiple: 2, wins: (n) => RED_NUMBERS.has(n) },
    black: { multiple: 2, wins: (n) => n > 0 && !RED_NUMBERS.has(n) },
    odd: { multiple: 2, wins: (n) => n % 2 === 1 },
    even: { multiple: 2, wins: (n) => n > 0 && n % 2 === 0 },
    low: { multiple: 2, wins: (n) => n >= 1 && n <= 18 },
    high: { multiple: 2, wins: (n) => n >= 19 },
    dozen1: { multiple: 3, wins: (n) => n >= 1 && n <= 12 },
    dozen2: { multiple: 3, wins: (n) => n >= 13 && n <= 24 },
    dozen3: { multiple: 3, wins: (n) => n >= 25 },
    column1: { multiple: 3, wins: (n) => n > 0 && n % 3 === 1 },
    column2: { multiple: 3, wins: (n) => n > 0 && n % 3 === 2 },
    column3: { multiple: 3, wins: (n) => n > 0 && n % 3 === 0 },
}

export function isValidBetKey(key) {
    if (OUTSIDE_BETS[key]) return true
    const match = /^n(\d{1,2})$/.exec(key)
    return Boolean(match) && Number(match[1]) < POCKETS
}

export function betMultiple(key) {
    return OUTSIDE_BETS[key]?.multiple ?? 36
}

export function betWins(key, pocket) {
    if (OUTSIDE_BETS[key]) return OUTSIDE_BETS[key].wins(pocket)
    return key === `n${pocket}`
}

export function totalStake(bets) {
    return floorCents(Object.values(bets).reduce((sum, amount) => sum + amount, 0))
}

export function settleRoulette(float, bets) {
    const pocket = pocketFromFloat(float)
    let payout = 0
    const winners = []
    for (const [key, amount] of Object.entries(bets)) {
        if (betWins(key, pocket)) {
            payout += amount * betMultiple(key)
            winners.push(key)
        }
    }
    return { pocket, payout: floorCents(payout), winners }
}
