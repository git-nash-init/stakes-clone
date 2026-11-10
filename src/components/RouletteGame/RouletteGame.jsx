import { useCallback, useMemo, useRef, useState } from 'react'
import GameShell from '../GameKit/GameShell'
import { useGameKit, useRecentResults } from '../GameKit/useGameKit'
import { useAutoBet } from '../GameKit/useAutoBet'
import { AutoBetFields, BetModeTabs, Field, PrimaryButton, ResultStrip, SecondaryButton } from '../GameKit/controls'
import { floorCents, formatAmount } from '../GameKit/money'
import { POCKETS, WHEEL_ORDER, pocketColor, pocketFromFloat, settleRoulette, totalStake } from './engine'
import './RouletteGame.css'

const SOUNDS = ['chip', 'wheel', 'ball-drop', 'win', 'win-big', 'lose', 'click']
const VERIFIER = {
    floats: 1,
    describe: ([float]) => {
        const pocket = pocketFromFloat(float)
        return `Pocket ${pocket} (${pocketColor(pocket)})`
    },
}
const CHIPS = [0.1, 1, 5, 25, 100]
const SPIN_MS = 2600
const AUTO_SPIN_MS = 1000
const SECTOR = 360 / POCKETS

const NUMBER_CELLS = Array.from({ length: 36 }, (_, index) => {
    const number = index + 1
    const column = Math.ceil(number / 3)
    const row = (number - 1) % 3
    return { key: `n${number}`, label: number, color: pocketColor(number), dc: `${column + 1}`, dr: `${3 - row}`, mc: `${3 + row}`, mr: `${column + 1}` }
})

const SIDE_CELLS = [
    { key: 'n0', label: 0, color: 'green', dc: '1', dr: '1 / span 3', mc: '3 / span 3', mr: '1' },
    { key: 'column3', label: '2:1', dc: '14', dr: '1', mc: '5', mr: '14' },
    { key: 'column2', label: '2:1', dc: '14', dr: '2', mc: '4', mr: '14' },
    { key: 'column1', label: '2:1', dc: '14', dr: '3', mc: '3', mr: '14' },
    { key: 'dozen1', label: '1 to 12', dc: '2 / span 4', dr: '4', mc: '2', mr: '2 / span 4' },
    { key: 'dozen2', label: '13 to 24', dc: '6 / span 4', dr: '4', mc: '2', mr: '6 / span 4' },
    { key: 'dozen3', label: '25 to 36', dc: '10 / span 4', dr: '4', mc: '2', mr: '10 / span 4' },
    { key: 'low', label: '1-18', dc: '2 / span 2', dr: '5', mc: '1', mr: '2 / span 2' },
    { key: 'even', label: 'Even', dc: '4 / span 2', dr: '5', mc: '1', mr: '4 / span 2' },
    { key: 'red', label: 'Red', color: 'red', dc: '6 / span 2', dr: '5', mc: '1', mr: '6 / span 2' },
    { key: 'black', label: 'Black', color: 'black', dc: '8 / span 2', dr: '5', mc: '1', mr: '8 / span 2' },
    { key: 'odd', label: 'Odd', dc: '10 / span 2', dr: '5', mc: '1', mr: '10 / span 2' },
    { key: 'high', label: '19-36', dc: '12 / span 2', dr: '5', mc: '1', mr: '12 / span 2' },
]

const TABLE_CELLS = [...SIDE_CELLS, ...NUMBER_CELLS]

function polar(radius, degrees) {
    const radians = ((degrees - 90) * Math.PI) / 180
    return `${(radius * Math.cos(radians)).toFixed(2)} ${(radius * Math.sin(radians)).toFixed(2)}`
}

const WHEEL_SECTORS = WHEEL_ORDER.map((pocket, index) => {
    const start = index * SECTOR - SECTOR / 2
    const end = start + SECTOR
    return {
        pocket,
        color: pocketColor(pocket),
        path: `M${polar(100, start)} A100 100 0 0 1 ${polar(100, end)} L${polar(68, end)} A68 68 0 0 0 ${polar(68, start)} Z`,
        angle: index * SECTOR,
    }
})

