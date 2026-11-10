import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function source(relativePath) {
    return readFile(new URL(relativePath, import.meta.url), 'utf8').catch(() => '')
}

async function sources(relativePaths) {
    return Promise.all(relativePaths.map(source))
}

test('mobile shell exposes drawer, compact header, and five-route bottom navigation', async () => {
    const [app, layout, header, navigation, navigationCss, globalCss] = await sources([
        './src/App.jsx',
        './src/components/Layout.jsx',
        './src/components/Header.jsx',
        './src/components/MobileNavigation.jsx',
        './src/components/MobileNavigation.css',
        './src/styles/index.css',
    ])

    assert.match(app, /role="status"/)
    assert.doesNotMatch(app, /fallback=\{null\}/)
    assert.match(layout, /<MobileNavigation/)
    assert.match(header, /aria-label="Open navigation menu"/)
    assert.match(header, /ref=\{menuButtonRef\}/)
    assert.match(navigation, /afterOpenChange=/)
    assert.match(header, /className="mobile-wallet-balance"/)
    assert.match(header, /aria-expanded=\{showWalletDropdown\}/)
    assert.match(header, /setShowWalletDropdown\(!showWalletDropdown\)/)
    assert.match(header, /!isGamePage &&/)
    assert.equal((header.match(/className="wallet-dropdown"/g) || []).length, 1)
    assert.match(navigation, /aria-label="Primary navigation"/)
    assert.match(navigation, /const primaryRoutes = \[/)
    assert.match(navigation, /path: '\/'/)
    assert.match(navigation, /GAMES\.filter\(game => game\.mobilePrimary\)/)
    assert.match(navigation, /All games/)
    assert.match(navigation, /aria-label="All games"/)
    assert.match(navigation, /Coming soon/)
    assert.match(navigationCss, /safe-area-inset-bottom/)
    assert.match(globalCss, /height:\s*100dvh/)
    assert.match(globalCss, /padding-bottom:\s*var\(--mobile-nav-space\)/)
})

test('Home uses compact mobile hero, category rail, and adaptive card grid', async () => {
    const css = await source('./src/styles/home.css')
    assert.match(css, /\.game-category-list\s*\{[^}]*overflow-x:\s*auto/s)
    assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*grid-template-columns:\s*repeat\(2,/)
    assert.match(css, /@media\s*\(max-width:\s*359px\)[\s\S]*grid-template-columns:\s*1fr/)
    assert.match(css, /touch-action:\s*pan-x/)
})

test('Mines keeps the square board ahead of a collapsible betting sheet', async () => {
    const [component, css] = await sources([
        './src/components/MinesGame/MinesGame.jsx',
        './src/components/MinesGame/MinesGame.css',
    ])
    assert.match(component, /<MobileBetSheet[^>]*title="Mines bet controls"/)
    assert.match(component, /mines-bet-sheet/)
    assert.match(component, /mobile-sheet-secondary/)
    assert.match(component, /rootClassName="mines-fairness-modal-portal mobile-game-modal"/)
    assert.match(component, /rootClassName="mines-history-modal-portal mobile-game-modal"/)
    assert.match(css, /\.mines-display\s*\{[^}]*aspect-ratio:\s*1/s)
    assert.match(css, /\.mines-bet-sheet\[data-state='collapsed'\]/)
    assert.match(css, /@media\s*\(max-width:\s*768px\)/)
})

test('Crash prioritizes chart, cashout, and mobile player tabs', async () => {
    const [game, panel, history, css] = await sources([
        './src/components/CrashGame/CrashGame.jsx',
        './src/components/CrashGame/BettingPanel.jsx',
        './src/components/CrashGame/GameHistory.jsx',
        './src/components/CrashGame/CrashGame.css',
    ])
    assert.match(game, /<MobileBetSheet[^>]*title="Crash bet controls"/)
    assert.match(game, /mobileDataTab/)
    assert.match(game, /crash-mobile-tabs/)
    assert.match(game, /showPlayerBets && mobileDataTab === 'bets'/)
    assert.match(panel, /mobile-sheet-secondary/)
    assert.match(history, /crash-history-drawer-portal mobile-game-modal/)
    assert.match(css, /\.game-history-bar[\s\S]*overflow-x:\s*auto/)
    assert.match(css, /\.crash-mobile-tabs/)
})

test('Dino keeps Phaser and live actions ahead of secondary controls', async () => {
    const [component, css] = await sources([
        './src/components/DinoGame/DinoGame.jsx',
        './src/components/DinoGame/DinoGame.css',
    ])
    assert.match(component, /<MobileBetSheet[^>]*title="Dino bet controls"/)
    assert.match(component, /collapseOn=\{gamePhase === 'running' \|\| gamePhase === 'waiting'\}/)
    assert.match(component, /dino-bet-sheet/)
    assert.match(component, /mobile-sheet-secondary/)
    assert.match(css, /\.phaser-container\s*\{[^}]*aspect-ratio:/s)
    assert.match(css, /orientation:\s*landscape/)
})

test('Plinko mobile presentation preserves board ratio and critical controls', async () => {
    const [game, sidebar, board, gameCss, sidebarCss, boardCss] = await sources([
        './src/components/PlinkoGame/PlinkoGame.jsx',
        './src/components/PlinkoGame/Sidebar.jsx',
        './src/components/PlinkoGame/Plinko.jsx',
        './src/components/PlinkoGame/PlinkoGame.css',
        './src/components/PlinkoGame/Sidebar.css',
        './src/components/PlinkoGame/Plinko.css',
    ])
    assert.match(game, /<MobileBetSheet[^>]*title="Plinko bet controls"/)
    assert.match(game, /plinko-bet-sheet/)
    assert.match(sidebar, /mobile-sheet-secondary/)
    assert.match(gameCss, /\.recent-plays-list\s*\{[^}]*overflow-x:\s*auto/s)
    assert.match(sidebarCss, /\.ball-types-grid\s*\{[^}]*overflow-x:\s*auto/s)
    assert.match(boardCss, /aspect-ratio:\s*760\s*\/\s*570/)
    assert.match(boardCss, /\.plinko-canvas\s*\{[^}]*width:\s*100%\s*!important[^}]*height:\s*100%\s*!important/s)
    assert.equal((board.match(/className="plinko-canvas"/g) || []).length, 1)
})

test('mobile bet sheet owns collapse, escape, focus, and scroll-lock behavior', async () => {
    const [component, css] = await sources([
        './src/components/MobileBetSheet.jsx',
        './src/components/MobileBetSheet.css',
    ])

    assert.match(component, /data-state=/)
    assert.match(component, /aria-expanded=/)
    assert.match(component, /event\.key === 'Escape'/)
    assert.match(component, /event\.key === 'Tab'/)
    assert.match(component, /backgroundNode\.inert = true/)
    assert.match(component, /aria-modal=/)
    assert.match(component, /mobile-overlay-open/)
    assert.match(css, /position:\s*fixed/)
    assert.match(css, /bottom:\s*var\(--mobile-nav-space\)/)
    assert.match(css, /prefers-reduced-motion/)
})
