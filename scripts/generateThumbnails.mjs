// Renders the original game thumbnails from SVG to public/images/<id>.avif.
// Needs Chrome and ffmpeg. Run with: node scripts/generateThumbnails.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WIDTH = 1086
const HEIGHT = 1448
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images')
const CHROME_PATHS = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
].filter(Boolean)

function createRandom(seed) {
    let state = seed
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296
    }
}

function cloud(x, y, scale, opacity = 0.75) {
    return `<g transform="translate(${x} ${y}) scale(${scale})" fill="#2f6ff0" opacity="${opacity}">
        <circle r="70"/><circle cx="85" cy="-22" r="92"/><circle cx="190" cy="4" r="74"/><circle cx="270" cy="30" r="48"/><rect x="-70" y="10" width="380" height="80"/>
    </g>`
}

function crystal(x, y, size, rotate) {
    return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${size})">
        <path d="M0-30 L18-8 L10 30 L-14 26 L-18-10Z" fill="#4fb4ff" opacity=".9"/>
        <path d="M0-30 L18-8 L0 2Z" fill="#bfe6ff"/>
        <path d="M0 2 L10 30 L-14 26Z" fill="#2b7fe0"/>
    </g>`
}

function coin(x, y, size, rotate) {
    return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${size})">
        <ellipse cx="4" cy="8" rx="46" ry="44" fill="#b87408"/>
        <ellipse rx="46" ry="44" fill="url(#gold)"/>
        <ellipse rx="33" ry="31" fill="none" stroke="#fff3b8" stroke-width="5" opacity=".75"/>
    </g>`
}

function background(seed) {
    const random = createRandom(seed)
    const sparks = Array.from({ length: 34 }, () => {
        const x = Math.round(random() * WIDTH)
        const y = Math.round(random() * 1000)
        const color = random() > 0.5 ? '#ffd257' : '#6fc8ff'
        return `<rect x="${x}" y="${y}" width="${Math.round(4 + random() * 12)}" height="4" rx="2" fill="${color}" opacity="${(0.35 + random() * 0.6).toFixed(2)}" transform="rotate(-38 ${x} ${y})"/>`
    }).join('')

    return `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <ellipse cx="543" cy="540" rx="520" ry="500" fill="url(#halo)"/>
    ${sparks}
    <path d="M-30 1040 C 380 1010 880 760 1110 300" fill="none" stroke="#6fd2ff" stroke-width="20" opacity=".25" filter="url(#blur)"/>
    <path d="M-30 1040 C 380 1010 880 760 1110 300" fill="none" stroke="#bfeaff" stroke-width="5" opacity=".9"/>
    ${cloud(-110, 200, 1, 0.55)}${cloud(-160, 830, 1.1, 0.5)}${cloud(860, 1390, 1, 0.6)}${cloud(-120, 1420, 0.9, 0.5)}
    ${crystal(800, 150, 1.5, 18)}${crystal(150, 730, 1.3, -40)}${crystal(960, 850, 1.5, 30)}`
}

function title(text) {
    const fit = text.length > 6 ? ` textLength="${text.length > 8 ? 940 : 900}" lengthAdjust="spacingAndGlyphs"` : ''
    const size = text.length > 8 ? 190 : text.length > 6 ? 200 : 290
    return `<text x="543" y="1262" text-anchor="middle" font-family="'Arial Black','Segoe UI Black',Inter,sans-serif" font-weight="900" font-size="${size}" fill="url(#titleFill)" filter="url(#titleShadow)"${fit}>${text}</text>`
}

