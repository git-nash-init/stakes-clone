import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../GameKit/GameShell'
import { useGameKit, useRecentResults } from '../GameKit/useGameKit'
import { BetAmountInput, PlayingCard, PrimaryButton, Readout, ResultStrip, SecondaryButton } from '../GameKit/controls'
import { cardLabel, rankOf } from '../GameKit/cards'
import { formatAmount, formatMultiplier, payoutFor } from '../GameKit/money'
import { HILO_FLOATS, applyGuess, applySkip, canGuess, cardFromFloat, createHiLo, currentMultiplier, guessChance, nextMultiplier } from './engine'
import './HiLoGame.css'

const SOUNDS = ['bet', 'card', 'flip', 'correct', 'wrong', 'cashout', 'win-big', 'lose']
const VERIFIER = {
    floats: HILO_FLOATS,
    describe: (floats) => `Cards: ${floats.slice(0, 10).map((float) => cardLabel(cardFromFloat(float))).join(' ')}`,
}
const ACTION_MS = 220

function guessLabel(rank, guess) {
    if (guess === 'high') return rank === 12 ? 'Same' : 'Higher or Same'
    return rank === 0 ? 'Same' : 'Lower or Same'
}

function HiLoGame() {
    const kit = useGameKit({ id: 'hilo', title: 'HiLo', sounds: SOUNDS, verifier: VERIFIER })
    const [bet, setBet] = useState(1)
    const [game, setGame] = useState(null)
    const [starting, setStarting] = useState(false)
    const [results, addResult] = useRecentResults()
    const roundRef = useRef(null)
    const actionLock = useRef(false)

    const playing = game?.status === 'playing'
    const inRound = playing || starting
    const multiplier = game ? currentMultiplier(game) : 1
    const rank = game ? rankOf(game.current) : 0
    const canCashOut = playing && game.correct > 0

    const settle = useCallback((state, { silent = false } = {}) => {
        const round = roundRef.current
        if (!round) return
        roundRef.current = null

        const lost = state.status === 'lost'
        const refund = !lost && state.correct === 0
        const finalMultiplier = lost ? 0 : refund ? 1 : currentMultiplier(state)
        const payout = lost ? 0 : payoutFor(round.stake, finalMultiplier)

        if (payout > 0) kit.addWinnings(payout)
        kit.stats.record({
            bet: round.stake,
            payout,
            multiplier: finalMultiplier,
            nonce: round.nonce,
            detail: `${state.correct} correct, ended on ${cardLabel(state.current)}`,
        })
        kit.end()

        if (silent) return
        addResult(formatMultiplier(finalMultiplier), lost ? 'loss' : 'win')
        if (lost) {
            kit.sound.play('wrong')
            kit.sound.play('lose', { volume: 0.7 })
            kit.showToast('loss', 'Wrong call', `-₿${formatAmount(round.stake)}`)
        } else if (refund) {
            kit.showToast('bet', 'Bet returned', `₿${formatAmount(payout)}`)
        } else {
            kit.sound.play(finalMultiplier >= 10 ? 'win-big' : 'cashout')
            kit.showToast('win', 'Cashed out', `+₿${formatAmount(payout - round.stake)} at ${formatMultiplier(finalMultiplier)}`, 4000)
        }
    }, [addResult, kit])

    const settleRef = useRef(settle)
    settleRef.current = settle

    useEffect(() => {
        const leave = () => {
            if (roundRef.current) settleRef.current(roundRef.current.state, { silent: true })
        }
        window.addEventListener('pagehide', leave)
        return () => {
            window.removeEventListener('pagehide', leave)
            leave()
        }
    }, [])

    const start = async () => {
        const round = kit.begin(bet)
        if (round.status !== 'started') return
        setStarting(true)
        kit.sound.play('bet')
        try {
            const { floats, nonce } = await kit.fairness.getFloats(HILO_FLOATS)
            if (!kit.mountedRef.current) {
                kit.addWinnings(round.amount)
                kit.end()
                return
            }
            const state = createHiLo(floats)
            roundRef.current = { stake: round.amount, nonce, state }
            setGame(state)
            kit.sound.play('card')
        } catch (error) {
            console.error('HiLo start failed', error)
            kit.addWinnings(round.amount)
            kit.showToast('error', 'Bet refunded', 'Something went wrong, so your stake was returned.')
            kit.end()
        } finally {
            setStarting(false)
        }
    }

    const act = async (apply) => {
        const round = roundRef.current
        if (!round || actionLock.current) return
        actionLock.current = true

        const next = apply(round.state)
        if (next === round.state) {
            actionLock.current = false
            return
        }

        round.state = next
        setGame(next)
        kit.sound.play('flip')
        if (next.trail.at(-1).outcome === 'correct') kit.sound.play('correct', { volume: 0.7 })
        await kit.wait(ACTION_MS)
        actionLock.current = false

        if (next.status !== 'playing' && roundRef.current === round) settle(next)
    }

    const cashOut = () => {
        if (!canCashOut || actionLock.current || !roundRef.current) return
        const state = roundRef.current.state
        settle(state)
        setGame({ ...state, status: 'cashed' })
    }

    const controls = (
        <>
            <BetAmountInput value={bet} onChange={setBet} balance={kit.balance} disabled={inRound} />
            <Readout label={`Total Profit (${formatMultiplier(playing ? multiplier : 1)})`} value={formatAmount(playing ? Math.max(0, payoutFor(bet, multiplier) - bet) : 0)} tone={canCashOut ? 'win' : undefined} />
            {playing ? (
                <PrimaryButton onClick={cashOut} disabled={!canCashOut}>Cash Out</PrimaryButton>
            ) : (
                <PrimaryButton onClick={start} disabled={kit.busy}>Bet</PrimaryButton>
            )}
        </>
    )

    const trail = game?.trail.slice(-12) ?? []

    return (
        <GameShell kit={kit} className="hilo-game" controls={controls} collapseOn={inRound} locked={kit.busy}>
            <div className="hilo-board">
                <ResultStrip results={results} label="Recent rounds" />
                <div className="hilo-table">
                    <div className="hilo-deck" aria-hidden="true"><PlayingCard faceDown /></div>
                    <div className="hilo-current">
                        <PlayingCard key={game ? game.cursor : 'idle'} card={game?.current} faceDown={!game} tone={game?.status === 'lost' ? 'loss' : game?.status === 'cashed' || game?.status === 'capped' ? 'win' : undefined} />
                    </div>
                    <div className="hilo-multiplier">
                        <small>Multiplier</small>
                        <strong className={game?.status === 'lost' ? 'is-loss' : canCashOut ? 'is-win' : ''}>{formatMultiplier(game?.status === 'lost' ? 0 : multiplier)}</strong>
                    </div>
                </div>
                <div className="hilo-actions">
                    {['high', 'low'].map((guess) => {
                        const allowed = playing && canGuess(rank, guess)
                        return (
                            <button key={guess} type="button" className={`hilo-guess is-${guess}`} disabled={!allowed} onClick={() => act((state) => applyGuess(state, guess))}>
                                <span aria-hidden="true">{guess === 'high' ? '▲' : '▼'}</span>
                                <strong>{game ? guessLabel(rank, guess) : guess === 'high' ? 'Higher or Same' : 'Lower or Same'}</strong>
                                <small>{playing && allowed ? `${(guessChance(rank, guess) * 100).toFixed(2)}% · ${formatMultiplier(nextMultiplier(game, guess))}` : '—'}</small>
                            </button>
                        )
                    })}
                    <SecondaryButton className="hilo-skip" disabled={!playing} onClick={() => act(applySkip)}>Skip Card</SecondaryButton>
                </div>
                <p className="hilo-note">Rounds cash out automatically at 1000×</p>
                <div className="hilo-trail" aria-label="Previous cards">
                    {trail.map((step, index) => (
                        <div key={`${game.actions - trail.length + index}`} className="hilo-trail-item">
                            <PlayingCard small card={step.card} tone={step.outcome === 'wrong' ? 'loss' : step.outcome === 'correct' ? 'win' : undefined} />
                        </div>
                    ))}
                </div>
            </div>
        </GameShell>
    )
}

export default HiLoGame