function compactAmount(value) {
    if (value >= 1000) return `${Math.floor(value / 100) / 10}k`
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
}

function RouletteGame() {
    const kit = useGameKit({ id: 'roulette', title: 'Roulette', sounds: SOUNDS, verifier: VERIFIER })
    const [tab, setTab] = useState('manual')
    const [chip, setChip] = useState(1)
    const [bets, setBets] = useState({})
    const [undoStack, setUndoStack] = useState([])
    const [rotation, setRotation] = useState(0)
    const [spinMs, setSpinMs] = useState(SPIN_MS)
    const [result, setResult] = useState(null)
    const [winners, setWinners] = useState([])
    const [results, addResult] = useRecentResults()
    const rotationRef = useRef(0)
    const autoRunningRef = useRef(false)

    const total = useMemo(() => totalStake(bets), [bets])

    const playRound = useCallback(() => {
        if (total <= 0) {
            kit.showToast('error', 'Place a bet', 'Add chips to the table first.')
            return Promise.resolve({ status: 'invalid' })
        }

        return kit.runRound(total, async () => {
            const quick = autoRunningRef.current
            const duration = quick ? AUTO_SPIN_MS : SPIN_MS
            setResult(null)
            setWinners([])
            kit.sound.play(quick ? 'click' : 'wheel')

            const { floats, nonce } = await kit.fairness.getFloats(1)
            const settled = settleRoulette(floats[0], bets)
            kit.hold(settled.payout)

            const index = WHEEL_ORDER.indexOf(settled.pocket)
            const current = rotationRef.current
            const aligned = (((-index * SECTOR - current) % 360) + 360) % 360
            const nextRotation = current + (quick ? 720 : 1800) + aligned
            rotationRef.current = nextRotation
            setSpinMs(duration)
            setRotation(nextRotation)
            await kit.wait(duration + 40)

            const multiplier = floorCents((settled.payout / total) * 100) / 100
            setResult(settled.pocket)
            setWinners(settled.winners)
            kit.sound.play('ball-drop', { volume: 0.7 })
            kit.sound.play(settled.payout > total ? (multiplier >= 10 ? 'win-big' : 'win') : settled.payout === total ? 'click' : 'lose')
            addResult(String(settled.pocket), pocketColor(settled.pocket) === 'green' ? 'win' : pocketColor(settled.pocket) === 'red' ? 'red' : 'loss')
            return { payout: settled.payout, multiplier, nonce, detail: `Pocket ${settled.pocket} (${pocketColor(settled.pocket)})` }
        })
    }, [addResult, bets, kit, total])

    const auto = useAutoBet({ playRound, bet: total, setBet: () => {}, wait: kit.wait, delay: 300 })
    autoRunningRef.current = auto.running
    const locked = kit.busy || auto.running

    // Refs mirror the table so several clicks inside one frame never read stale bets.
    const betsRef = useRef(bets)
    const undoRef = useRef(undoStack)

    const commitTable = (nextBets, nextUndo) => {
        betsRef.current = nextBets
        undoRef.current = nextUndo
        setBets(nextBets)
        setUndoStack(nextUndo)
        setWinners([])
    }

    const pushUndo = () => [...undoRef.current.slice(-40), betsRef.current]

    const addChip = (key) => {
        if (locked) return
        const current = betsRef.current
        const nextTotal = floorCents(totalStake(current) + chip)
        if (nextTotal > kit.balance) {
            kit.showToast('error', 'Insufficient balance', `Your table would total ₿${formatAmount(nextTotal)}`)
            return
        }
        kit.sound.play('chip')
        commitTable({ ...current, [key]: floorCents((current[key] ?? 0) + chip) }, pushUndo())
    }

    const undo = () => {
        const stack = undoRef.current
        if (stack.length === 0) return
        commitTable(stack[stack.length - 1], stack.slice(0, -1))
        kit.sound.play('chip', { rate: 0.85 })
    }

    const clear = () => {
        commitTable({}, pushUndo())
    }

    const doubleBets = () => {
        const current = betsRef.current
        const doubledTotal = floorCents(totalStake(current) * 2)
        if (doubledTotal > kit.balance) {
            kit.showToast('error', 'Insufficient balance', `Doubling needs ₿${formatAmount(doubledTotal)}`)
            return
        }
        kit.sound.play('chip')
        commitTable(Object.fromEntries(Object.entries(current).map(([key, amount]) => [key, floorCents(amount * 2)])), pushUndo())
    }

    const controls = (
        <>
            <BetModeTabs mode={tab} onChange={setTab} disabled={locked} />
            <Field label="Chip Value" aside={`Total ₿${formatAmount(total)}`}>
                <div className="rl-chips" role="radiogroup" aria-label="Chip value">
                    {CHIPS.map((value) => (
                        <button key={value} type="button" role="radio" aria-checked={chip === value} className={`rl-chip ${chip === value ? 'is-active' : ''}`} disabled={locked} onClick={() => { kit.sound.play('click'); setChip(value) }}>
                            {compactAmount(value)}
                        </button>
                    ))}
                </div>
            </Field>
            <div className="gk-button-row mobile-sheet-secondary">
                <SecondaryButton onClick={undo} disabled={locked || undoStack.length === 0}>Undo</SecondaryButton>
                <SecondaryButton onClick={doubleBets} disabled={locked || total === 0}>2×</SecondaryButton>
                <SecondaryButton onClick={clear} disabled={locked || total === 0}>Clear</SecondaryButton>
            </div>
            {tab === 'auto' && <AutoBetFields auto={auto} strategy={false} />}
            {tab === 'manual' ? (
                <PrimaryButton onClick={playRound} disabled={kit.busy || total === 0}>Spin</PrimaryButton>
            ) : auto.running ? (
                <PrimaryButton tone="danger" onClick={auto.stop}>Stop Auto</PrimaryButton>
            ) : (
                <PrimaryButton onClick={auto.start} disabled={kit.busy || total === 0}>Start Auto</PrimaryButton>
            )}
        </>
    )

    return (
        <GameShell kit={kit} className="roulette-game" controls={controls} collapseOn={locked} locked={locked}>
            <div className="rl-board">
                <ResultStrip results={results} label="Recent pockets" />
                <div className="rl-wheel-wrap">
                    <div className="rl-pointer" aria-hidden="true" />
                    <svg className="rl-wheel" viewBox="-104 -104 208 208" role="img" aria-label="Roulette wheel" style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${spinMs}ms` }}>
                        <circle r="103" className="rl-wheel-rim" />
                        {WHEEL_SECTORS.map((sector) => (
                            <g key={sector.pocket}>
                                <path d={sector.path} className={`rl-sector is-${sector.color}`} />
                                <text className="rl-sector-label" transform={`rotate(${sector.angle}) translate(0 -84)`} textAnchor="middle" dominantBaseline="middle">{sector.pocket}</text>
                            </g>
                        ))}
                        <circle r="68" className="rl-wheel-hub" />
                    </svg>
                    <div className={`rl-result ${result === null ? '' : `is-${pocketColor(result)}`}`} aria-live="polite">
                        {result === null ? (kit.busy ? '…' : '') : result}
                    </div>
                </div>
                <div className="rl-table">
                    {TABLE_CELLS.map((cell) => (
                        <button
                            key={cell.key}
                            type="button"
                            className={`rl-cell ${cell.color ? `is-${cell.color}` : ''} ${winners.includes(cell.key) ? 'is-winner' : ''}`}
                            style={{ '--dc': cell.dc, '--dr': cell.dr, '--mc': cell.mc, '--mr': cell.mr }}
                            aria-label={`Bet on ${cell.label}${bets[cell.key] ? `, ₿${formatAmount(bets[cell.key])} placed` : ''}`}
                            disabled={locked}
                            onClick={() => addChip(cell.key)}
                        >
                            {cell.label}
                            {bets[cell.key] > 0 && <span className="rl-placed">{compactAmount(bets[cell.key])}</span>}
                        </button>
                    ))}
                </div>
            </div>
        </GameShell>
    )
}

export default RouletteGame
