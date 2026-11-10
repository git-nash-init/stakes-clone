import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import ProvablyFair from '../../utils/ProvablyFair.js'
import { normalizeBet, payoutFor } from './money.js'
import { nextAutoBet, shouldStopAuto } from './useAutoBet.helpers.js'
import { chanceFor, diceMultiplier, rollFromFloat, settleDice } from '../DiceGame/engine.js'
import { limboResult, settleLimbo } from '../LimboGame/engine.js'
import { KENO_DRAWS, KENO_MAX_MULTIPLIER, KENO_RISKS, drawKeno, hitProbabilities, kenoPaytable, settleKeno } from '../KenoGame/engine.js'
import { RED_NUMBERS, WHEEL_ORDER, betMultiple, betWins, pocketFromFloat, settleRoulette } from '../RouletteGame/engine.js'
import { HILO_FLOATS, HILO_MAX_MULTIPLIER, applyGuess, applySkip, canGuess, createHiLo, currentMultiplier, guessChance } from '../HiLoGame/engine.js'
import { BLACKJACK_FLOATS, autoFinish, cardValue, createBlackjack, double, handValue, hit, legalActions, resolveInsurance, split, stand, totalPayout, totalWagered } from '../BlackjackGame/engine.js'

function seeded(seed) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

const floatsFrom = (random, count) => Array.from({ length: count }, () => random())
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

test('getFloats uses one nonce per bet and concurrent bets never share one', async () => {
    const fair = new ProvablyFair()
    const results = await Promise.all([fair.getFloats(10), fair.getFloats(10), fair.getFloats(10)])
    assert.deepEqual(results.map((result) => result.nonce), [0, 1, 2])
    assert.equal(fair.nonce, 3)
    for (const { floats, nonce } of results) {
        assert.equal(floats.length, 10)
        assert.ok(floats.every((float) => float >= 0 && float < 1))
        assert.deepEqual(await ProvablyFair.deriveFloats(fair.serverSeed, fair.clientSeed, nonce, 10), floats)
    }
})

test('re-entering the same client seed cannot replay known outcomes', async () => {
    const fair = new ProvablyFair()
    const seed = fair.clientSeed
    await fair.getFloats(1)
    await fair.setClientSeed(seed)
    assert.equal(fair.nonce, 1)

    const firstServerSeed = fair.serverSeed
    await fair.setClientSeed('another-seed')
    await fair.setClientSeed(seed)
    assert.notEqual(fair.serverSeed, firstServerSeed)
    assert.equal(fair.previousSeeds.at(-1).serverSeed, firstServerSeed)
})

test('money helpers only ever produce whole cents', () => {
    assert.equal(normalizeBet(0.001), 0)
    assert.equal(normalizeBet(1.239), 1.23)
    assert.equal(normalizeBet('abc'), 0)
    assert.equal(normalizeBet(-5), 0)
    assert.equal(payoutFor(0.29, 100), 29)
    assert.equal(payoutFor(0.01, 1.5), 0.01)
})

test('auto-bet strategy resets, increases and stops correctly', () => {
    const config = { onWin: 'reset', onWinPct: 0, onLoss: 'increase', onLossPct: 100, stopProfit: 5, stopLoss: 8 }
    assert.equal(nextAutoBet(4, 1, 2, config), 1)
    assert.equal(nextAutoBet(4, 1, -4, config), 8)
    assert.equal(nextAutoBet(4, 1, 0, config), 4)
    assert.equal(shouldStopAuto(5, config), true)
    assert.equal(shouldStopAuto(-8, config), true)
    assert.equal(shouldStopAuto(1, config), false)
})

test('dice pays exactly 99% over every target', () => {
    for (const mode of ['over', 'under']) {
        for (let target = 2; target <= 98; target++) {
            let wins = 0
            for (let i = 0; i < 10000; i++) {
                if (settleDice((i + 0.5) / 10000, mode, target).win) wins++
            }
            const chance = chanceFor(mode, target)
            assert.equal(wins, chance * 100)
            close((wins / 10000) * (99 / chance), 0.99)
        }
    }
    assert.equal(rollFromFloat(0), 0)
    assert.equal(rollFromFloat(0.999999999), 99.99)
    assert.equal(diceMultiplier(50), 1.98)
})

