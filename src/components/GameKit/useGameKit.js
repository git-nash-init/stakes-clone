import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '../../context/WalletContext'
import { useSound } from '../../hooks/useSound'
import ProvablyFair from '../../utils/ProvablyFair'
import { MIN_BET, formatAmount, normalizeBet } from './money'

const HISTORY_LIMIT = 50
const SERIES_LIMIT = 120
const EMPTY_STATS = { wagered: 0, profit: 0, wins: 0, losses: 0, pushes: 0, series: [0], history: [] }

function statsKey(id) {
    return `game_stats_${id}`
}

function readStats(id) {
    try {
        const stored = JSON.parse(localStorage.getItem(statsKey(id)))
        if (stored && Array.isArray(stored.history) && Array.isArray(stored.series)) {
            return { ...EMPTY_STATS, ...stored }
        }
    } catch {
        // Corrupt or blocked storage falls back to empty stats.
    }
    return EMPTY_STATS
}

function writeStats(id, stats) {
    try {
        localStorage.setItem(statsKey(id), JSON.stringify(stats))
    } catch {
        // Stats are a convenience and never block a bet.
    }
}

function useFairness() {
    const [pf] = useState(() => new ProvablyFair())
    const [data, setData] = useState({ serverSeedHash: '', clientSeed: '', nonce: 0 })
    const [revealed, setRevealed] = useState(null)

    const refresh = useCallback(async () => {
        setData(await pf.getFairnessData())
    }, [pf])

    useEffect(() => { refresh() }, [refresh])

    const getFloats = useCallback(async (count) => {
        const result = await pf.getFloats(count)
        refresh()
        return result
    }, [pf, refresh])

    const rotate = useCallback(async () => {
        setRevealed(await pf.rotateSeed())
        await refresh()
    }, [pf, refresh])

    const changeClientSeed = useCallback(async (seed) => {
        const value = seed.trim()
        if (!value || value === pf.clientSeed) return false
        await pf.setClientSeed(value)
        setRevealed(pf.previousSeeds[0] ?? null)
        await refresh()
        return true
    }, [pf, refresh])

    return { data, revealed, getFloats, rotate, changeClientSeed }
}

function useGameStats(id) {
    const [stats, setStats] = useState(() => readStats(id))
    const statsRef = useRef(stats)
    const entryId = useRef(0)

    const record = useCallback(({ bet, payout, multiplier, nonce, detail }) => {
        const profit = Math.round((payout - bet) * 100) / 100
        const current = statsRef.current
        const next = {
            wagered: Math.round((current.wagered + bet) * 100) / 100,
            profit: Math.round((current.profit + profit) * 100) / 100,
            wins: current.wins + (profit > 0 ? 1 : 0),
            losses: current.losses + (profit < 0 ? 1 : 0),
            pushes: current.pushes + (profit === 0 ? 1 : 0),
            series: [...current.series, Math.round((current.profit + profit) * 100) / 100].slice(-SERIES_LIMIT),
            history: [{
                id: `${Date.now()}-${++entryId.current}`,
                time: Date.now(),
                bet,
                payout,
                profit,
                multiplier,
                nonce,
                detail,
            }, ...current.history].slice(0, HISTORY_LIMIT),
        }
        statsRef.current = next
        setStats(next)
        writeStats(id, next)
    }, [id])

    const reset = useCallback(() => {
        statsRef.current = EMPTY_STATS
        setStats(EMPTY_STATS)
        writeStats(id, EMPTY_STATS)
    }, [id])

    return { ...stats, record, reset }
}

export function useRecentResults(limit = 14) {
    const [results, setResults] = useState([])
    const nextKey = useRef(0)

    const addResult = useCallback((label, tone) => {
        setResults((current) => [{ key: ++nextKey.current, label, tone }, ...current].slice(0, limit))
    }, [limit])

    return [results, addResult]
}

/**
 * Everything a game round needs: one-bet-at-a-time guard, wallet handling,
 * payouts that are safe if the player leaves mid-animation, fairness, stats
 * and sound.
 */
export function useGameKit({ id, title, sounds = [], verifier }) {
    const { balance, placeBet, addWinnings, showToast } = useWallet()
    const sound = useSound(sounds)
    const fairness = useFairness()
    const stats = useGameStats(id)
    const [busy, setBusy] = useState(false)

    const busyRef = useRef(false)
    const heldRef = useRef(0)
    const mountedRef = useRef(true)
    const timersRef = useRef(new Set())

    const hold = useCallback((amount) => {
        heldRef.current += amount
    }, [])

    const release = useCallback(() => {
        const amount = heldRef.current
        heldRef.current = 0
        if (amount > 0) addWinnings(amount)
    }, [addWinnings])

    const begin = useCallback((bet) => {
        if (busyRef.current) return { status: 'busy' }

        const amount = normalizeBet(bet)
        if (amount < MIN_BET) {
            showToast('error', 'Invalid bet', `Minimum bet is ₿${formatAmount(MIN_BET)}`)
            return { status: 'invalid' }
        }
        if (!placeBet(amount)) {
            showToast('error', 'Insufficient balance', `You need ₿${formatAmount(amount)}`)
            return { status: 'insufficient' }
        }

        busyRef.current = true
        setBusy(true)
        return { status: 'started', amount }
    }, [placeBet, showToast])

    const end = useCallback(() => {
        busyRef.current = false
        setBusy(false)
    }, [])

    const wait = useCallback((ms) => new Promise((resolve) => {
        if (!mountedRef.current) {
            resolve()
            return
        }
        const entry = { resolve }
        entry.timer = setTimeout(() => {
            timersRef.current.delete(entry)
            resolve()
        }, ms)
        timersRef.current.add(entry)
    }), [])

    const runRound = useCallback(async (bet, settle) => {
        const round = begin(bet)
        if (round.status !== 'started') return round

        try {
            const result = await settle(round.amount)
            release()
            stats.record({
                bet: result.wagered ?? round.amount,
                payout: result.payout,
                multiplier: result.multiplier,
                nonce: result.nonce,
                detail: result.detail,
            })
            return { status: 'settled', profit: result.payout - (result.wagered ?? round.amount) }
        } catch (error) {
            console.error(`${title} round failed`, error)
            heldRef.current = 0
            addWinnings(round.amount)
            showToast('error', 'Bet refunded', 'Something went wrong, so your stake was returned.')
            return { status: 'error' }
        } finally {
            end()
        }
    }, [addWinnings, begin, end, release, showToast, stats, title])

    useEffect(() => {
        mountedRef.current = true
        const timers = timersRef.current
        const flush = () => release()
        window.addEventListener('pagehide', flush)

        return () => {
            mountedRef.current = false
            window.removeEventListener('pagehide', flush)
            timers.forEach((entry) => {
                clearTimeout(entry.timer)
                entry.resolve()
            })
            timers.clear()
            release()
        }
    }, [release])

    return useMemo(() => ({
        id,
        title,
        verifier,
        balance,
        busy,
        busyRef,
        sound,
        fairness,
        stats,
        placeBet,
        addWinnings,
        showToast,
        begin,
        end,
        hold,
        release,
        wait,
        runRound,
        mountedRef,
    }), [addWinnings, balance, begin, busy, end, fairness, hold, id, placeBet, release, runRound, showToast, sound, stats, title, verifier, wait])
}
