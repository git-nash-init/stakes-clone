import { MIN_BET, normalizeBet } from './money.js'

export function nextAutoBet(current, base, profit, config) {
    if (profit === 0) return current
    const won = profit > 0
    const mode = won ? config.onWin : config.onLoss
    const pct = won ? config.onWinPct : config.onLossPct
    if (mode !== 'increase') return base
    return Math.max(MIN_BET, normalizeBet(current * (1 + pct / 100)))
}

export function shouldStopAuto(net, config) {
    if (config.stopProfit > 0 && net >= config.stopProfit) return true
    return config.stopLoss > 0 && -net >= config.stopLoss
}
