import { useCallback, useState } from 'react'
import GameShell from '../GameKit/GameShell'
import { useGameKit, useRecentResults } from '../GameKit/useGameKit'
import { useAutoBet } from '../GameKit/useAutoBet'
import { AutoBetFields, BetAmountInput, BetModeTabs, Field, NumberInput, PrimaryButton, Readout, ResultStrip } from '../GameKit/controls'
import { clamp, formatAmount, payoutFor } from '../GameKit/money'
import { DICE_MAX_CHANCE, DICE_MIN_CHANCE, chanceFor, diceMultiplier, rollFromFloat, settleDice, targetBounds, targetFor } from './engine'
import './DiceGame.css'

const SOUNDS = ['dice-roll', 'win', 'win-big', 'lose', 'click']
const VERIFIER = { floats: 1, describe: ([float]) => `Roll ${rollFromFloat(float).toFixed(2)}` }
const twoDecimals = (value) => value.toFixed(2)
const fourDecimals = (value) => value.toFixed(4)

function DiceGame() {
    const kit = useGameKit({ id: 'dice', title: 'Dice', sounds: SOUNDS, verifier: VERIFIER })
    const [bet, setBet] = useState(1)
    const [tab, setTab] = useState('manual')
    const [mode, setMode] = useState('over')
    const [target, setTarget] = useState(50.5)
    const [roll, setRoll] = useState(null)
    const [results, addResult] = useRecentResults()

    const chance = chanceFor(mode, target)
    const multiplier = diceMultiplier(chance)

    const playRound = useCallback((amount) => kit.runRound(amount, async (stake) => {
        kit.sound.play('dice-roll')
        const { floats, nonce } = await kit.fairness.getFloats(1)
        const outcome = settleDice(floats[0], mode, target)
        const payout = outcome.win ? payoutFor(stake, outcome.multiplier) : 0
        kit.hold(payout)
        setRoll({ value: outcome.roll, win: outcome.win })
        await kit.wait(300)

        kit.sound.play(outcome.win ? (outcome.multiplier >= 10 ? 'win-big' : 'win') : 'lose')
        addResult(outcome.roll.toFixed(2), outcome.win ? 'win' : 'loss')
        return { payout, multiplier: outcome.multiplier, nonce, detail: `Roll ${outcome.roll.toFixed(2)} (${mode} ${target.toFixed(2)})` }
    }), [addResult, kit, mode, target])

    const auto = useAutoBet({ playRound, bet, setBet, wait: kit.wait, delay: 120 })
    const locked = kit.busy || auto.running

    const setChance = (value) => setTarget(targetFor(mode, clamp(value, DICE_MIN_CHANCE, DICE_MAX_CHANCE)))
    const bounds = targetBounds(mode)

    const toggleMode = () => {
        kit.sound.play('click')
        setMode(mode === 'over' ? 'under' : 'over')
        setTarget(Math.round((100 - target) * 100) / 100)
    }

    const controls = (
        <>
            <BetModeTabs mode={tab} onChange={setTab} disabled={locked} />
            <BetAmountInput value={bet} onChange={setBet} balance={kit.balance} disabled={locked} />
            <Readout label={`Profit on Win (${multiplier.toFixed(4)}×)`} value={formatAmount(Math.max(0, payoutFor(bet, multiplier) - bet))} tone="win" />
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
        <GameShell kit={kit} className="dice-game" controls={controls} collapseOn={auto.running} locked={locked}>
            <div className="dice-board">
                <ResultStrip results={results} label="Recent rolls" />
                <div className="dice-slider">
                    <div className="dice-result-rail">
                        {roll && (
                            <div className={`dice-result ${roll.win ? 'is-win' : 'is-loss'}`} style={{ left: `${roll.value}%` }}>
                                <span>{roll.value.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <div className={`dice-track is-${mode}`} style={{ '--split': `${target}%` }}>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.01"
                            value={target}
                            disabled={locked}
                            aria-label={`Roll ${mode} target`}
                            onChange={(event) => setTarget(clamp(Number(event.target.value), bounds.min, bounds.max))}
                        />
                    </div>
                    <div className="dice-scale" aria-hidden="true">
                        {[0, 25, 50, 75, 100].map((mark) => <span key={mark}>{mark}</span>)}
                    </div>
                </div>
                <div className="dice-stats">
                    <Field label="Multiplier">
                        <NumberInput value={multiplier} format={fourDecimals} min={99 / DICE_MAX_CHANCE} max={99 / DICE_MIN_CHANCE} disabled={locked} ariaLabel="Multiplier" onCommit={(value) => setChance(99 / value)} suffix={<span className="gk-suffix">×</span>} />
                    </Field>
                    <Field label={`Roll ${mode === 'over' ? 'Over' : 'Under'}`}>
                        <button type="button" className="dice-flip" disabled={locked} onClick={toggleMode} aria-label={`Switch to roll ${mode === 'over' ? 'under' : 'over'}`}>
                            <span>{target.toFixed(2)}</span>
                            <span aria-hidden="true">⇄</span>
                        </button>
                    </Field>
                    <Field label="Win Chance">
                        <NumberInput value={chance} format={twoDecimals} min={DICE_MIN_CHANCE} max={DICE_MAX_CHANCE} disabled={locked} ariaLabel="Win chance" onCommit={setChance} suffix={<span className="gk-suffix">%</span>} />
                    </Field>
                </div>
            </div>
        </GameShell>
    )
}

export default DiceGame
