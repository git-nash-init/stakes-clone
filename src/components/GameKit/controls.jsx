import { useEffect, useState } from 'react'
import { MIN_BET, clamp, formatAmount, normalizeBet } from './money'
import { RANKS, SUITS, rankOf, suitOf } from './cards'

export function Field({ label, aside, secondary = false, children }) {
    return (
        <div className={`gk-field ${secondary ? 'mobile-sheet-secondary' : ''}`}>
            <div className="gk-field-header">
                <span className="gk-label">{label}</span>
                {aside !== undefined && <span className="gk-aside">{aside}</span>}
            </div>
            {children}
        </div>
    )
}

export function CoinIcon() {
    return <span className="gk-coin" aria-hidden="true">₿</span>
}

/** Text-based number input. Keeps partial typing like "1." intact. */
export function NumberInput({ value, onChange, onCommit, format = String, min, max, disabled, ariaLabel, prefix, suffix }) {
    const [text, setText] = useState(format(value))
    const [editing, setEditing] = useState(false)

    useEffect(() => {
        if (!editing) setText(format(value))
    }, [editing, format, value])

    const commit = () => {
        setEditing(false)
        const parsed = Number(text)
        if (text.trim() === '' || !Number.isFinite(parsed)) {
            setText(format(value))
            return
        }
        const bounded = clamp(parsed, min ?? -Infinity, max ?? Infinity)
        onCommit?.(bounded)
        onChange?.(bounded)
        setText(format(bounded))
    }

    return (
        <label className={`gk-input ${disabled ? 'is-disabled' : ''}`}>
            {prefix}
            <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={ariaLabel}
                value={text}
                disabled={disabled}
                onFocus={() => setEditing(true)}
                onChange={(event) => {
                    const next = event.target.value.replace(',', '.')
                    if (!/^\d*\.?\d*$/.test(next)) return
                    setText(next)
                    const parsed = Number(next)
                    if (onChange && next !== '' && Number.isFinite(parsed)) {
                        onChange(clamp(parsed, min ?? -Infinity, max ?? Infinity))
                    }
                }}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                }}
            />
            {suffix}
        </label>
    )
}

export function BetAmountInput({ value, onChange, balance, disabled, label = 'Bet Amount' }) {
    const half = () => onChange(Math.max(MIN_BET, normalizeBet(value / 2)))
    const double = () => onChange(Math.max(MIN_BET, Math.min(normalizeBet(balance), normalizeBet(value * 2))))

    return (
        <Field label={label} aside={`₿${formatAmount(value)}`}>
            <div className="gk-bet-row">
                <NumberInput
                    value={value}
                    onChange={(amount) => onChange(normalizeBet(amount))}
                    format={formatAmount}
                    min={0}
                    disabled={disabled}
                    ariaLabel={label}
                    prefix={<CoinIcon />}
                />
                <div className="gk-half-double">
                    <button type="button" onClick={half} disabled={disabled || value <= MIN_BET} aria-label="Halve bet">½</button>
                    <button type="button" onClick={double} disabled={disabled || value >= balance} aria-label="Double bet">2×</button>
                </div>
            </div>
        </Field>
    )
}

export function BetModeTabs({ mode, onChange, disabled }) {
    return (
        <div className="gk-tabs mobile-sheet-secondary" role="tablist" aria-label="Bet mode">
            {[['manual', 'Manual'], ['auto', 'Auto']].map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={mode === id}
                    className={mode === id ? 'active' : ''}
                    disabled={disabled}
                    onClick={() => onChange(id)}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}

export function PrimaryButton({ children, tone = 'primary', className = '', ...props }) {
    return <button type="button" className={`gk-primary gk-primary-${tone} ${className}`} {...props}>{children}</button>
}

export function SecondaryButton({ children, className = '', ...props }) {
    return <button type="button" className={`gk-secondary ${className}`} {...props}>{children}</button>
}

export function SelectInput({ value, onChange, options, disabled, ariaLabel }) {
    return (
        <select className="gk-select" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={ariaLabel}>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
    )
}

export function Readout({ label, value, tone, secondary = true }) {
    return (
        <Field label={label} secondary={secondary}>
            <div className={`gk-readout ${tone ? `is-${tone}` : ''}`}><CoinIcon />{value}</div>
        </Field>
    )
}

const wholeNumber = (value) => String(Math.round(value))
const percent = (value) => String(value)

function StrategyField({ label, mode, pct, disabled, onMode, onPct }) {
    return (
        <Field label={label} secondary>
            <div className="gk-strategy">
                <SelectInput
                    value={mode}
                    disabled={disabled}
                    ariaLabel={`${label} action`}
                    onChange={onMode}
                    options={[{ value: 'reset', label: 'Reset' }, { value: 'increase', label: 'Increase by' }]}
                />
                <NumberInput
                    value={pct}
                    onCommit={onPct}
                    format={percent}
                    min={0}
                    max={1000}
                    disabled={disabled || mode !== 'increase'}
                    ariaLabel={`${label} percent`}
                    suffix={<span className="gk-suffix">%</span>}
                />
            </div>
        </Field>
    )
}

export function AutoBetFields({ auto, strategy = true }) {
    const { config, setConfig, running, played } = auto
    const update = (patch) => setConfig((current) => ({ ...current, ...patch }))

    return (
        <>
            <Field label="Number of Bets" aside={running ? `${played} played` : '0 = until stopped'} secondary>
                <NumberInput value={config.count} onCommit={(count) => update({ count: Math.round(count) })} format={wholeNumber} min={0} max={10000} disabled={running} ariaLabel="Number of bets" />
            </Field>
            {strategy && (
                <>
                    <StrategyField label="On Win" mode={config.onWin} pct={config.onWinPct} disabled={running} onMode={(onWin) => update({ onWin })} onPct={(onWinPct) => update({ onWinPct })} />
                    <StrategyField label="On Loss" mode={config.onLoss} pct={config.onLossPct} disabled={running} onMode={(onLoss) => update({ onLoss })} onPct={(onLossPct) => update({ onLossPct })} />
                </>
            )}
            <Field label="Stop on Profit" secondary>
                <NumberInput value={config.stopProfit} onCommit={(stopProfit) => update({ stopProfit })} format={formatAmount} min={0} disabled={running} ariaLabel="Stop on profit" prefix={<CoinIcon />} />
            </Field>
            <Field label="Stop on Loss" secondary>
                <NumberInput value={config.stopLoss} onCommit={(stopLoss) => update({ stopLoss })} format={formatAmount} min={0} disabled={running} ariaLabel="Stop on loss" prefix={<CoinIcon />} />
            </Field>
        </>
    )
}

export function ResultStrip({ results, label = 'Recent results' }) {
    return (
        <div className="gk-result-strip" aria-label={label}>
            {results.map((result) => (
                <span key={result.key} className={`gk-result-chip is-${result.tone}`}>{result.label}</span>
            ))}
        </div>
    )
}

export function PlayingCard({ card, faceDown = false, tone, small = false }) {
    if (faceDown || card === undefined || card === null) {
        return <div className={`gk-card is-back ${small ? 'is-small' : ''}`} aria-label="Face-down card" />
    }
    const suit = SUITS[suitOf(card)]
    const rank = RANKS[rankOf(card)]
    return (
        <div className={`gk-card ${suit.red ? 'is-red' : ''} ${tone ? `is-${tone}` : ''} ${small ? 'is-small' : ''}`} aria-label={`${rank} of ${suit.symbol}`}>
            <span className="gk-card-rank">{rank}</span>
            <span className="gk-card-suit">{suit.symbol}</span>
        </div>
    )
}
