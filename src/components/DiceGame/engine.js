// Rolls are 0.00-99.99: exactly 10,000 equally likely outcomes, so a 50.00%
// chance is exactly 5,000 of them.
export const DICE_HOUSE_NUMERATOR = 99
export const DICE_MIN_CHANCE = 1
export const DICE_MAX_CHANCE = 98

export function rollFromFloat(float) {
    return Math.floor(float * 10000) / 100
}

export function chanceFor(mode, target) {
    return mode === 'over' ? 100 - target : target
}

export function targetFor(mode, chance) {
    return mode === 'over' ? Math.round((100 - chance) * 100) / 100 : chance
}

export function targetBounds(mode) {
    return mode === 'over'
        ? { min: 100 - DICE_MAX_CHANCE, max: 100 - DICE_MIN_CHANCE }
        : { min: DICE_MIN_CHANCE, max: DICE_MAX_CHANCE }
}

export function diceMultiplier(chance) {
    return Math.floor((DICE_HOUSE_NUMERATOR / chance) * 10000) / 10000
}

export function settleDice(float, mode, target) {
    const roll = rollFromFloat(float)
    const win = mode === 'over' ? roll >= target : roll < target
    const multiplier = diceMultiplier(chanceFor(mode, target))
    return { roll, win, multiplier: win ? multiplier : 0 }
}
