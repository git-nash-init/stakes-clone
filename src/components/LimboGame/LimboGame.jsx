import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../GameKit/GameShell'
import { useGameKit, useRecentResults } from '../GameKit/useGameKit'
import { useAutoBet } from '../GameKit/useAutoBet'
import { AutoBetFields, BetAmountInput, BetModeTabs, Field, NumberInput, PrimaryButton, Readout, ResultStrip } from '../GameKit/controls'
import { formatAmount, formatMultiplier, payoutFor } from '../GameKit/money'
import { LIMBO_MAX_TARGET, LIMBO_MIN_TARGET, limboChance, limboResult, settleLimbo } from './engine'
import './LimboGame.css'

const SOUNDS = ['rise', 'win', 'win-big', 'lose']
const VERIFIER = { floats: 1, describe: ([float]) => `Result ${formatMultiplier(limboResult(float))}` }
const ANIMATION_MS = 480
const twoDecimals = (value) => value.toFixed(2)
const floorToCents = (value) => Math.floor(value * 100) / 100

function LimboGame() {
    const kit = useGameKit({ id: 'limbo', title: 'Limbo', sounds: SOUNDS, verifier: VERIFIER })
    const [bet, setBet] = useState(1)
    const [tab, setTab] = useState('manual')
    const [target, setTarget] = useState(2)
    const [display, setDisplay] = useState(1)
    const [outcome, setOutcome] = useState(null)
    const [results, addResult] = useRecentResults()
    const frameRef = useRef(0)

    useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

    const animateTo = useCallback((value) => {
        const duration = Math.min(ANIMATION_MS, 160 + Math.log10(value) * 180)
        const counting = new Promise((resolve) => {
            const started = performance.now()
            const step = (now) => {
                const progress = Math.min(1, (now - started) / duration)
                const eased = 1 - Math.pow(1 - progress, 3)
                setDisplay(1 + (value - 1) * eased)
                if (progress < 1) frameRef.current = requestAnimationFrame(step)
                else resolve()
            }
            frameRef.current = requestAnimationFrame(step)
        })
        // Animation frames stop in background tabs; the timer keeps the round moving.
        return Promise.race([counting, kit.wait(duration + 80)]).then(() => {
            cancelAnimationFrame(frameRef.current)
            setDisplay(value)
        })
    }, [kit])

    const playRound = useCallback((amount) => kit.runRound(amount, async (stake) => {
        setOutcome(null)
        kit.sound.play('rise', { volume: 0.7 })
        const { floats, nonce } = await kit.fairness.getFloats(1)
        const settled = settleLimbo(floats[0], target)
        const payout = settled.win ? payoutFor(stake, settled.multiplier) : 0
        kit.hold(payout)
        await animateTo(settled.result)

        setOutcome(settled.win ? 'win' : 'loss')
        kit.sound.play(settled.win ? (settled.multiplier >= 10 ? 'win-big' : 'win') : 'lose')
        addResult(formatMultiplier(settled.result), settled.win ? 'win' : 'loss')
        await kit.wait(120)
        return { payout, multiplier: settled.multiplier, nonce, detail: `Result ${formatMultiplier(settled.result)} (target ${formatMultiplier(target)})` }
    }), [addResult, animateTo, kit, target])

    const auto = useAutoBet({ playRound, bet, setBet, wait: kit.wait, delay: 150 })
    const locked = kit.busy || auto.running

    const controls = (
        <>
            <BetModeTabs mode={tab} onChange={setTab} disabled={locked} />
            <BetAmountInput value={bet} onChange={setBet} balance={kit.balance} disabled={locked} />
            <Readout label={`Profit on Win (${target.toFixed(2)}×)`} value={formatAmount(Math.max(0, payoutFor(bet, target) - bet))} tone="win" />
            {tab === 'auto' && <AutoBetFields auto={auto} />}
            {tab === 'manual' ? (
                <PrimaryButton onClick={() => playRound(bet)} disabled={kit.busy}>Bet</PrimaryButton>
            ) : auto.running ? (
                <PrimaryButton tone="danger" onClick={auto.stop}>Stop Auto</PrimaryButton>
            ) : (
                <PrimaryButton onClick={auto.start} disabled={kit.busy}>Start Auto</PrimaryButton>
            )}
        </>
    )

    return (
        <GameShell kit={kit} className="limbo-game" controls={controls} collapseOn={auto.running} locked={locked}>
            <div className="limbo-board">
                <ResultStrip results={results} label="Recent results" />
                <div className={`limbo-counter ${outcome ? `is-${outcome}` : ''}`} aria-live="polite">
                    {formatMultiplier(floorToCents(display))}
                </div>
                <div className="limbo-inputs">
                    <Field label="Target Multiplier">
                        <NumberInput value={target} format={twoDecimals} min={LIMBO_MIN_TARGET} max={LIMBO_MAX_TARGET} disabled={locked} ariaLabel="Target multiplier" onCommit={(value) => setTarget(floorToCents(value))} suffix={<span className="gk-suffix">×</span>} />
                    </Field>
                    <Field label="Win Chance">
                        <NumberInput value={limboChance(target)} format={twoDecimals} min={limboChance(LIMBO_MAX_TARGET)} max={limboChance(LIMBO_MIN_TARGET)} disabled={locked} ariaLabel="Win chance" onCommit={(value) => setTarget(Math.min(LIMBO_MAX_TARGET, Math.max(LIMBO_MIN_TARGET, floorToCents(99 / value))))} suffix={<span className="gk-suffix">%</span>} />
                    </Field>
                </div>
            </div>
        </GameShell>
    )
}

export default LimboGame
