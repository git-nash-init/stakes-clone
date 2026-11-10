import { floorCents } from '../GameKit/money.js'
import { rankOf } from '../GameKit/cards.js'

export const BLACKJACK_FLOATS = 80
const SHOE_SIZE = 312

export function dealShoe(floats) {
    const shoe = Array.from({ length: SHOE_SIZE }, (_, index) => index)
    for (let i = 0; i < floats.length; i++) {
        const swap = i + Math.floor(floats[i] * (SHOE_SIZE - i))
        ;[shoe[i], shoe[swap]] = [shoe[swap], shoe[i]]
    }
    return shoe.slice(0, floats.length)
}

export function cardValue(card) {
    const rank = rankOf(card)
    if (rank === 12) return 11
    return Math.min(rank + 2, 10)
}

export function handValue(cards) {
    let total = 0
    let aces = 0
    for (const card of cards) {
        total += cardValue(card)
        if (rankOf(card) === 12) aces++
    }
    while (total > 21 && aces > 0) {
        total -= 10
        aces--
    }
    return { total, soft: aces > 0 }
}

const isTwentyOne = (cards) => handValue(cards).total === 21
const isNatural = (cards) => cards.length === 2 && isTwentyOne(cards)
const isBust = (cards) => handValue(cards).total > 21

function draw(state) {
    const card = state.shoe[state.next]
    state.next++
    return card
}

function clone(state) {
    return { ...state, dealer: [...state.dealer], hands: state.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })) }
}

function finish(state) {
    state.phase = 'finished'
    const dealerNatural = isNatural(state.dealer)
    state.dealerBlackjack = dealerNatural
    const contested = !dealerNatural
        && state.hands.some((hand) => !isBust(hand.cards) && !(hand.natural))

    if (contested) {
        while (handValue(state.dealer).total < 17) state.dealer.push(draw(state))
    }

    const dealerTotal = handValue(state.dealer).total
    for (const hand of state.hands) {
        const total = handValue(hand.cards).total
        let payout = 0
        let result = 'lose'

        if (total > 21) {
            result = 'bust'
        } else if (hand.natural) {
            result = dealerNatural ? 'push' : 'blackjack'
            payout = dealerNatural ? hand.bet : hand.bet * 2.5
        } else if (dealerNatural) {
            result = 'lose'
        } else if (dealerTotal > 21 || total > dealerTotal) {
            result = 'win'
            payout = hand.bet * 2
        } else if (total === dealerTotal) {
            result = 'push'
            payout = hand.bet
        }

        hand.result = result
        hand.payout = floorCents(payout)
    }

    state.insurancePayout = dealerNatural ? floorCents(state.insurance * 3) : 0
    return state
}

function moveToNextHand(state) {
    const next = state.hands.findIndex((hand) => !hand.done)
    if (next === -1) return finish(state)
    state.active = next
    return state
}

function peek(state) {
    const up = cardValue(state.dealer[0])
    if ((up === 11 || up === 10) && isNatural(state.dealer)) return finish(state)
    if (state.hands[0].natural) return finish(state)
    state.phase = 'player'
    return state
}

export function createBlackjack(floats, bet) {
    const state = {
        shoe: dealShoe(floats),
        next: 0,
        baseBet: bet,
        dealer: [],
        hands: [{ cards: [], bet, split: false, done: false, natural: false, result: null, payout: 0 }],
        active: 0,
        insurance: 0,
        insurancePayout: 0,
        dealerBlackjack: false,
        phase: 'dealing',
    }

    state.hands[0].cards.push(draw(state))
    state.dealer.push(draw(state))
    state.hands[0].cards.push(draw(state))
    state.dealer.push(draw(state))
    state.hands[0].natural = isNatural(state.hands[0].cards)

    if (cardValue(state.dealer[0]) === 11) {
        state.phase = 'insurance'
        return state
    }
    return peek(state)
}

export function insuranceCost(state) {
    return floorCents(state.baseBet / 2)
}

export function resolveInsurance(previous, take) {
    if (previous.phase !== 'insurance') return previous
    const state = clone(previous)
    state.insurance = take ? insuranceCost(state) : 0
    return peek(state)
}

export function legalActions(state) {
    if (state.phase !== 'player') return { hit: false, stand: false, double: false, split: false }
    const hand = state.hands[state.active]
    const twoCards = hand.cards.length === 2
    return {
        hit: true,
        stand: true,
        double: twoCards,
        split: twoCards && state.hands.length === 1 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]),
    }
}

function settleActive(state) {
    const hand = state.hands[state.active]
    if (isBust(hand.cards) || isTwentyOne(hand.cards)) {
        hand.done = true
        return moveToNextHand(state)
    }
    return state
}

export function hit(previous) {
    if (!legalActions(previous).hit) return previous
    const state = clone(previous)
    state.hands[state.active].cards.push(draw(state))
    return settleActive(state)
}

export function stand(previous) {
    if (!legalActions(previous).stand) return previous
    const state = clone(previous)
    state.hands[state.active].done = true
    return moveToNextHand(state)
}

export function double(previous) {
    if (!legalActions(previous).double) return previous
    const state = clone(previous)
    const hand = state.hands[state.active]
    hand.bet = floorCents(hand.bet * 2)
    hand.cards.push(draw(state))
    hand.done = true
    return moveToNextHand(state)
}

export function split(previous) {
    if (!legalActions(previous).split) return previous
    const state = clone(previous)
    const [first, second] = state.hands[0].cards
    const splitAces = rankOf(first) === 12
    const makeHand = (card) => {
        const cards = [card, draw(state)]
        return {
            cards,
            bet: state.baseBet,
            split: true,
            natural: false,
            result: null,
            payout: 0,
            done: splitAces || isTwentyOne(cards),
        }
    }
    state.hands = [makeHand(first), makeHand(second)]
    return moveToNextHand(state)
}

export function extraStakeFor(state, action) {
    if (action === 'double') return state.hands[state.active].bet
    if (action === 'split') return state.baseBet
    if (action === 'insurance') return insuranceCost(state)
    return 0
}

export function autoFinish(previous) {
    let state = previous.phase === 'insurance' ? resolveInsurance(previous, false) : previous
    while (state.phase === 'player') state = stand(state)
    return state
}

export function totalWagered(state) {
    return floorCents(state.hands.reduce((sum, hand) => sum + hand.bet, 0) + state.insurance)
}

export function totalPayout(state) {
    return floorCents(state.hands.reduce((sum, hand) => sum + hand.payout, 0) + state.insurancePayout)
}
