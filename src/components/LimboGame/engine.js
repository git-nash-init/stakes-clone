export const LIMBO_MIN_TARGET = 1.01
export const LIMBO_MAX_TARGET = 1000

// P(result >= target) = 0.99 / target for every target on the 0.01 grid.
export function limboResult(float) {
    const raw = Math.floor(99 / (1 - float)) / 100
    return Math.min(LIMBO_MAX_TARGET, Math.max(1, raw))
}

export function limboChance(target) {
    return 99 / target
}

export function settleLimbo(float, target) {
    const result = limboResult(float)
    const win = result >= target
    return { result, win, multiplier: win ? target : 0 }
}