test('limbo win probability is 0.99 / target', () => {
    for (const target of [1.01, 1.5, 2, 10, 100, 1000]) {
        const lastLosingFloat = 1 - 99 / (100 * target)
        assert.equal(settleLimbo(Math.min(0.99999999, lastLosingFloat + 1e-7), target).win, true, `just above ${target}`)
        assert.equal(settleLimbo(Math.max(0, lastLosingFloat - 1e-7), target).win, false, `just below ${target}`)
    }
    assert.equal(limboResult(0), 1)
    assert.equal(limboResult(0.9999999999), 1000)
})

test('keno tables hit the 99% target and never exceed the cap', () => {
    for (const risk of Object.keys(KENO_RISKS)) {
        for (let picks = 1; picks <= 10; picks++) {
            const table = kenoPaytable(picks, risk)
            const probabilities = hitProbabilities(picks)
            const rtp = table.reduce((sum, multiplier, hits) => sum + multiplier * probabilities[hits], 0)
            close(probabilities.reduce((sum, value) => sum + value, 0), 1)
            assert.ok(rtp <= 0.99 + 1e-9 && rtp >= 0.975, `${risk}/${picks} RTP ${rtp}`)
            assert.equal(table.length, picks + 1)
            assert.ok(Math.max(...table) <= KENO_MAX_MULTIPLIER)
            for (let hits = 1; hits < table.length; hits++) assert.ok(table[hits] >= table[hits - 1])
        }
    }
})

test('keno draws 10 unique tiles, deterministically', () => {
    const random = seeded(7)
    for (let i = 0; i < 2000; i++) {
        const floats = floatsFrom(random, KENO_DRAWS)
        const drawn = drawKeno(floats)
        assert.equal(new Set(drawn).size, 10)
        assert.ok(drawn.every((tile) => tile >= 1 && tile <= 40))
        assert.deepEqual(drawKeno(floats), drawn)
    }
    const floats = floatsFrom(random, KENO_DRAWS)
    const { hits, multiplier } = settleKeno(floats, drawKeno(floats).slice(0, 3), 'high')
    assert.equal(hits, 3)
    assert.equal(multiplier, kenoPaytable(3, 'high')[3])
})

test('roulette has every pocket once and pays 36/37 on every bet type', () => {
    assert.deepEqual([...WHEEL_ORDER].sort((a, b) => a - b), Array.from({ length: 37 }, (_, n) => n))
    assert.equal(RED_NUMBERS.size, 18)
    assert.equal(pocketFromFloat(0.9999999), 36)

    const keys = [...Array.from({ length: 37 }, (_, n) => `n${n}`), 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3']
    for (const key of keys) {
        const winners = Array.from({ length: 37 }, (_, pocket) => pocket).filter((pocket) => betWins(key, pocket)).length
        close((winners * betMultiple(key)) / 37, 36 / 37)
    }
    for (const key of ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'column1']) assert.equal(betWins(key, 0), false)

    const zeroFloat = 0.001
    assert.deepEqual(settleRoulette(zeroFloat, { n0: 1, red: 5 }), { pocket: 0, payout: 36, winners: ['n0'] })
})

test('hilo pays 99% at every step and never offers a guaranteed guess', () => {
    for (let rank = 0; rank < 13; rank++) {
        for (const guess of ['high', 'low']) {
            const chance = guessChance(rank, guess)
            assert.ok(chance > 0 && chance <= 1)
            assert.equal(canGuess(rank, guess), chance < 1)
        }
    }

    const random = seeded(11)
    let staked = 0
    let returned = 0
    for (let i = 0; i < 300000; i++) {
        let state = createHiLo(floatsFrom(random, HILO_FLOATS))
        const steps = 1 + (i % 2) // Two steps stay under the 1000x cap, so the 99% holds.
        while (state.status === 'playing' && state.correct < steps) {
            const rank = state.current % 13
            // Always take the likelier allowed side, which stays below the 1000x cap.
            const preferred = guessChance(rank, 'high') >= guessChance(rank, 'low') ? 'high' : 'low'
            state = applyGuess(state, canGuess(rank, preferred) ? preferred : preferred === 'high' ? 'low' : 'high')
        }
        staked++
        if (state.status !== 'lost') returned += currentMultiplier(state)
    }
    const rtp = returned / staked
    assert.ok(rtp > 0.96 && rtp < 1.02, `HiLo RTP ${rtp}`)
})

