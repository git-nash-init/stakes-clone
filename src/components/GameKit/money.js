// The wallet stores balances to 2 decimals, so every stake and payout must be
// whole cents. A smaller stake would round away to a free bet.
export const MIN_BET = 0.01

export function floorCents(value) {
    return Math.floor(value * 100 + 1e-7) / 100
}

export function normalizeBet(value) {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount <= 0) return 0
    return floorCents(amount)
}

export function payoutFor(bet, multiplier) {
    return floorCents(bet * multiplier)
}

export function formatAmount(value) {
    return Number(value || 0).toFixed(2)
}

export function formatMultiplier(value) {
    return `${Number(value || 0).toFixed(2)}×`
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}
