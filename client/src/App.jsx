import { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import Game from './components/Game';

// App is the top-level component.
// It listens for server events that change which screen to show,
// and passes game state down to the Game component.

export default function App() {
  const [screen, setScreen]       = useState('lobby');  // 'lobby' | 'waiting' | 'game'
  const [roomCode, setRoomCode]   = useState('');
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId]           = useState('');

  useEffect(() => {
    // socket.id is assigned once we connect
    socket.on('connect', () => {
      setMyId(socket.id);
    });

    // server confirms room was created — move to waiting room
    socket.on('room_created', ({ roomCode }) => {
      setRoomCode(roomCode);
      setScreen('waiting');
    });

    // server sends full game state updates
    // this fires on: join, start, every action
    socket.on('game_state', (state) => {
      setGameState(state);
      // if game has started, show game screen
      if (state.phase !== 'lobby') {
        setScreen('game');
      } else {
        // still in lobby — show waiting room
        setScreen('waiting');
        setRoomCode(state.roomCode);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('room_created');
      socket.off('game_state');
    };
  }, []);

  // ---- LOBBY ----
  if (screen === 'lobby') {
    return <Lobby />;
  }

  // ---- WAITING ROOM ----
  if (screen === 'waiting') {
    const isHost = gameState?.players[0]?.id === myId;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at 60% 40%, #1a3a2a 0%, #0d1f15 60%, #070d0a 100%)',
        fontFamily: "'Crimson Text', serif",
      }}>
        <div style={{
          background: '#ffffff0a', borderRadius: 16, border: '1px solid #b8a96a33',
          padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          maxWidth: 420, width: '90%',
        }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#fffef5', margin: 0, fontSize: 26 }}>
            Waiting Room
          </h2>

          {/* room code — big and easy to share */}
          <div style={{
            background: '#f0c04011', border: '1px solid #f0c04044',
            borderRadius: 10, padding: '12px 32px', textAlign: 'center',
          }}>
            <p style={{ color: '#b8a96a', fontSize: 12, margin: '0 0 4px', letterSpacing: 3 }}>ROOM CODE</p>
            <p style={{ color: '#f0c040', fontSize: 36, margin: 0, letterSpacing: 8,
              fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>
              {roomCode}
            </p>
          </div>

          <p style={{ color: '#ffffff55', fontSize: 14, margin: 0, textAlign: 'center' }}>
            Share this code with friends to join
          </p>

          {/* player list */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gameState?.players.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 8,
                background: p.id === myId ? '#f0c04011' : '#ffffff08',
                border: p.id === myId ? '1px solid #f0c04033' : '1px solid #ffffff11',
              }}>
                <span style={{ color: '#b8a96a', fontSize: 18 }}>
                  {i === 0 ? '♔' : '♟'}
                </span>
                <span style={{ color: '#fffef5', fontSize: 16 }}>{p.name}</span>
                {p.id === myId && (
                  <span style={{ marginLeft: 'auto', color: '#b8a96a', fontSize: 12 }}>you</span>
                )}
                {i === 0 && p.id !== myId && (
                  <span style={{ marginLeft: 'auto', color: '#b8a96a', fontSize: 12 }}>host</span>
                )}
              </div>
            ))}
          </div>

          {/* only host can start */}
          {isHost && (
            <button
              onClick={() => socket.emit('start_game', { roomCode })}
              disabled={gameState?.players.length < 2}
              style={{
                width: '100%', padding: 13, borderRadius: 8, border: 'none',
                background: gameState?.players.length >= 2
                  ? 'linear-gradient(135deg, #b8a96a, #f0c040)'
                  : '#ffffff11',
                color: gameState?.players.length >= 2 ? '#1a1a2e' : '#ffffff33',
                fontSize: 17, fontWeight: 700, cursor: gameState?.players.length >= 2 ? 'pointer' : 'default',
                fontFamily: "'Playfair Display', serif", letterSpacing: 1,
              }}
            >
              {gameState?.players.length < 2 ? 'Waiting for players...' : 'Start Game'}
            </button>
          )}

          {!isHost && (
            <p style={{ color: '#ffffff44', fontSize: 14, margin: 0 }}>
              Waiting for host to start...
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- GAME ----
  if (screen === 'game' && gameState) {
    return <Game roomCode={roomCode} gameState={gameState} myId={myId} />;
  }

  return null;
}