const DEFS = `<defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="85%"><stop offset="0" stop-color="#1a5cf0"/><stop offset=".55" stop-color="#0c34ad"/><stop offset="1" stop-color="#071c6a"/></radialGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#59b4ff" stop-opacity=".6"/><stop offset="1" stop-color="#59b4ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#ffc21f"/><stop offset="1" stop-color="#d98500"/></linearGradient>
    <linearGradient id="titleFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c7dbff"/></linearGradient>
    <linearGradient id="redFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a5a"/><stop offset="1" stop-color="#c8102e"/></linearGradient>
    <linearGradient id="redSide" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d91f3a"/><stop offset="1" stop-color="#8a0a22"/></linearGradient>
    <linearGradient id="redDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3142f"/><stop offset="1" stop-color="#6d0719"/></linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ff5a"/><stop offset=".55" stop-color="#2fd34f"/><stop offset="1" stop-color="#0d8a35"/></linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset=".6" stop-color="#ff8a1f"/><stop offset="1" stop-color="#d9480f"/></linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e6f7"/></linearGradient>
    <radialGradient id="ballRed" cx="35%" cy="30%"><stop offset="0" stop-color="#ff9a9a"/><stop offset=".5" stop-color="#ec2138"/><stop offset="1" stop-color="#8f0820"/></radialGradient>
    <radialGradient id="ballGold" cx="35%" cy="30%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffc21f"/><stop offset="1" stop-color="#b36b00"/></radialGradient>
    <radialGradient id="ballBlue" cx="35%" cy="30%"><stop offset="0" stop-color="#a6e4ff"/><stop offset=".5" stop-color="#22a2f2"/><stop offset="1" stop-color="#0a4fa6"/></radialGradient>
    <radialGradient id="ballWhite" cx="35%" cy="30%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#aebfd6"/></radialGradient>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#031046" flood-opacity=".6"/></filter>
    <filter id="titleShadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#04124d" flood-opacity=".75"/></filter>
</defs>`

function cube(cx, cy, s, values) {
    const w = s * 0.866
    const h = s * 0.5
    const pip = (u, v) => `<circle cx="${u}" cy="${v}" r=".105" fill="#fff"/>`
    const layouts = {
        1: [[0.5, 0.5]],
        2: [[0.27, 0.27], [0.73, 0.73]],
        3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
        4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
        5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
        6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
    }
    const pips = (face) => layouts[face].map(([u, v]) => pip(u, v)).join('')
    const round = `stroke-width="${s * 0.1}" stroke-linejoin="round"`
    return `<g transform="translate(${cx} ${cy})">
        <polygon points="${-w},${-h} 0,0 0,${s} ${-w},${h}" fill="url(#redSide)" stroke="url(#redSide)" ${round}/>
        <polygon points="${w},${-h} 0,0 0,${s} ${w},${h}" fill="url(#redDark)" stroke="url(#redDark)" ${round}/>
        <polygon points="0,${-s} ${w},${-h} 0,0 ${-w},${-h}" fill="url(#redFace)" stroke="url(#redFace)" ${round}/>
        <g transform="matrix(${w} ${-h} ${w} ${h} ${-w} ${-h})">${pips(values[0])}</g>
        <g transform="matrix(${w} ${h} 0 ${s} ${-w} ${-h})">${pips(values[1])}</g>
        <g transform="matrix(${w} ${-h} 0 ${s} 0 0)">${pips(values[2])}</g>
    </g>`
}

