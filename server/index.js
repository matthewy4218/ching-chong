import express from 'express';
import {createServer} from 'http';
import {Server} from 'socket.io';
import cors from 'cors';
import {
    createRoom, joinRoom, startGame, peekCards, drawCard, 
    swapDrawnCard, discardDrawnCard, peekOwnCard, peekOtherCard, 
    swapBlind, swapAndLook, attemptMatch, knock, advanceTurn, 
    removePlayer, getRooms, getRoom
} from './gameState.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*'}
});



function buildPlayerView(room, playerId) {
    return {
        ...room,
        players: room.players.map(p => ({
            ...p,
            hand: p.hand.map((card) => {
                if (p.id !== playerId && !card.faceUp) {
                    return { faceUp: false, hidden: true };
                }
                return card;
            })
        }))
    };
}

function broadcastRoom(room) {
    for (const player of room.players) {
        io.to(player.id).emit('game_state', buildPlayerView(room, player.id));
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // LOBBY EVENTS
    // Host creates a new room with their name and desired card count.
    socket.on('create_room', ({ playerName, cardCount }) => {
        const room = createRoom(socket.id, playerName, cardCount);
        socket.join(room.roomCode);
        socket.emit('room_created', { roomCode: room.roomCode });
        broadcastRoom(room);
    });
 
    // Player joins an existing room using a room code.
    socket.on('join_room', ({ roomCode, playerName }) => {
        console.log('join_room received:', roomCode, playerName);
        const result = joinRoom(roomCode, socket.id, playerName);
        console.log('joinRoom result:', result);
        if (result.error) return socket.emit('error', result.error);
        socket.join(roomCode);
        broadcastRoom(result);
    });
 
    // starts game: shuffles deck, deals cards, sets initial turn order
    socket.on('start_game', ({ roomCode }) => {
        const result = startGame(roomCode);
        if (result.error) return socket.emit('error', result.error);
        broadcastRoom(result);
    });
 

    
    // PEEK PHASE
    socket.on('peek_cards', ({ roomCode, cardIndices }) => {
        const result = peekCards(roomCode, socket.id, cardIndices);
        if (result.error) return socket.emit('error', result.error);

        // always send this player their peeked cards privately
        const player = result.room.players.find(p => p.id === socket.id);
        const peekedCards = result.peekIndices.map(i => ({
            index: i,
            card: player.hand[i]
        }));
        socket.emit('peek_result', { peekedCards });

        if (result.allDone) {
            // send each player their own reveal cards, then broadcast the revealing phase
            for (const p of result.room.players) {
                const indices = result.room.peeksDone[p.id];
                const cards = indices.map(i => ({ index: i, card: p.hand[i] }));
                io.to(p.id).emit('reveal_peek', { peekedCards: cards });
            }
            broadcastRoom(result.room);
        } else {
            broadcastRoom(result.room);
        }
    });

    // client calls this after the 4-second timer ends — host triggers game start
    socket.on('finish_reveal', ({ roomCode }) => {
        const room = getRoom(roomCode);
        if (!room) return;
        room.phase = 'playing';
        room.currentTurn = 0;
        broadcastRoom(room);
    });
 

    // DRAWING
    socket.on('draw_card', ({ roomCode }) => {
        const result = drawCard(roomCode, socket.id); // result contains drawnCard and updated room
        if (result.error) return socket.emit('error', result.error);
        const cardToShow = {...result.drawnCard, faceUp: true};
        socket.emit('drawn_card', { card: cardToShow }); 
        broadcastRoom(result.room); // update everyone's view of the room with the new drawn card in the player's hand
    });
 
    socket.on('swap_drawn_card', ({ roomCode, handIndex, drawnCard }) => {
        const result = swapDrawnCard(roomCode, socket.id, handIndex, drawnCard);
        if (result.error) return socket.emit('error', result.error);
        if (result.power) {
            // don't advance turn yet — player must resolve power first
            socket.emit('power_available', { power: result.power });
            broadcastRoom(result.room);
        } else {
            advanceTurn(result.room);
            broadcastRoom(result.room);
        }
    });
 
    socket.on('discard_drawn_card', ({ roomCode, drawnCard }) => {
        const result = discardDrawnCard(roomCode, drawnCard);
        // discarding may trigger a power. If so, we need to let the player resolve it before advancing the turn.
        if (result.power) {
            socket.emit('power_available', { power: result.power });
            broadcastRoom(result.room);
        } else {
            advanceTurn(result.room);
            broadcastRoom(result.room);
        }
    });
 
   
    // POWER CARDS
    socket.on('peek_own', ({ roomCode, handIndex }) => {
        const result = peekOwnCard(roomCode, socket.id, handIndex);
        socket.emit('peek_own_result', { index: handIndex, card: result.card });
        advanceTurn(result.room);
        broadcastRoom(result.room);
    });
 
    socket.on('peek_other', ({ roomCode, targetPlayerId, handIndex }) => {
        const result = peekOtherCard(roomCode, socket.id, targetPlayerId, handIndex);
        socket.emit('peek_other_result', { targetPlayerId, index: handIndex, card: result.card });
        advanceTurn(result.room);
        broadcastRoom(result.room);
    });
 
    socket.on('swap_blind', ({ roomCode, myIndex, targetPlayerId, theirIndex }) => {
        const result = swapBlind(roomCode, socket.id, myIndex, targetPlayerId, theirIndex);
        advanceTurn(result.room);
        broadcastRoom(result.room);
    });
 
    socket.on('swap_and_look', ({ roomCode, myIndex, targetPlayerId, theirIndex }) => {
        const result = swapAndLook(roomCode, socket.id, myIndex, targetPlayerId, theirIndex);
        socket.emit('swap_look_result', { index: myIndex, card: result.receivedCard });
        advanceTurn(result.room);
        broadcastRoom(result.room);
    });
 
    socket.on('skip_power', ({ roomCode }) => {
        const room = getRoom(roomCode);
        advanceTurn(room);
        broadcastRoom(room);
    });
 
    
    // MATCHING
    socket.on('attempt_match', ({ roomCode, cardRefs }) => {
        const result = attemptMatch(roomCode, socket.id, cardRefs);
        broadcastRoom(result.room);
        if (result.penalty) {
            socket.emit('match_penalty', {});
        }
    });
 
    
    // KNOCKING
    socket.on('knock', ({ roomCode }) => {
        const result = knock(roomCode, socket.id);
        if (result.error) return socket.emit('error', result.error);
        broadcastRoom(result.room);
    });
 
    
    // DISCONNECT
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        const allRooms = getRooms();
        for (const [code, room] of Object.entries(allRooms)) {
            const wasInRoom = room.players.some(p => p.id === socket.id);
            if (wasInRoom) {
                const updated = removePlayer(code, socket.id);
                if (updated) broadcastRoom(updated);
                break; // stop looping once we found their room
            }
        }
    });
});
 

// START LISTENING
// process.env.PORT is set automatically by Railway when deployed.
// Locally it falls back to 3001.
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
 