test('hilo guards terminal states, skips without payout and caps the multiplier', () => {
    const lowFloat = 0.0001
    const state = createHiLo(Array(HILO_FLOATS).fill(lowFloat))
    assert.equal(state.current, 0)
    assert.equal(applyGuess(state, 'high'), state)

    const skipped = applySkip(state)
    assert.equal(skipped.product, 1)
    assert.equal(skipped.correct, 0)
    assert.equal(currentMultiplier(skipped), 1)

    let long = createHiLo(Array(HILO_FLOATS).fill(0.9999))
    for (let i = 0; i < 60 && long.status === 'playing'; i++) long = applyGuess(long, 'high')
    assert.equal(long.status, 'capped')
    assert.ok(currentMultiplier(long) <= HILO_MAX_MULTIPLIER)
    assert.equal(applyGuess(long, 'high'), long)
})

// Forces a known deal: floats map to shoe index so the first cards are chosen.
function stackedFloats(cards) {
    const shoe = Array.from({ length: 312 }, (_, index) => index)
    const floats = []
    cards.forEach((card, i) => {
        const position = shoe.findIndex((candidate, index) => index >= i && candidate % 13 === card % 13)
        floats.push((position - i + 0.5) / (312 - i))
        ;[shoe[i], shoe[position]] = [shoe[position], shoe[i]]
    })
    while (floats.length < BLACKJACK_FLOATS) floats.push(0.5)
    return floats
}

const rank = (index) => index // suit 0 card with rank index: 0=2 ... 8=10, 9=J, 12=A

test('blackjack hand values handle soft aces', () => {
    assert.deepEqual(handValue([rank(12), rank(4)]), { total: 17, soft: true })
    assert.deepEqual(handValue([rank(12), rank(12), rank(8)]), { total: 12, soft: false })
    assert.equal(cardValue(rank(11)), 10)
})

test('blackjack natural pays 3:2, and dealer stands on soft 17', () => {
    const natural = createBlackjack(stackedFloats([rank(12), rank(3), rank(9), rank(8)]), 10)
    assert.equal(natural.phase, 'finished')
    assert.equal(natural.hands[0].result, 'blackjack')
    assert.equal(totalPayout(natural), 25)

    const soft17 = stand(createBlackjack(stackedFloats([rank(8), rank(12 + 13 * 0), rank(7), rank(4)]), 10))
    assert.equal(soft17.phase, 'insurance')
    const declined = stand(resolveInsurance(soft17, false))
    assert.equal(declined.dealer.length, 2)
    assert.equal(handValue(declined.dealer).total, 17)
    assert.equal(declined.hands[0].result, 'win')
})

test('blackjack double, split, bust and push settle correctly', () => {
    const doubled = double(createBlackjack(stackedFloats([rank(4), rank(8), rank(3), rank(8), rank(6)]), 10))
    assert.equal(doubled.hands[0].bet, 20)
    assert.equal(handValue(doubled.hands[0].cards).total, 19)
    assert.equal(doubled.phase, 'finished')
    assert.equal(doubled.hands[0].result, 'lose')
    assert.equal(totalWagered(doubled), 20)

    const busted = hit(createBlackjack(stackedFloats([rank(8), rank(8), rank(4), rank(5), rank(9)]), 10))
    assert.equal(busted.hands[0].result, 'bust')
    assert.equal(totalPayout(busted), 0)
    assert.equal(busted.dealer.length, 2)

    const pushed = stand(createBlackjack(stackedFloats([rank(8), rank(8), rank(7), rank(7)]), 10))
    assert.equal(pushed.hands[0].result, 'push')
    assert.equal(totalPayout(pushed), 10)

    const pair = createBlackjack(stackedFloats([rank(6), rank(4), rank(6), rank(8), rank(8), rank(8)]), 10)
    assert.equal(legalActions(pair).split, true)
    const splitRound = split(pair)
    assert.equal(splitRound.hands.length, 2)
    assert.equal(totalWagered(splitRound), 20)
    assert.equal(legalActions(splitRound).split, false)
})

test('split aces receive one card each and 21 after a split is not a blackjack', () => {
    const round = split(createBlackjack(stackedFloats([rank(12), rank(4), rank(12), rank(8), rank(8), rank(8), rank(8)]), 10))
    assert.equal(round.phase, 'finished')
    assert.equal(round.hands[0].result, 'win')
    assert.equal(round.hands[0].payout, 20)
})