function playingCard(x, y, rotate, rank, suit, color, scale = 1) {
    return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">
        <rect x="-150" y="-215" width="300" height="430" rx="30" fill="url(#card)" stroke="#a9bfdc" stroke-width="3"/>
        <text x="-124" y="-132" font-family="'Arial Black',sans-serif" font-size="86" fill="${color}">${rank}</text>
        <text x="-122" y="-66" font-family="'Segoe UI Symbol',sans-serif" font-size="70" fill="${color}">${suit}&#xFE0E;</text>
        <text x="0" y="104" text-anchor="middle" font-family="'Segoe UI Symbol',sans-serif" font-size="230" fill="${color}">${suit}&#xFE0E;</text>
    </g>`
}

function arrow(x, y, up, fill, scale = 1) {
    const direction = up ? 1 : -1
    return `<g transform="translate(${x} ${y}) scale(${scale} ${scale * direction})">
        <path d="M0-120 L92-18 L40-18 L40 104 L-40 104 L-40-18 L-92-18Z" fill="${fill}" stroke="#fff" stroke-opacity=".55" stroke-width="6" stroke-linejoin="round"/>
    </g>`
}

function ball(x, y, radius, fill, label) {
    return `<g transform="translate(${x} ${y})">
        <circle r="${radius}" fill="url(#${fill})"/>
        <circle r="${radius * 0.56}" fill="#fff"/>
        <text y="${radius * 0.24}" text-anchor="middle" font-family="'Arial Black',sans-serif" font-size="${radius * 0.66}" fill="#10264f">${label}</text>
    </g>`
}

function chipStack(x, y) {
    return [0, 1, 2, 3].map((index) => `<g transform="translate(${x} ${y - index * 34})">
        <ellipse cy="16" rx="104" ry="38" fill="#7a0a20"/>
        <rect x="-104" y="-2" width="208" height="18" fill="#7a0a20"/>
        <ellipse rx="104" ry="38" fill="url(#ballRed)"/>
        <ellipse rx="72" ry="25" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="22 16"/>
    </g>`).join('')
}

const ROULETTE_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]

function rouletteWheel() {
    const point = (radius, degrees) => {
        const radians = ((degrees - 90) * Math.PI) / 180
        return `${(radius * Math.cos(radians)).toFixed(1)} ${(radius * Math.sin(radians)).toFixed(1)}`
    }
    const step = 360 / ROULETTE_ORDER.length
    const sectors = ROULETTE_ORDER.map((pocket, index) => {
        const start = index * step - step / 2
        const end = start + step
        const fill = pocket === 0 ? '#22c55e' : index % 2 === 1 ? '#e11d38' : '#10172e'
        return `<path d="M${point(370, start)} A370 370 0 0 1 ${point(370, end)} L${point(240, end)} A240 240 0 0 0 ${point(240, start)}Z" fill="${fill}" stroke="#ffd86b" stroke-width="3"/>`
    }).join('')
    return `<g transform="translate(543 540) rotate(-12)" filter="url(#shadow)">
        <circle r="410" fill="url(#gold)"/>
        <circle r="378" fill="#6b3a06"/>
        ${sectors}
        <circle r="240" fill="url(#gold)"/>
        <circle r="186" fill="#a8640a"/>
        <circle r="150" fill="url(#gold)"/>
        <path d="M-16-150 L16-150 L10-16 L150-16 L150 16 L10 16 L16 150 L-16 150 L-10 16 L-150 16 L-150-16 L-10-16Z" fill="#fff1b5"/>
        <circle r="44" fill="url(#ballGold)"/>
        <circle cx="210" cy="-262" r="36" fill="url(#ballWhite)"/>
    </g>`
}

function kenoCard() {
    const lit = new Set([2, 7, 9, 13, 16, 21])
    const tiles = Array.from({ length: 25 }, (_, index) => {
        const x = -304 + (index % 5) * 126
        const y = -304 + Math.floor(index / 5) * 126
        return `<rect x="${x}" y="${y}" width="108" height="108" rx="20" fill="${lit.has(index) ? 'url(#green)' : '#1d4fc7'}" stroke="#7fb4ff" stroke-opacity=".45" stroke-width="3"/>`
    }).join('')
    return `<g transform="translate(543 500) rotate(-9)" filter="url(#shadow)">
        <rect x="-340" y="-340" width="680" height="680" rx="44" fill="#0d2f96" stroke="#8cc4ff" stroke-width="6"/>
        ${tiles}
    </g>`
}

const THUMBNAILS = {
    dice: () => `${title('DICE')}<g filter="url(#shadow)">${cube(420, 640, 170, [4, 2, 5])}${cube(690, 420, 230, [6, 3, 1])}</g>${coin(180, 400, 1.3, -20)}${coin(900, 700, 1.1, 18)}`,
    limbo: () => `${title('LIMBO')}<g filter="url(#shadow)">
        <ellipse cx="543" cy="660" rx="360" ry="120" fill="none" stroke="#7fe2ff" stroke-width="40"/>
        <ellipse cx="543" cy="660" rx="360" ry="120" fill="none" stroke="#fff" stroke-width="10"/>
        <g transform="translate(543 520) scale(3.1)"><path d="M0-120 L92-18 L40-18 L40 104 L-40 104 L-40-18 L-92-18Z" fill="url(#gold)" stroke="#fff6c9" stroke-width="5" stroke-linejoin="round"/></g>
        <path d="M183 660 A360 120 0 0 0 903 660" fill="none" stroke="#7fe2ff" stroke-width="40"/>
        <path d="M183 660 A360 120 0 0 0 903 660" fill="none" stroke="#fff" stroke-width="10"/>
    </g>${coin(190, 360, 1.3, -22)}${coin(910, 560, 1.15, 16)}`,
    keno: () => `${title('KENO')}${kenoCard()}<g filter="url(#shadow)">${ball(250, 780, 120, 'ballRed', '7')}${ball(540, 840, 140, 'ballGold', '21')}${ball(830, 770, 118, 'ballBlue', '36')}</g>`,
    hilo: () => `${title('HILO')}<g filter="url(#shadow)">${playingCard(420, 540, -12, '9', '♦', '#d81f3a', 1.2)}${playingCard(640, 560, 10, 'K', '♠', '#14213d', 1.25)}</g><g filter="url(#shadow)">${arrow(150, 400, true, 'url(#green)', 1.05)}${arrow(935, 780, false, 'url(#orange)', 1.05)}</g>`,
    blackjack: () => `${title('BLACKJACK')}<g filter="url(#shadow)">${playingCard(430, 500, -13, 'A', '♠', '#14213d', 1.2)}${playingCard(655, 520, 11, 'J', '♥', '#d81f3a', 1.25)}${chipStack(240, 900)}${chipStack(840, 930)}</g>`,
    roulette: () => `${title('ROULETTE')}${rouletteWheel()}`,
}

function toSvg(id, index) {
    return `<!doctype html><html><body style="margin:0;background:#071c6a"><svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${DEFS}${background(101 + index * 37)}${THUMBNAILS[id]()}</svg></body></html>`
}

const chrome = CHROME_PATHS.find(existsSync)
if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.')

const workDir = mkdtempSync(join(tmpdir(), 'game-thumbs-'))
try {
    Object.keys(THUMBNAILS).forEach((id, index) => {
        const htmlPath = join(workDir, `${id}.html`)
        const pngPath = join(workDir, `${id}.png`)
        writeFileSync(htmlPath, toSvg(id, index))

        const shot = spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
            `--user-data-dir=${join(workDir, 'profile')}`, `--window-size=${WIDTH},${HEIGHT}`,
            `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
        ], { encoding: 'utf8', timeout: 60000 })
        if (!existsSync(pngPath)) throw new Error(`Chrome failed for ${id}: ${shot.stderr}`)

        const encode = spawnSync('ffmpeg', [
            '-y', '-hide_banner', '-loglevel', 'error', '-i', pngPath,
            '-vf', `scale=${WIDTH}:${HEIGHT}`, '-frames:v', '1', '-c:v', 'libaom-av1', '-still-picture', '1',
            '-crf', '34', '-cpu-used', '4', '-pix_fmt', 'yuv420p', join(OUTPUT_DIR, `${id}.avif`),
        ], { encoding: 'utf8' })
        if (encode.status !== 0) throw new Error(`ffmpeg failed for ${id}: ${encode.stderr}`)
    })
    console.log(`Generated ${Object.keys(THUMBNAILS).length} thumbnails`)
} finally {
    rmSync(workDir, { recursive: true, force: true })
}
