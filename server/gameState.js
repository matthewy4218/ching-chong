import { createShuffledDeck, getCardValue, getCardPower, shuffle} from './deck.js';

const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export function createRoom(hostId, hostName, cardCount) {
    let code = generateRoomCode();
    while(rooms[code]) code = generateRoomCode();

    rooms[code] = {
        roomCode: code,
        players: [{ id: hostId, name: hostName, hand: [], hasKnocked: false }],
        deck: [],
        discardPile: [],
        currentTurn: 0,
        phase: 'lobby',
        knockedBy: null,
        cardCount: cardCount || 4,
    };
    return rooms[code];
}

export function joinRoom(roomCode, playerId, playerName) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Room not found' };
    if (room.phase !== 'lobby') return { error: 'Game already started' };
    if (room.players.length >= 6) return { error: 'Room is full' };
    room.players.push({ id: playerId, name: playerName, hand: [], hasKnocked: false });
    return room;
}

export function startGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Room not found' };

    const deck = createShuffledDeck();
    const cardCount = room.cardCount;

    for (const player of room.players) {
        player.hand = [];
        for (let i = 0; i < cardCount; i++) {
            // BUG3 FIX: ensure all dealt cards are face down
            const card = deck.pop();
            card.faceUp = false;
            player.hand.push(card);
        }
    }

    room.deck = deck;
    room.discardPile = [];
    room.phase = 'peek';
    room.peeksDone = {};
    return room;
}

export function peekCards(roomCode, playerId, cardIndices) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    if (!player) return {error: 'Player not found'};

    const half = room.cardCount / 2;
    if (cardIndices.length !== half) return {error: `Must peek at exactly ${half} cards`};

    room.peeksDone[playerId] = cardIndices;

    const allDone = Object.keys(room.peeksDone).length === room.players.length;
    if (allDone) room.phase = 'revealing';

    return { room, peekIndices: cardIndices, allDone };
}

export function drawCard(roomCode, playerId) {
    const room = rooms[roomCode];
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex !== room.currentTurn) return {error: 'Not your turn'};
    if (room.deck.length === 0) reshuffleDeck(room);
    const drawnCard = room.deck.pop();
    return { room, drawnCard };
}

export function swapDrawnCard(roomCode, playerId, handIndex, drawnCard) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const discardedCard = player.hand[handIndex];
    const power = getCardPower(drawnCard);

    discardedCard.faceUp = true;   // going to discard pile — face up
    player.hand[handIndex] = { ...drawnCard, faceUp: false }; // BUG3 FIX: always face down in hand
    room.discardPile.push(discardedCard);
    return { room, power, discardedCard };
}

export function discardDrawnCard(roomCode, drawnCard) {
    const room = rooms[roomCode];
    const cardToDiscard = { ...drawnCard, faceUp: true }; // BUG3 FIX: explicit copy with faceUp true
    room.discardPile.push(cardToDiscard);
    const power = getCardPower(cardToDiscard);
    return { room, power };
}

export function peekOwnCard(roomCode, playerId, handIndex) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const card = player.hand[handIndex];
    return { room, card, handIndex };
}

export function peekOtherCard(roomCode, playerId, targetPlayerId, handIndex) {
    const room = rooms[roomCode];
    const target = room.players.find(p => p.id === targetPlayerId);
    const card = target.hand[handIndex];
    return { room, card, targetPlayerId, handIndex };
}

export function swapBlind(roomCode, playerId, myIndex, targetPlayerId, theirIndex) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const target = room.players.find(p => p.id === targetPlayerId);

    const temp = player.hand[myIndex];
    player.hand[myIndex] = { ...target.hand[theirIndex], faceUp: false }; // BUG3 FIX
    target.hand[theirIndex] = { ...temp, faceUp: false };                  // BUG3 FIX
    return { room };
}

export function swapAndLook(roomCode, playerId, myIndex, targetPlayerId, theirIndex) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const target = room.players.find(p => p.id === targetPlayerId);

    const temp = player.hand[myIndex];
    player.hand[myIndex] = { ...target.hand[theirIndex], faceUp: false }; // BUG3 FIX
    target.hand[theirIndex] = { ...temp, faceUp: false };                  // BUG3 FIX

    const receivedCard = player.hand[myIndex];
    player.hand[myIndex] = {... receivedCard, faceUp: false};
    return { room, receivedCard };
}

