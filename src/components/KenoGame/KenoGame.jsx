import { useCallback, useMemo, useState } from 'react'
import GameShell from '../GameKit/GameShell'
import { useGameKit, useRecentResults } from '../GameKit/useGameKit'
import { useAutoBet } from '../GameKit/useAutoBet'
import { AutoBetFields, BetAmountInput, BetModeTabs, Field, PrimaryButton, ResultStrip, SecondaryButton, SelectInput } from '../GameKit/controls'
import { formatMultiplier, payoutFor } from '../GameKit/money'
import { KENO_DRAWS, KENO_MAX_PICKS, KENO_RISKS, KENO_TILES, drawKeno, kenoPaytable, settleKeno } from './engine'
import './KenoGame.css'

const SOUNDS = ['pick', 'draw', 'hit', 'bet', 'win', 'win-big', 'lose']
const VERIFIER = { floats: KENO_DRAWS, describe: (floats) => `Drawn: ${drawKeno(floats).join(', ')}` }
const TILES = Array.from({ length: KENO_TILES }, (_, index) => index + 1)
const RISK_OPTIONS = Object.entries(KENO_RISKS).map(([value, risk]) => ({ value, label: risk.label }))

function randomPicks(count) {
    const pool = [...TILES]
    const bytes = crypto.getRandomValues(new Uint32Array(count))
    return Array.from(bytes, (value, index) => {
        const swap = index + Math.floor((value / 0x100000000) * (pool.length - index))
        ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
        return pool[index]
    })
}

function KenoGame() {
    const kit = useGameKit({ id: 'keno', title: 'Keno', sounds: SOUNDS, verifier: VERIFIER })
    const [bet, setBet] = useState(1)
    const [tab, setTab] = useState('manual')
    const [risk, setRisk] = useState('classic')
    const [picks, setPicks] = useState([])
    const [drawn, setDrawn] = useState([])
    const [lastHits, setLastHits] = useState(null)
    const [results, addResult] = useRecentResults()

    const selected = useMemo(() => new Set(picks), [picks])
    const drawnSet = useMemo(() => new Set(drawn), [drawn])
    const paytable = picks.length > 0 ? kenoPaytable(picks.length, risk) : []

    const playRound = useCallback((amount) => {
        if (picks.length === 0) {
            kit.showToast('error', 'Pick some numbers', 'Choose between 1 and 10 tiles first.')
            return Promise.resolve({ status: 'invalid' })
        }

        return kit.runRound(amount, async (stake) => {
            kit.sound.play('bet')
            setDrawn([])
            setLastHits(null)
            const { floats, nonce } = await kit.fairness.getFloats(KENO_DRAWS)
            const settled = settleKeno(floats, picks, risk)
            const payout = payoutFor(stake, settled.multiplier)
            kit.hold(payout)

            for (let i = 0; i < settled.drawn.length; i++) {
                const tile = settled.drawn[i]
                setDrawn(settled.drawn.slice(0, i + 1))
                kit.sound.play(picks.includes(tile) ? 'hit' : 'draw')
                await kit.wait(90)
            }

            setLastHits(settled.hits)
            const won = settled.multiplier >= 1
            kit.sound.play(won ? (settled.multiplier >= 10 ? 'win-big' : 'win') : 'lose')
            addResult(`${settled.hits}/${picks.length}`, won ? 'win' : 'loss')
            return { payout, multiplier: settled.multiplier, nonce, detail: `${settled.hits} hits of ${picks.length}, ${KENO_RISKS[risk].label} risk` }
        })
    }, [addResult, kit, picks, risk])

    const auto = useAutoBet({ playRound, bet, setBet, wait: kit.wait, delay: 200 })
    const locked = kit.busy || auto.running

    const toggleTile = (tile) => {
        if (locked) return
        if (drawn.length > 0) {
            setDrawn([])
            setLastHits(null)
        }
        if (selected.has(tile)) {
            kit.sound.play('pick', { rate: 0.8 })
            setPicks(picks.filter((value) => value !== tile))
        } else if (picks.length < KENO_MAX_PICKS) {
            kit.sound.play('pick')
            setPicks([...picks, tile])
        }
    }

    const autoPick = () => {
        kit.sound.play('pick')
        setDrawn([])
        setLastHits(null)
        setPicks(randomPicks(KENO_MAX_PICKS))
    }

    const clearPicks = () => {
        setDrawn([])
        setLastHits(null)
        setPicks([])
    }

    const controls = (
        <>
            <BetModeTabs mode={tab} onChange={setTab} disabled={locked} />
            <BetAmountInput value={bet} onChange={setBet} balance={kit.balance} disabled={locked} />
            <Field label="Risk" secondary>
                <SelectInput value={risk} onChange={setRisk} options={RISK_OPTIONS} disabled={locked} ariaLabel="Risk" />
            </Field>
            <div className="gk-button-row mobile-sheet-secondary">
                <SecondaryButton onClick={autoPick} disabled={locked}>Auto Pick</SecondaryButton>
                <SecondaryButton onClick={clearPicks} disabled={locked || picks.length === 0}>Clear</SecondaryButton>
            </div>
            {tab === 'auto' && <AutoBetFields auto={auto} />}
            {tab === 'manual' ? (
                <PrimaryButton onClick={() => playRound(bet)} disabled={kit.busy || picks.length === 0}>Bet</PrimaryButton>
            ) : auto.running ? (
                <PrimaryButton tone="danger" onClick={auto.stop}>Stop Auto</PrimaryButton>
            ) : (
                <PrimaryButton onClick={auto.start} disabled={kit.busy || picks.length === 0}>Start Auto</PrimaryButton>
            )}
        </>
    )

    return (
        <GameShell kit={kit} className="keno-game" controls={controls} collapseOn={locked} locked={locked}>
            <div className="keno-board">
                <ResultStrip results={results} label="Recent draws" />
                <div className="keno-grid">
                    {TILES.map((tile) => {
                        const isPicked = selected.has(tile)
                        const isDrawn = drawnSet.has(tile)
                        const state = isPicked && isDrawn ? 'is-hit' : isDrawn ? 'is-miss' : isPicked ? 'is-picked' : ''
                        return (
                            <button key={tile} type="button" className={`keno-tile ${state}`} aria-pressed={isPicked} disabled={locked} onClick={() => toggleTile(tile)}>
                                {tile}
                            </button>
                        )
                    })}
                </div>
                <div className="keno-paytable" aria-label="Payout table">
                    {paytable.length === 0 ? (
                        <p>Select 1 to 10 numbers to see payouts</p>
                    ) : paytable.map((multiplier, hits) => (
                        <div key={hits} className={`keno-pay ${lastHits === hits ? 'is-current' : ''}`}>
                            <strong>{formatMultiplier(multiplier)}</strong>
                            <span>{hits} hit{hits === 1 ? '' : 's'}</span>
                        </div>
                    ))}
                </div>
            </div>
        </GameShell>
    )
}

export default KenoGame
