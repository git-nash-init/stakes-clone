import assert from 'node:assert/strict'

const origin = process.env.MOBILE_APP_ORIGIN || 'http://127.0.0.1:5210'
const cdpPort = process.env.MOBILE_CDP_PORT || '9340'
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
const target = targets.find(item => item.type === 'page')
assert.ok(target, 'Chrome page target not found')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
})

let id = 0
const pending = new Map()
const runtimeErrors = []
ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
        const request = pending.get(message.id)
        if (!request) return
        pending.delete(message.id)
        message.error
            ? request.reject(new Error(message.error.message))
            : request.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push(message.params.exceptionDetails.text)
    }
})

function send(method, params = {}) {
    const requestId = ++id
    ws.send(JSON.stringify({ id: requestId, method, params }))
    return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }))
}

async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    })
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text)
    return result.value
}

async function waitFor(expression, timeout = 30000) {
    return evaluate(`new Promise((resolve, reject) => {
        const deadline = performance.now() + ${timeout}
        const check = () => {
            try { if (${expression}) return resolve(true) } catch {}
            if (performance.now() > deadline) return reject(new Error('Timed out'))
            setTimeout(check, 50)
        }
        check()
    })`)
}

await Promise.all([send('Runtime.enable'), send('Page.enable')])

const routes = ['/', '/mines', '/crash', '/dino', '/plinko', '/dice', '/limbo', '/keno', '/hilo', '/blackjack', '/roulette']
const viewports = [
    { width: 320, height: 568, label: 'phone-small', mobile: true, expectMobileShell: true },
    { width: 375, height: 667, label: 'phone-medium', mobile: true, expectMobileShell: true },
    { width: 390, height: 844, label: 'phone', mobile: true, expectMobileShell: true },
    { width: 430, height: 932, label: 'phone-large', mobile: true, expectMobileShell: true },
    { width: 820, height: 1180, label: 'tablet-portrait', mobile: true, expectMobileShell: false },
    { width: 844, height: 390, label: 'touch-landscape', mobile: true, expectMobileShell: true },
    { width: 1280, height: 800, label: 'desktop', mobile: false, expectMobileShell: false },
]
const report = []

for (const viewport of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
        screenOrientation: {
            type: viewport.width > viewport.height ? 'landscapePrimary' : 'portraitPrimary',
            angle: viewport.width > viewport.height ? 90 : 0,
        },
    })
    await send('Emulation.setTouchEmulationEnabled', {
        enabled: viewport.mobile,
        maxTouchPoints: viewport.mobile ? 5 : 1,
    })

    for (const route of routes) {
        await send('Page.navigate', { url: `${origin}${route}` })
        await waitFor(`
            location.pathname === ${JSON.stringify(route)} &&
            document.readyState === 'complete' &&
            document.querySelector('.main-content') &&
            ${route === '/' ? "!document.querySelector('.mobile-bet-sheet')" : "document.querySelector('.mobile-bet-sheet')"}
        `)
        await evaluate(`new Promise(resolve => setTimeout(resolve, 400))`)

        const result = await evaluate(`(() => {
            const nav = document.querySelector('.mobile-bottom-nav')
            const header = document.querySelector('.header')
            const sheet = document.querySelector('.mobile-bet-sheet')
            const canvas = document.querySelector('.plinko-canvas')
            const canvasContainer = document.querySelector('.plinko-canvas-container')
            const canvasRect = canvas?.getBoundingClientRect()
            const containerRect = canvasContainer?.getBoundingClientRect()
            return {
                route: location.pathname,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                navLinks: nav ? nav.querySelectorAll('a, button').length : 0,
                navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
                headerTop: header?.getBoundingClientRect().top,
                sheet: Boolean(sheet),
                canvasCount: document.querySelectorAll('.plinko-canvas').length,
                canvasRatio: containerRect ? containerRect.width / containerRect.height : null,
                canvasFits: canvasRect && containerRect
                    ? canvasRect.left >= containerRect.left - 1 &&
                        canvasRect.right <= containerRect.right + 1 &&
                        canvasRect.top >= containerRect.top - 1 &&
                        canvasRect.bottom <= containerRect.bottom + 1
                    : null,
            }
        })()`)

        assert.ok(result.overflow <= 1, `${viewport.label} ${route} overflows by ${result.overflow}px`)
        assert.equal(result.navLinks, 5, `${route} nav count`)
        assert.equal(result.navVisible, viewport.expectMobileShell, `${route} nav visibility`)
        assert.equal(result.headerTop >= 0, true, `${route} header clipped`)

        if (viewport.expectMobileShell && route !== '/') {
            assert.equal(result.sheet, true, `${route} missing betting sheet`)
            await evaluate(`document.querySelector('.mobile-bet-sheet__handle').click()`)
            await waitFor(`document.querySelector('.mobile-bet-sheet')?.dataset.state === 'expanded'`)
            const expanded = await evaluate(`(() => {
                const sheet = document.querySelector('.mobile-bet-sheet')
                return sheet.contains(document.activeElement) && sheet.getAttribute('aria-modal') === 'true'
            })()`)
            assert.equal(expanded, true, `${route} sheet focus/modal state`)
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
            await waitFor(`document.querySelector('.mobile-bet-sheet')?.dataset.state === 'collapsed'`)
        }

        if (viewport.expectMobileShell && route === '/') {
            await evaluate(`document.querySelector('.mobile-menu-button').click()`)
            await waitFor(`document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded') === 'true'`)
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
            await waitFor(`document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded') === 'false'`)
        }

        if (viewport.expectMobileShell && route === '/mines') {
            await evaluate(`document.querySelector('.mobile-wallet-balance').click()`)
            await waitFor(`document.querySelector('.wallet-dropdown')`)
            const walletFits = await evaluate(`(() => {
                const rect = document.querySelector('.wallet-dropdown').getBoundingClientRect()
                return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
            })()`)
            assert.equal(walletFits, true, 'wallet dropdown exceeds viewport')
            await evaluate(`document.querySelector('.wallet-close-btn').click()`)
        }

        if (route === '/plinko') {
            assert.equal(result.canvasCount, 1, 'Plinko canvas count changed')
            assert.ok(Math.abs(result.canvasRatio - 760 / 570) < 0.02, 'Plinko ratio changed')
            assert.equal(result.canvasFits, true, 'Plinko canvas exceeds its container')
        }
        report.push({ viewport: viewport.label, ...result })
    }
}

assert.equal(report.length, routes.length * viewports.length)
assert.deepEqual(runtimeErrors, [])
console.log(JSON.stringify({ report, runtimeErrors }, null, 2))
ws.close()