export function attemptMatch(roomCode, playerId, cardRefs) {
    const room = rooms[roomCode];
    const topCard = room.discardPile[room.discardPile.length - 1];
    const targetValue = topCard.value;

    // snapshot cards BEFORE any mutation — record which owner each card belongs to
    const cards = cardRefs.map(ref => {
        const owner = room.players.find(p => p.id === ref.playerId);
        return {
            card: owner.hand[ref.handIndex],
            playerId: ref.playerId,
            handIndex: ref.handIndex,
        };
    });

    const sum = cards.reduce((total, c) => total + c.card.value, 0);
    const attacker = room.players.find(p => p.id === playerId);

    // ---- MISMATCH ----
    // BUG2 FIX: cards from B return to B; attacker gets (# cards taken from others) + 1 penalty
    if (sum !== targetValue) {
        // group attempted cards by original owner
        const byOwner = {};
        for (const c of cards) {
            if (!byOwner[c.playerId]) byOwner[c.playerId] = [];
            byOwner[c.playerId].push(c);
        }

        // return each card to its original owner, face down
        // remove in reverse index order to avoid splice shifting issues
        for (const ownerId in byOwner) {
            const owner = room.players.find(p => p.id === ownerId);
            const ownerCards = byOwner[ownerId].sort((a, b) => b.handIndex - a.handIndex);
            for (const c of ownerCards) {
                c.card.faceUp = false; // BUG3 FIX: always face down when returned
                if (ownerId !== playerId) {
                    // card was taken from someone else — it never left, just unselect it
                    // (we haven't removed it yet)
                } else {
                    // attacker's own cards were selected — they stay in hand already
                }
            }
        }

        // count how many cards were taken from NON-attackers
        let cardsFromOthers = 0;
        for (const c of cards) {
            if (c.playerId !== playerId) cardsFromOthers++;
        }

        // attacker gets penalty: one card per card taken from others + 1 extra
        const penaltyCount = cardsFromOthers + 1;
        for (let i = 0; i < penaltyCount; i++) {
            if (room.deck.length === 0) reshuffleDeck(room);
            const penaltyCard = room.deck.pop();
            penaltyCard.faceUp = false; // BUG3 FIX
            attacker.hand.push(penaltyCard);
        }

        return { room, success: false, penalty: true };
    }

    // ---- SUCCESS ----
    // remove matched cards from owners' hands (reverse order per owner to avoid index shift)
    const byOwner = {};
    for (const c of cards) {
        if (!byOwner[c.playerId]) byOwner[c.playerId] = [];
        byOwner[c.playerId].push(c);
    }
    for (const ownerId in byOwner) {
        const owner = room.players.find(p => p.id === ownerId);
        const sorted = byOwner[ownerId].sort((a, b) => b.handIndex - a.handIndex);
        for (const c of sorted) {
            c.card.faceUp = true;
            room.discardPile.push(c.card);
            owner.hand.splice(c.handIndex, 1);
        }
    }

    // check if any owner's hand is now empty — instant win
    for (const ownerId in byOwner) {
        const owner = room.players.find(p => p.id === ownerId);
        if (owner.hand.length === 0) {
            room.phase = 'ended';
            room.winner = owner.id;
            return { room, success: true, penalty: false };
        }
    }

    // replace non-attackers' lost cards from the deck
    for (const ownerId in byOwner) {
        if (ownerId === playerId) continue; // attacker loses their cards, no replacement
        const owner = room.players.find(p => p.id === ownerId);
        const count = byOwner[ownerId].length;
        for (let i = 0; i < count; i++) {
            if (room.deck.length === 0) reshuffleDeck(room);
            const newCard = room.deck.pop();
            newCard.faceUp = false; // BUG3 FIX
            owner.hand.push(newCard);
        }
    }

    // check attacker win
    if (attacker.hand.length === 0) {
        room.phase = 'ended';
        room.winner = attacker.id;
    }

    return { room, success: true, penalty: false };
}

export function knock(roomCode, playerId) {
    const room = rooms[roomCode];
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex !== room.currentTurn) return {error: 'Not your turn'};
    room.phase = 'knocked';
    room.knockedBy = playerId;
    return { room };
}

export function advanceTurn(room) {
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    if (room.phase === 'knocked') {
        if (room.players[room.currentTurn].id === room.knockedBy) {
            room.phase = 'ended';
            room.winner = determineWinner(room);
        }
    }
}

function determineWinner(room) {
    let best = null;
    for (const player of room.players) {
        const sum = player.hand.reduce((t, c) => t + c.value, 0);
        const cardCount = player.hand.length;
        if (!best || sum < best.sum || (sum === best.sum && cardCount < best.cardCount)) {
            best = { id: player.id, sum, cardCount };
        }
    }
    return best.id;
}

function reshuffleDeck(room) {
    const topCard = room.discardPile.pop();
    room.deck = shuffle(room.discardPile);
    room.deck.forEach(c => c.faceUp = false); // BUG3 FIX: all reshuffled cards face down
    room.discardPile = [topCard];
}

export function removePlayer(roomCode, playerId) {
    const room = rooms[roomCode];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) delete rooms[roomCode];
    return room;
}

export function getRooms() { return rooms; }
export function getRoom(roomCode) { return rooms[roomCode]; }
