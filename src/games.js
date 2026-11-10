export const GAMES = [
    { id: 'crash', name: 'Crash', navLabel: 'Crash', path: '/crash', icon: 'original', image: '/images/crash.avif', rtp: '99% RTP', volatility: 'High volatility', mobilePrimary: true },
    { id: 'plinko', name: 'Plinko', navLabel: 'Plinko', path: '/plinko', icon: 'plinko', image: '/images/plinko.avif', rtp: '99% RTP', volatility: 'Medium volatility', mobilePrimary: true },
    { id: 'dino', name: 'Dino', navLabel: 'Dino Run', path: '/dino', icon: 'dino', image: '/images/dino.avif', rtp: '99% RTP', volatility: 'Low volatility' },
    { id: 'mines', name: 'Mines', navLabel: 'Mines', path: '/mines', icon: 'mines', image: '/images/mines.avif', rtp: '99% RTP', volatility: 'Medium volatility', mobilePrimary: true },
    { id: 'dice', name: 'Dice', navLabel: 'Dice', path: '/dice', icon: 'dice', image: '/images/dice.avif', rtp: '99% RTP', volatility: 'Adjustable volatility' },
    { id: 'limbo', name: 'Limbo', navLabel: 'Limbo', path: '/limbo', icon: 'limbo', image: '/images/limbo.avif', rtp: '99% RTP', volatility: 'High volatility' },
    { id: 'keno', name: 'Keno', navLabel: 'Keno', path: '/keno', icon: 'keno', image: '/images/keno.avif', rtp: '99% RTP', volatility: 'Adjustable volatility' },
    { id: 'hilo', name: 'HiLo', navLabel: 'HiLo', path: '/hilo', icon: 'hilo', image: '/images/hilo.avif', rtp: '99% RTP', volatility: 'Medium volatility' },
    { id: 'blackjack', name: 'Blackjack', navLabel: 'Blackjack', path: '/blackjack', icon: 'blackjack', image: '/images/blackjack.avif', rtp: '99.5% RTP', volatility: 'Low volatility' },
    { id: 'roulette', name: 'Roulette', navLabel: 'Roulette', path: '/roulette', icon: 'roulette', image: '/images/roulette.avif', rtp: '97.3% RTP', volatility: 'Adjustable volatility' },
]

export function isGamePath(pathname) {
    return GAMES.some((game) => pathname.startsWith(game.path))
}