test('insurance pays 2:1 when the dealer has blackjack', () => {
    const round = resolveInsurance(createBlackjack(stackedFloats([rank(8), rank(12), rank(8), rank(9)]), 10), true)
    assert.equal(round.phase, 'finished')
    assert.equal(round.dealerBlackjack, true)
    assert.equal(round.insurance, 5)
    assert.equal(totalPayout(round), 15)
    assert.equal(totalWagered(round), 15)
})

test('auto-finish always reaches a settled round', () => {
    const random = seeded(23)
    for (let i = 0; i < 3000; i++) {
        const finished = autoFinish(createBlackjack(floatsFrom(random, BLACKJACK_FLOATS), 10))
        assert.equal(finished.phase, 'finished')
        assert.ok(finished.hands.every((hand) => hand.result !== null))
        assert.ok(finished.next <= BLACKJACK_FLOATS)
    }
})

function basicAction(hand, dealerUp, canSplit, canDouble) {
    const { total, soft } = handValue(hand)
    if (canSplit) {
        const value = cardValue(hand[0])
        if (value === 11 || value === 8) return 'split'
        if (value === 9 && dealerUp !== 7 && dealerUp < 10) return 'split'
        if ((value === 2 || value === 3 || value === 7) && dealerUp <= 7) return 'split'
        if (value === 6 && dealerUp <= 6) return 'split'
        if (value === 4 && (dealerUp === 5 || dealerUp === 6)) return 'split'
    }
    if (soft) {
        if (total >= 19) return total === 19 && dealerUp === 6 && canDouble ? 'double' : 'stand'
        if (total === 18) {
            if (dealerUp >= 3 && dealerUp <= 6 && canDouble) return 'double'
            return dealerUp <= 8 ? 'stand' : 'hit'
        }
        const low = { 17: 3, 16: 4, 15: 4, 14: 5, 13: 5 }[total] ?? 7
        return dealerUp >= low && dealerUp <= 6 && canDouble ? 'double' : 'hit'
    }
    if (total >= 17) return 'stand'
    if (total >= 13) return dealerUp <= 6 ? 'stand' : 'hit'
    if (total === 12) return dealerUp >= 4 && dealerUp <= 6 ? 'stand' : 'hit'
    if (total === 11) return canDouble ? 'double' : 'hit'
    if (total === 10) return dealerUp <= 9 && canDouble ? 'double' : 'hit'
    if (total === 9) return dealerUp >= 3 && dealerUp <= 6 && canDouble ? 'double' : 'hit'
    return 'hit'
}

export function simulateBlackjack(rounds, seed) {
    const random = seeded(seed)
    let wagered = 0
    let returned = 0
    for (let i = 0; i < rounds; i++) {
        let state = createBlackjack(floatsFrom(random, BLACKJACK_FLOATS), 100)
        if (state.phase === 'insurance') state = resolveInsurance(state, false)
        while (state.phase === 'player') {
            const allowed = legalActions(state)
            const hand = state.hands[state.active]
            const action = basicAction(hand.cards, cardValue(state.dealer[0]), allowed.split, allowed.double)
            state = { hit, stand, double, split }[action](state)
        }
        wagered += 100
        returned += totalPayout(state) - (totalWagered(state) - 100)
    }
    return returned / wagered
}

test('blackjack RTP under basic strategy matches the published label', (t) => {
    const rtp = simulateBlackjack(Number(process.env.BJ_ROUNDS) || 120000, 99)
    t.diagnostic(`Blackjack RTP ${rtp}`)
    assert.ok(rtp > 0.98 && rtp < 1.01, `Blackjack RTP ${rtp}`)
})

test('every sound a game references exists on disk', () => {
    const componentsDir = new URL('../', import.meta.url)
    const names = new Set()
    for (const folder of readdirSync(componentsDir)) {
        if (!folder.endsWith('Game')) continue
        const folderUrl = new URL(`${folder}/`, componentsDir)
        for (const file of readdirSync(folderUrl)) {
            if (!file.endsWith('.jsx')) continue
            const source = readFileSync(new URL(file, folderUrl), 'utf8')
            for (const match of source.matchAll(/const SOUNDS = \[([^\]]*)\]/g)) {
                for (const name of match[1].matchAll(/'([\w-]+)'/g)) names.add(name[1])
            }
        }
    }
    assert.ok(names.size > 10, 'expected games to declare their sounds')
    for (const name of names) {
        assert.ok(existsSync(new URL(`../../../public/sounds/${name}.mp3`, import.meta.url)), `Missing sound ${name}`)
    }
})
