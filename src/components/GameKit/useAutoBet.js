import { useCallback, useEffect, useRef, useState } from 'react'
import { nextAutoBet, shouldStopAuto } from './useAutoBet.helpers.js'

export const DEFAULT_AUTO_CONFIG = {
    count: 10,
    onWin: 'reset',
    onWinPct: 0,
    onLoss: 'reset',
    onLossPct: 0,
    stopProfit: 0,
    stopLoss: 0,
}

export function useAutoBet({ playRound, bet, setBet, delay = 150, wait }) {
    const [config, setConfig] = useState(DEFAULT_AUTO_CONFIG)
    const [running, setRunning] = useState(false)
    const [played, setPlayed] = useState(0)
    const sessionRef = useRef(0)
    const latest = useRef({ playRound, bet, setBet, config, wait })
    latest.current = { playRound, bet, setBet, config, wait }

    const stop = useCallback(() => {
        sessionRef.current++
        setRunning(false)
    }, [])

    const start = useCallback(async () => {
        const session = ++sessionRef.current
        const { bet: baseBet, config: runConfig } = latest.current
        let currentBet = baseBet
        let net = 0
        let count = 0

        setRunning(true)
        setPlayed(0)

        while (sessionRef.current === session && (runConfig.count === 0 || count < runConfig.count)) {
            const result = await latest.current.playRound(currentBet)
            if (result.status !== 'settled') break

            count++
            net += result.profit
            if (sessionRef.current === session) setPlayed(count)
            if (shouldStopAuto(net, runConfig)) break

            currentBet = nextAutoBet(currentBet, baseBet, result.profit, runConfig)
            if (sessionRef.current === session) latest.current.setBet(currentBet)
            await latest.current.wait(delay)
        }

        if (sessionRef.current === session) {
            latest.current.setBet(baseBet)
            setRunning(false)
        }
    }, [delay])

    useEffect(() => () => {
        sessionRef.current++
    }, [])

    return { config, setConfig, running, played, start, stop }
}
