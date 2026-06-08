import { createShuffledDeck, getCardValue, getCardPower, shuffle} from './deck.js';

const rooms = {}; // will hold all active game rooms, keyed by room code. Each room has {roomCode, players, deck, discardPile, currentTurn, phase, knockedBy, cardCount}

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length)); // random code generator
    }
    return code;
}

export function createRoom(hostId, hostName, cardCount) {
    let code = generateRoomCode();
    while(rooms[code]) code = generateRoomCode(); //exits once unique code is generated

    rooms[code] = {
        roomCode: code,
        players: [
            {
                id: hostId,
                name: hostName,
                hand: [],
                hasKnocked: false,
            }
        ],
        deck: [],
        discardPile: [],
        currentTurn: 0,
        phase: 'lobby',
        knockedBy: null,
        cardCount: cardCount || 4, // defaults to 4

    };
    return rooms[code];
}

export function joinRoom(roomCode, playerId, playerName) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Room not found' };
    if (room.phase !== 'lobby') return { error: 'Game already started' };
    if (room.players.length >= 6) return { error: 'Room is full' };

    room.players.push({
        id: playerId,
        name: playerName,
        hand: [],
        hasKnocked: false,
    }); //adds new player to room's player list
    return room;
}


// deals cards to players, moves to peek phase
export function startGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) return { error: 'Room not found' };

    const deck = createShuffledDeck();
    const cardCount = room.cardCount;

    for (const player of room.players) {
        player.hand = [];
        for (let i = 0; i < cardCount; i++) {
            player.hand.push(deck.pop()); //adds card to player's hand and removes it from the deck
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
    const player = room.players.find(p => p.id === playerId); // find the player in the room's player list

    if (!player) return {error: 'Player not found'};

    const half  = room.cardCount / 2;
    if (cardIndices.length !== half) return {error: `Must peek at exactly ${half} cards`};

    room.peeksDone[playerId] = true;

    if (Object.keys(room.peeksDone).length === room.players.length) {
        room.phase = 'playing';
        room.currentTurn = 0;
    } // allows game to advance to playing phase once all players have done their peek

    return {room, peekIndices: cardIndices };
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
    const discardedCard = player.hand[handIndex]; //player selects card to swap out
    const power = getCardPower(discardedCard);

    discardedCard.faceUp = true; // make sure discarded card isn't visible to other players
    player.hand[handIndex] = drawnCard; //replaces selected card with drawn card
    drawnCard.faceUp = false; //back in the player's hand, so face down

    room.discardPile.push(discardedCard);
    return { room, power, discardedCard };
}

export function discardDrawnCard(roomCode, drawnCard) {
     const room = rooms[roomCode];
     drawnCard.faceUp = true; //into face up pile, so everyone can see
     room.discardPile.push(drawnCard);

     const power = getCardPower(drawnCard);
     return { room, power };
}

// 8,9 power
export function peekOwnCard(roomCode, playerId, handIndex) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const card = player.hand[handIndex];
    // server sends card privately to player
    return {room, card, handIndex};
}

// 10,J power
export function peekOtherCard(roomCode, playerId, targetPlayerId, handIndex) {
    const room = rooms[roomCode];
    const target = room.players.find(p => p.id === targetPlayerId);
    const card = target.hand[handIndex];
    return { room, card, targetPlayerId, handIndex };
}

// Q power
export function swapBlind(roomCode, playerId, myIndex, targetPlayerId, theirIndex) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const target = room.players.find(p => p.id === targetPlayerId);

    const temp = player.hand[myIndex]; // temporary open card to hold the value during the swap
    player.hand[myIndex] = target.hand[theirIndex]; //replaces player's card with target's card
    target.hand[theirIndex] = temp; //replaces target's card with player's card

    return {room};
}

