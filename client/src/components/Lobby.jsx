import { useState } from 'react';
import socket from '../socket';

// The first screen players see.
// They can create a new room (choosing card count) or join an existing one.
export default function Lobby() {
  const [screen, setScreen]       = useState('home');    // 'home' | 'create' | 'join'
  const [name, setName]           = useState('');
  const [cardCount, setCardCount] = useState(4);
  const [roomCode, setRoomCode]   = useState('');
  const [error, setError]         = useState('');

  function handleCreate() {
    if (!name.trim()) return setError('Enter your name');
    // emit to server — server will respond with 'room_created'
    socket.emit('create_room', { playerName: name.trim(), cardCount });
  }

  function handleJoin() {
    if (!name.trim()) return setError('Enter your name');
    if (!roomCode.trim()) return setError('Enter a room code');
    socket.emit('join_room', { roomCode: roomCode.trim().toUpperCase(), playerName: name.trim() });
  }

  // shared input style
  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    border: '1.5px solid #b8a96a55', background: '#ffffff0f',
    color: '#fffef5', fontSize: 16, fontFamily: "'Crimson Text', serif",
    outline: 'none', boxSizing: 'border-box',
  };

  const btnStyle = (accent) => ({
    width: '100%', padding: '13px', borderRadius: 8, border: 'none',
    background: accent ? 'linear-gradient(135deg, #b8a96a, #f0c040)' : '#ffffff15',
    color: accent ? '#1a1a2e' : '#fffef5', fontSize: 17, fontWeight: 700,
    fontFamily: "'Playfair Display', serif", cursor: 'pointer', letterSpacing: 1,
  });

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 60% 40%, #1a3a2a 0%, #0d1f15 60%, #070d0a 100%)',
      fontFamily: "'Crimson Text', serif",
    }}>
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>

        {/* title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, letterSpacing: 6, color: '#b8a96a', marginBottom: 8 }}>♠ ♥ ♦ ♣</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontSize: 52, color: '#fffef5',
            margin: 0, fontWeight: 700, textShadow: '0 2px 24px #b8a96a55',
          }}>
            Ching Chong
          </h1>
          <p style={{ color: '#b8a96a99', fontSize: 16, margin: '8px 0 0' }}>
            Made by me (matthew)
          </p>
        </div>

        {/* card panel */}
        <div style={{
          width: '100%', background: '#ffffff0a', borderRadius: 16,
          border: '1px solid #b8a96a33', padding: 32, boxSizing: 'border-box',
        }}>

          {screen === 'home' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button style={btnStyle(true)} onClick={() => setScreen('create')}>Create Room</button>
              <button style={btnStyle(false)} onClick={() => setScreen('join')}>Join Room</button>
            </div>
          )}

          {screen === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#fffef5', margin: '0 0 4px', fontSize: 22 }}>
                New Room
              </h2>
              <input
                style={inputStyle} placeholder="Your name"
                value={name} onChange={e => setName(e.target.value)}
              />
              {/* difficulty = card count */}
              <div>
                <p style={{ color: '#b8a96a', fontSize: 14, margin: '0 0 8px', letterSpacing: 1 }}>DIFFICULTY</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { count: 4, label: 'Easy' },
                    { count: 6, label: 'Medium' },
                    { count: 8, label: 'Hard' },
                  ].map(({ count, label }) => (
                    <button key={count} onClick={() => setCardCount(count)} style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                      border: cardCount === count ? '2px solid #f0c040' : '1.5px solid #b8a96a44',
                      background: cardCount === count ? '#f0c04022' : 'transparent',
                      color: cardCount === count ? '#f0c040' : '#fffef5aa',
                      fontFamily: "'Crimson Text', serif", fontSize: 15,
                    }}>
                      {label}<br />
                      <span style={{ fontSize: 12, opacity: 0.7 }}>{count} cards</span>
                    </button>
                  ))}
                </div>
              </div>
              {error && <p style={{ color: '#e74c3c', margin: 0, fontSize: 14 }}>{error}</p>}
              <button style={btnStyle(true)} onClick={handleCreate}>Create</button>
              <button style={btnStyle(false)} onClick={() => { setScreen('home'); setError(''); }}>Back</button>
            </div>
          )}

          {screen === 'join' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#fffef5', margin: '0 0 4px', fontSize: 22 }}>
                Join Room
              </h2>
              <input
                style={inputStyle} placeholder="Your name"
                value={name} onChange={e => setName(e.target.value)}
              />
              <input
                style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: 4 }}
                placeholder="Room code" maxLength={4}
                value={roomCode} onChange={e => setRoomCode(e.target.value)}
              />
              {error && <p style={{ color: '#e74c3c', margin: 0, fontSize: 14 }}>{error}</p>}
              <button style={btnStyle(true)} onClick={handleJoin}>Join</button>
              <button style={btnStyle(false)} onClick={() => { setScreen('home'); setError(''); }}>Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
