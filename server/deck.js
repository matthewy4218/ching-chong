const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function getCardValue(card) {
    if (card.rank === 'K' && card.suit === 'hearts') return -1;
    if (card.rank === 'A') return 1;
    if (card.rank === 'J') return 11;
    if (card.rank === 'Q') return 12;
    if (card.rank === 'K') return 13;
    return parseInt(card.rank);
}

export function getCardPower(card) {
    if (card.rank === '8' || card.rank === '9') return 'peek-own';
    if (card.rank === '10' || card.rank === 'J') return 'peek-other';
    if (card.rank === 'Q') return 'swap-blind';
    if (card.rank === 'K') return 'swap-look';
    return null;
}

export function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ 
                suit, 
                rank,
                value: getCardValue({ suit, rank }),
                faceUp: false,
            });
        }
    }
    return deck;
}

export function shuffle(array) {
    for (let i = array.length - 1; i>0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function createShuffledDeck() {
    const deck = createDeck();
    return shuffle(deck);
}