// K power
export function swapAndLook(roomCode, playerId, myIndex, targetPlayerId, theirIndex) {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === playerId);
    const target = room.players.find(p => p.id === targetPlayerId);

    const temp = player.hand[myIndex];
    player.hand[myIndex] = target.hand[theirIndex]; 
    target.hand[theirIndex] = temp; 

    const receivedCard = player.hand[myIndex]; // is now the card that was swapped from the target, so player can see it
    return {room, receivedCard};
}

//cardRefs is {playerId, handIndex} pairs for the cards being matched
export function attemptMatch(roomCode, playerId, cardRefs) {
    const room = rooms[roomCode];
    const topCard = room.discardPile[room.discardPile.length - 1];
    const targetValue = topCard.value;
 
    const cards = cardRefs.map(ref => {
        const player = room.players.find(p => p.id === ref.playerId);
        return {
            card: player.hand[ref.handIndex],
            playerId: ref.playerId,
            handIndex: ref.handIndex
        };
    });
 
    const sum = cards.reduce((total, c) => total + c.card.value, 0); //sums values of selected cards (const cards)
 
    if (sum !== targetValue) {
        // penalty: all attempted cards go to attacker plus one from deck
        const attacker = room.players.find(p => p.id === playerId);
        if (room.deck.length === 0) reshuffleDeck(room);
        const penaltyCard = room.deck.pop();
        penaltyCard.faceUp = false;
        attacker.hand.push(penaltyCard);
 
        for (const c of cards) {
            c.card.faceUp = false;
            attacker.hand.push(c.card);
            const owner = room.players.find(p => p.id === c.playerId);
            owner.hand.splice(c.handIndex, 1);
        } //adds all attempted cards to attacker's hand and removes them from their original owners' hands
 
        return { room, success: false, penalty: true };
    }

    // success: move matched cards to discard pile
    for (const c of cards) {
        c.card.faceUp = true;
        room.discardPile.push(c.card);
        const owner = room.players.find(p => p.id === c.playerId);
        owner.hand.splice(c.handIndex, 1);
    }

    // if any original owner's hand is now empty, they win
    const ownerIds = [...new Set(cards.map(c => c.playerId))];
    for (const ownerId of ownerIds) {
        const owner = room.players.find(p => p.id === ownerId);
        if (owner.hand.length === 0) {
            room.phase = 'ended';
            room.winner = owner.id;
            return { room, success: true, penalty: false };
        }
    }
 
    // count how many cards were taken from each non-attacker
    const takenFrom = {};
    for (const ref of cardRefs) {
        takenFrom[ref.playerId] = (takenFrom[ref.playerId] || 0) + 1; 
    }
 
    const attacker = room.players.find(p => p.id === playerId);
 
    // replace non-attackers' lost cards from the deck
    for (const targetId in takenFrom) {               // FIX: targetId not playerId
        if (targetId === playerId) continue;           // skip attacker
        const target = room.players.find(p => p.id === targetId);
        for (let i = 0; i < takenFrom[targetId]; i++) {
            if (room.deck.length === 0) reshuffleDeck(room);
            const newCard = room.deck.pop();
            newCard.faceUp = false;
            target.hand.push(newCard);
        }
    }                                                  // FIX: loop ends here
 
    // win check and return are now OUTSIDE the loop
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
    return {room};
}

export function advanceTurn(room) {
    room.currentTurn = (room.currentTurn + 1) % room.players.length;

    if (room.phase === 'knocked') {
        const knocker = room.players.find(p => p.id === room.knockedBy);
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
        if(
            !best||
            sum < best.sum ||
            (sum === best.sum && cardCount < best.cardCount)
        ) {
            best = {id: player.id, sum, cardCount};
        }
    }
    return best.id;
}

function reshuffleDeck(room) {
    const topCard = room.discardPile.pop();
    room.deck = shuffle(room.discardPile);
    room.discardPile = [topCard];
}

export function removePlayer(roomCode, playerId) {
    const room = rooms[roomCode];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) delete rooms[roomCode];
    return room;
}

export function getRoom(roomCode) {
    return rooms[roomCode];
}