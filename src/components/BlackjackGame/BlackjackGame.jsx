import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../GameKit/GameShell'
import { useGameKit, useRecentResults } from '../GameKit/useGameKit'
import { BetAmountInput, PlayingCard, PrimaryButton, ResultStrip, SecondaryButton } from '../GameKit/controls'
import { cardLabel } from '../GameKit/cards'
import { formatAmount, formatMultiplier } from '../GameKit/money'
import {
    BLACKJACK_FLOATS,
    autoFinish,
    createBlackjack,
    dealShoe,
    double as doubleHand,
    extraStakeFor,
    handValue,
    hit,
    insuranceCost,
    legalActions,
    resolveInsurance,
    split as splitHand,
    stand,
    totalPayout,
    totalWagered,
} from './engine'
import './BlackjackGame.css'

const SOUNDS = ['bet', 'card', 'chip', 'win', 'win-big', 'push', 'lose', 'bust']
const VERIFIER = {
    floats: BLACKJACK_FLOATS,
    describe: (floats) => `First cards: ${dealShoe(floats).slice(0, 10).map(cardLabel).join(' ')}`,
}
const RESULT_LABELS = { blackjack: 'Blackjack!', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' }
const CARD_MS = 170
const DEALER_MS = 380

function totalLabel(cards) {
    const { total, soft } = handValue(cards)
    return soft && total < 21 ? `${total - 10}/${total}` : String(total)
}

function resultSummary(state) {
    return state.hands.map((hand) => RESULT_LABELS[hand.result]).join(', ')
}

function BlackjackGame() {
    const kit = useGameKit({ id: 'blackjack', title: 'Blackjack', sounds: SOUNDS, verifier: VERIFIER })
    const [bet, setBet] = useState(1)
    const [game, setGame] = useState(null)
    const [dealerShown, setDealerShown] = useState(1)
    const [revealing, setRevealing] = useState(false)
    const [starting, setStarting] = useState(false)
    const [acting, setActing] = useState(false)
    const [results, addResult] = useRecentResults()
    const roundRef = useRef(null)
    const lockRef = useRef(false)

    const inRound = kit.busy || starting
    const actions = game && !revealing && !acting && !starting ? legalActions(game) : legalActions({ phase: 'none' })
    const finished = game?.phase === 'finished' && !revealing
    const canAfford = (action) => game && game.phase !== 'finished' && kit.balance >= extraStakeFor(game, action)
    const insuranceOffered = game?.phase === 'insurance' && !acting && !starting

    const concludeRound = useCallback(async (state) => {
        const round = roundRef.current
        if (!round) return
        roundRef.current = null

        const payout = totalPayout(state)
        const wagered = totalWagered(state)
        kit.hold(payout)
        setGame(state)
        setRevealing(true)

        for (let shown = 2; shown <= state.dealer.length; shown++) {
            await kit.wait(DEALER_MS)
            setDealerShown(shown)
            kit.sound.play('card')
        }
        await kit.wait(220)

        kit.release()
        kit.stats.record({
            bet: wagered,
            payout,
            multiplier: wagered > 0 ? payout / wagered : 0,
            nonce: round.nonce,
            detail: `${resultSummary(state)} (dealer ${handValue(state.dealer).total})`,
        })
        kit.end()
        setRevealing(false)

        const profit = payout - wagered
        const blackjack = state.hands.some((hand) => hand.result === 'blackjack')
        addResult(profit > 0 ? `+${formatAmount(profit)}` : profit < 0 ? formatAmount(profit) : 'Push', profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push')
        if (blackjack && profit > 0) {
            kit.sound.play('win-big')
            kit.showToast('win', 'Blackjack!', `+₿${formatAmount(profit)}`, 4000)
        } else if (profit > 0) {
            kit.sound.play('win')
            kit.showToast('win', 'You win', `+₿${formatAmount(profit)}`)
        } else if (profit === 0) {
            kit.sound.play('push')
            kit.showToast('bet', 'Push', 'Your stake was returned.')
        } else {
            kit.sound.play(state.hands.every((hand) => hand.result === 'bust') ? 'bust' : 'lose')
            kit.showToast('loss', 'Dealer wins', `-₿${formatAmount(-profit)}`)
        }
    }, [addResult, kit])

    const leaveRef = useRef(() => {})
    leaveRef.current = () => {
        const round = roundRef.current
        if (!round) return
        roundRef.current = null
        const state = autoFinish(round.state)
        const payout = totalPayout(state)
        const wagered = totalWagered(state)
        if (payout > 0) kit.addWinnings(payout)
        kit.stats.record({
            bet: wagered,
            payout,
            multiplier: wagered > 0 ? payout / wagered : 0,
            nonce: round.nonce,
            detail: `Auto-stood on leaving: ${resultSummary(state)}`,
        })
        kit.end()
    }

    useEffect(() => {
        const leave = () => leaveRef.current()
        window.addEventListener('pagehide', leave)
        return () => {
            window.removeEventListener('pagehide', leave)
            leave()
        }
    }, [])

    const deal = async () => {
        const round = kit.begin(bet)
        if (round.status !== 'started') return
        setStarting(true)
        setDealerShown(1)
        kit.sound.play('bet')

        try {
            const { floats, nonce } = await kit.fairness.getFloats(BLACKJACK_FLOATS)
            if (!kit.mountedRef.current) {
                kit.addWinnings(round.amount)
                kit.end()
                return
            }
            const state = createBlackjack(floats, round.amount)
            roundRef.current = { nonce, state, stake: round.amount }
            setGame(state)
            for (let i = 0; i < 4; i++) {
                kit.sound.play('card')
                await kit.wait(CARD_MS)
            }
            if (state.phase === 'finished' && roundRef.current) await concludeRound(state)
        } catch (error) {
            console.error('Blackjack deal failed', error)
            roundRef.current = null
            kit.addWinnings(round.amount)
            kit.showToast('error', 'Bet refunded', 'Something went wrong, so your stake was returned.')
            kit.end()
        } finally {
            setStarting(false)
        }
    }

    const perform = async (apply, { action, sound = 'card' } = {}) => {
        const round = roundRef.current
        if (!round || lockRef.current || starting) return
        lockRef.current = true
        setActing(true)

        try {
            if (action) {
                const extra = extraStakeFor(round.state, action)
                if (!kit.placeBet(extra)) {
                    kit.showToast('error', 'Insufficient balance', `You need ₿${formatAmount(extra)}`)
                    return
                }
                kit.sound.play('chip')
            }

            const next = apply(round.state)
            round.state = next
            setGame(next)
            if (sound) kit.sound.play(sound)
            await kit.wait(CARD_MS)
            if (next.phase === 'finished' && roundRef.current === round) await concludeRound(next)
        } finally {
            lockRef.current = false
            setActing(false)
        }
    }

    const controls = (
        <>
            <BetAmountInput value={bet} onChange={setBet} balance={kit.balance} disabled={inRound} />
            <PrimaryButton onClick={deal} disabled={inRound}>{finished ? 'Deal Again' : 'Deal'}</PrimaryButton>
        </>
    )

    const dealerCards = game?.dealer ?? []
    const dealerVisible = game?.phase === 'finished' ? dealerShown : 1
    const showDealerTotal = game && dealerVisible >= dealerCards.length

    return (
        <GameShell kit={kit} className="blackjack-game" controls={controls} collapseOn={inRound} locked={inRound}>
            <div className="bj-board">
                <ResultStrip results={results} label="Recent hands" />
                <div className="bj-table">
                    <section className="bj-seat" aria-label="Dealer hand">
                        <div className="bj-seat-label">Dealer {game && <span className="bj-total">{showDealerTotal ? totalLabel(dealerCards) : totalLabel(dealerCards.slice(0, 1))}</span>}</div>
                        <div className="bj-hand">
                            {game ? dealerCards.map((card, index) => (
                                <PlayingCard key={index} card={card} faceDown={index >= dealerVisible} />
                            )) : (<><PlayingCard faceDown /><PlayingCard faceDown /></>)}
                        </div>
                    </section>

                    <p className="bj-rules">Blackjack pays 3 to 2 · Dealer stands on all 17s · Insurance pays 2 to 1</p>

                    <div className="bj-player-hands">
                        {(game?.hands ?? [null]).map((hand, handIndex) => {
                            const isActive = game?.phase === 'player' && game.active === handIndex && (game.hands.length > 1)
                            const showResult = hand?.result && !revealing
                            return (
                                <section key={handIndex} className={`bj-seat ${isActive ? 'is-active' : ''}`} aria-label={`Player hand ${handIndex + 1}`}>
                                    <div className="bj-hand">
                                        {hand ? hand.cards.map((card, index) => <PlayingCard key={index} card={card} />) : (<><PlayingCard faceDown /><PlayingCard faceDown /></>)}
                                    </div>
                                    <div className="bj-seat-label">
                                        {hand ? <span className="bj-total">{totalLabel(hand.cards)}</span> : 'Your hand'}
                                        {hand && <span className="bj-bet">₿{formatAmount(hand.bet)}</span>}
                                        {showResult && <span className={`bj-result is-${hand.result}`}>{RESULT_LABELS[hand.result]}</span>}
                                    </div>
                                </section>
                            )
                        })}
                    </div>
                </div>

                {insuranceOffered ? (
                    <div className="bj-actions bj-insurance">
                        <p>Dealer shows an Ace. Take insurance for ₿{formatAmount(insuranceCost(game))}?</p>
                        <SecondaryButton disabled={!canAfford('insurance') || insuranceCost(game) <= 0} onClick={() => perform((state) => resolveInsurance(state, true), { action: 'insurance', sound: null })}>Yes</SecondaryButton>
                        <SecondaryButton onClick={() => perform((state) => resolveInsurance(state, false), { sound: null })}>No</SecondaryButton>
                    </div>
                ) : (
                    <div className="bj-actions">
                        <SecondaryButton disabled={!actions.hit} onClick={() => perform(hit)}>Hit</SecondaryButton>
                        <SecondaryButton disabled={!actions.stand} onClick={() => perform(stand, { sound: null })}>Stand</SecondaryButton>
                        <SecondaryButton disabled={!actions.double || !canAfford('double')} onClick={() => perform(doubleHand, { action: 'double' })}>Double</SecondaryButton>
                        <SecondaryButton disabled={!actions.split || !canAfford('split')} onClick={() => perform(splitHand, { action: 'split' })}>Split</SecondaryButton>
                    </div>
                )}
                {game?.phase === 'finished' && !revealing && <p className="bj-summary">Paid {formatMultiplier(totalWagered(game) > 0 ? totalPayout(game) / totalWagered(game) : 0)} on ₿{formatAmount(totalWagered(game))}</p>}
            </div>
        </GameShell>
    )
}

export default BlackjackGame
