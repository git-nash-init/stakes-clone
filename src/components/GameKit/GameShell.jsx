import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from 'antd'
import {
    BarChartOutlined,
    CheckCircleOutlined,
    CloseOutlined,
    ExpandOutlined,
    FullscreenExitOutlined,
    HistoryOutlined,
    MutedOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SoundOutlined,
} from '@ant-design/icons'
import MobileBetSheet from '../MobileBetSheet'
import ProvablyFair, { sha256 } from '../../utils/ProvablyFair'
import { formatAmount, formatMultiplier } from './money'
import './GameKit.css'

function useFullscreen() {
    const [active, setActive] = useState(false)
    const supported = typeof document !== 'undefined' && document.fullscreenEnabled

    useEffect(() => {
        const update = () => setActive(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', update)
        return () => document.removeEventListener('fullscreenchange', update)
    }, [])

    const toggle = () => {
        const action = document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen()
        action.catch(() => {})
    }

    return { active, supported, toggle }
}

function StatsWidget({ stats, onClose }) {
    const panelRef = useRef(null)
    const drag = useRef(null)

    const path = useMemo(() => {
        const values = stats.series.length > 1 ? stats.series : [0, 0]
        const min = Math.min(0, ...values)
        const max = Math.max(0, ...values)
        const range = max - min || 1
        const toY = (value) => 88 - ((value - min) / range) * 76
        const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${((index / (values.length - 1)) * 300).toFixed(1)} ${toY(value).toFixed(1)}`).join(' ')
        return { line, zero: toY(0) }
    }, [stats.series])

    const onPointerDown = (event) => {
        const panel = panelRef.current
        const rect = panel.getBoundingClientRect()
        drag.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event) => {
        if (!drag.current) return
        const panel = panelRef.current
        const left = Math.min(window.innerWidth - panel.offsetWidth, Math.max(0, event.clientX - drag.current.x))
        const top = Math.min(window.innerHeight - panel.offsetHeight, Math.max(0, event.clientY - drag.current.y))
        panel.style.left = `${left}px`
        panel.style.top = `${top}px`
        panel.style.right = 'auto'
    }

    return (
        <section ref={panelRef} className="gk-stats" aria-label="Live stats">
            <div className="gk-stats-header" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null }}>
                <span><BarChartOutlined /> Live Stats</span>
                <button type="button" aria-label="Close live stats" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><CloseOutlined /></button>
            </div>
            <div className="gk-stats-grid">
                <div><small>Profit</small><strong className={stats.profit >= 0 ? 'is-win' : 'is-loss'}>₿{formatAmount(stats.profit)}</strong></div>
                <div><small>Wagered</small><strong>₿{formatAmount(stats.wagered)}</strong></div>
                <div><small>Wins</small><strong className="is-win">{stats.wins}</strong></div>
                <div><small>Losses</small><strong className="is-loss">{stats.losses}</strong></div>
            </div>
            <svg className="gk-stats-chart" viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="Profit over recent bets">
                <line x1="0" x2="300" y1={path.zero} y2={path.zero} className="gk-stats-zero" />
                <path d={path.line} className="gk-stats-line" vectorEffect="non-scaling-stroke" />
            </svg>
            <button type="button" className="gk-text-button" onClick={stats.reset}><ReloadOutlined /> Reset stats</button>
        </section>
    )
}

function HistoryModal({ open, onClose, stats, title }) {
    return (
        <Modal
            title={`${title} history`}
            open={open}
            onCancel={onClose}
            footer={null}
            width={640}
            centered
            rootClassName="gk-modal-portal mobile-game-modal"
        >
            {stats.history.length === 0 ? (
                <p className="gk-empty">No bets yet. Your last 50 bets will show here.</p>
            ) : (
                <div className="gk-history-scroll">
                    <table className="gk-history">
                        <thead>
                            <tr><th>Time</th><th>Bet</th><th>Multi</th><th>Profit</th><th>Nonce</th><th>Result</th></tr>
                        </thead>
                        <tbody>
                            {stats.history.map((entry) => (
                                <tr key={entry.id}>
                                    <td>{new Date(entry.time).toLocaleTimeString()}</td>
                                    <td>₿{formatAmount(entry.bet)}</td>
                                    <td>{formatMultiplier(entry.multiplier)}</td>
                                    <td className={entry.profit > 0 ? 'is-win' : entry.profit < 0 ? 'is-loss' : ''}>₿{formatAmount(entry.profit)}</td>
                                    <td>{entry.nonce}</td>
                                    <td>{entry.detail}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    )
}

function FairnessModal({ open, onClose, kit, locked }) {
    const { fairness, verifier, title, showToast } = kit
    const [seedInput, setSeedInput] = useState('')
    const [form, setForm] = useState({ serverSeed: '', clientSeed: '', nonce: '0' })
    const [verification, setVerification] = useState(null)

    useEffect(() => {
        if (open) setSeedInput(fairness.data.clientSeed)
    }, [fairness.data.clientSeed, open])

    useEffect(() => {
        if (!fairness.revealed) return
        setForm({
            serverSeed: fairness.revealed.serverSeed,
            clientSeed: fairness.revealed.clientSeed,
            nonce: String(Math.max(0, fairness.revealed.nonce - 1)),
        })
        setVerification(null)
    }, [fairness.revealed])

    const update = (key) => (event) => {
        setForm((current) => ({ ...current, [key]: event.target.value }))
        setVerification(null)
    }

    const verify = async () => {
        const nonce = Number(form.nonce)
        if (!form.serverSeed.trim() || !form.clientSeed.trim() || !Number.isInteger(nonce) || nonce < 0) {
            setVerification({ error: 'Enter a server seed, client seed and whole-number nonce.' })
            return
        }
        const serverSeed = form.serverSeed.trim()
        const floats = await ProvablyFair.deriveFloats(serverSeed, form.clientSeed.trim(), nonce, verifier.floats)
        setVerification({ result: verifier.describe(floats), hash: await sha256(serverSeed) })
    }

    const saveClientSeed = async () => {
        if (await fairness.changeClientSeed(seedInput)) showToast('win', 'Seed updated', 'A new seed pair is active.')
    }

    return (
        <Modal
            title={<span><SafetyCertificateOutlined /> Provably Fair</span>}
            open={open}
            onCancel={onClose}
            footer={null}
            width={520}
            centered
            rootClassName="gk-modal-portal mobile-game-modal"
        >
            <p className="gk-modal-copy">Each {title} result comes from HMAC-SHA256 of the server seed, your client seed and the nonce. Rotate the seed to reveal it, then check any past bet below.</p>
            <dl className="gk-fairness">
                <dt>Server Seed Hash</dt>
                <dd className="gk-mono">{fairness.data.serverSeedHash}</dd>
                <dt>Nonce</dt>
                <dd className="gk-mono">{fairness.data.nonce}</dd>
            </dl>
            <label className="gk-modal-field">
                <span>Client Seed</span>
                <div className="gk-modal-row">
                    <input value={seedInput} disabled={locked} onChange={(event) => setSeedInput(event.target.value)} />
                    <button type="button" className="gk-secondary" disabled={locked} onClick={saveClientSeed}>Save</button>
                </div>
            </label>
            <button type="button" className="gk-secondary gk-full" disabled={locked} onClick={fairness.rotate}><ReloadOutlined /> Rotate Seed</button>
            {locked && <p className="gk-modal-note">Finish the current round to change seeds.</p>}

            {fairness.revealed && (
                <dl className="gk-fairness gk-revealed">
                    <dt>Revealed Server Seed</dt>
                    <dd className="gk-mono">{fairness.revealed.serverSeed}</dd>
                </dl>
            )}

            <h3 className="gk-modal-heading">Verify a bet</h3>
            <label className="gk-modal-field"><span>Server Seed</span><input value={form.serverSeed} onChange={update('serverSeed')} /></label>
            <label className="gk-modal-field"><span>Client Seed</span><input value={form.clientSeed} onChange={update('clientSeed')} /></label>
            <label className="gk-modal-field"><span>Nonce</span><input inputMode="numeric" value={form.nonce} onChange={update('nonce')} /></label>
            <button type="button" className="gk-primary gk-primary-primary gk-full" onClick={verify}><CheckCircleOutlined /> Verify</button>
            {verification?.error && <p className="gk-modal-note is-loss">{verification.error}</p>}
            {verification?.result && (
                <dl className="gk-fairness gk-revealed">
                    <dt>Result</dt>
                    <dd>{verification.result}</dd>
                    <dt>SHA-256 of Server Seed</dt>
                    <dd className="gk-mono">{verification.hash}</dd>
                </dl>
            )}
        </Modal>
    )
}

export default function GameShell({ kit, className = '', collapseOn = false, locked = false, controls, children }) {
    const [statsOpen, setStatsOpen] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [fairnessOpen, setFairnessOpen] = useState(false)
    const fullscreen = useFullscreen()
    const { sound, stats, title } = kit

    return (
        <div className={`gk-game ${className}`}>
            <div className="gk-container">
                <MobileBetSheet title={`${title} bet controls`} className="gk-bet-sheet" collapseOn={collapseOn}>
                    <div className="gk-sidebar">
                        <div className="gk-sidebar-content">
                            <div className="gk-panel">{controls}</div>
                        </div>
                        <div className="gk-sidebar-footer mobile-sheet-secondary">
                            <button type="button" className={statsOpen ? 'active' : ''} title="Live Stats" aria-label="Live stats" onClick={() => setStatsOpen((open) => !open)}><BarChartOutlined /></button>
                            <button type="button" title="History" aria-label="History" onClick={() => setHistoryOpen(true)}><HistoryOutlined /></button>
                            <button type="button" title="Provably Fair" aria-label="Provably fair" onClick={() => setFairnessOpen(true)}><SafetyCertificateOutlined /></button>
                        </div>
                    </div>
                </MobileBetSheet>

                <div className="gk-display-wrapper">
                    <div className="gk-display">{children}</div>
                    <div className="gk-controls">
                        <div className="gk-controls-group">
                            {fullscreen.supported && (
                                <button type="button" title={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'} aria-label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'} onClick={fullscreen.toggle}>
                                    {fullscreen.active ? <FullscreenExitOutlined /> : <ExpandOutlined />}
                                </button>
                            )}
                            <button type="button" className={sound.muted ? 'muted' : ''} title={sound.muted ? 'Unmute' : 'Mute'} aria-label={sound.muted ? 'Unmute' : 'Mute'} aria-pressed={sound.muted} onClick={sound.toggleMuted}>
                                {sound.muted ? <MutedOutlined /> : <SoundOutlined />}
                            </button>
                        </div>
                        <span className="logo gk-controls-logo">{title}</span>
                        <button type="button" className="gk-fairness-pill" onClick={() => setFairnessOpen(true)}><SafetyCertificateOutlined /> Fairness</button>
                    </div>
                </div>
            </div>

            {statsOpen && <StatsWidget stats={stats} onClose={() => setStatsOpen(false)} />}
            <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} stats={stats} title={title} />
            <FairnessModal open={fairnessOpen} onClose={() => setFairnessOpen(false)} kit={kit} locked={locked} />
        </div>
    )
}
