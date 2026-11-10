export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const SUITS = [
    { symbol: '♠', red: false },
    { symbol: '♥', red: true },
    { symbol: '♦', red: true },
    { symbol: '♣', red: false },
]

export function rankOf(card) {
    return card % 13
}

export function suitOf(card) {
    return Math.floor(card / 13) % 4
}

export function cardLabel(card) {
    return `${RANKS[rankOf(card)]}${SUITS[suitOf(card)].symbol}`
}
