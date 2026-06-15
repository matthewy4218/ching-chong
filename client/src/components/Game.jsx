import { useState, useEffect } from 'react';
import socket from '../socket';
import Hand from './Hand';
import Card from './Card';

export default function Game({ roomCode, gameState, myId }) {
  const [selectedIndex, setSelectedIndex]         = useState(null);
  const [drawnCard, setDrawnCard]                 = useState(null);
  const [power, setPower]                         = useState(null);
  const [message, setMessage]                     = useState('');
  const [matchRefs, setMatchRefs]                 = useState([]);
  const [matchMode, setMatchMode]                 = useState(false);
  const [peekPhaseSelections, setPeekPhaseSelections] = useState([]);
  const [revealedPeekCards, setRevealedPeekCards] = useState({});
  const [revealCountdown, setRevealCountdown]     = useState(0);
  // BUG4: store transiently revealed cards from powers { index, card, playerId? }
  const [transientReveal, setTransientReveal]     = useState(null);

  const me        = gameState.players.find(p => p.id === myId);
  const opponents = gameState.players.filter(p => p.id !== myId);
  const isMyTurn  = gameState.players[gameState.currentTurn]?.id === myId;
  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];

  // BUG5: helper — show a message then auto-clear after ms
  function flashMessage(msg, ms = 4000) {
    setMessage(msg);
    setTimeout(() => setMessage(''), ms);
  }

  useEffect(() => {
    socket.on('peek_result', () => {});

    socket.on('reveal_peek', ({ peekedCards }) => {
      const revealed = {};
      peekedCards.forEach(({ index, card }) => {
        revealed[index] = { rank: card.rank, suit: card.suit, value: card.value, faceUp: true, hidden: false };
      });
      setRevealedPeekCards(revealed);
      setRevealCountdown(4);
      let t = 4;
      const interval = setInterval(() => {
        t -= 1;
        setRevealCountdown(t);
        if (t <= 0) {
          clearInterval(interval);
          setRevealedPeekCards({});
          socket.emit('finish_reveal', { roomCode });
        }
      }, 1000);
    });

    socket.on('drawn_card', ({ card }) => {
      setDrawnCard(card);
      flashMessage('Swap it into your hand, or discard it');
    });

    socket.on('power_available', ({ power }) => {
      setPower(power);
      setMessage(powerMessage(power)); // power message stays until resolved, no auto-clear
    });

    // BUG4: peek-own — flip the card visually for 3 seconds
    socket.on('peek_own_result', ({ index, card }) => {
      const fullCard = { rank: card.rank, suit: card.suit, value: card.value, faceUp: true, hidden: false };
      setTransientReveal({ type: 'own', index, card: fullCard });
      setPower(null);
      setMessage('');
      setTimeout(() => setTransientReveal(null), 3000);
    });

    // BUG4: peek-other — flip the opponent's card visually for 3 seconds
    socket.on('peek_other_result', ({ targetPlayerId, index, card }) => {
      const fullCard = { rank: card.rank, suit: card.suit, value: card.value, faceUp: true, hidden: false };
      setTransientReveal({ type: 'other', targetPlayerId, index, card: fullCard });
      setPower(null);
      setMessage('');
      setTimeout(() => setTransientReveal(null), 3000);
    });

    // BUG4: swap-look — flip the received card visually for 3 seconds
    socket.on('swap_look_result', ({ index, card }) => {
      const fullCard = { rank: card.rank, suit: card.suit, value: card.value, faceUp: true, hidden: false };
      setTransientReveal({ type: 'own', index, card: fullCard });
      setPower(null);
      setMessage('');
      setTimeout(() => setTransientReveal(null), 3000);
    });

    socket.on('match_penalty', () => {
      flashMessage('Wrong match! Cards returned, penalty card added.');
      setMatchRefs([]);
      setMatchMode(false);
    });

    socket.on('error', (msg) => flashMessage(`Error: ${msg}`, 3000));

    return () => {
      socket.off('peek_result');
      socket.off('reveal_peek');
      socket.off('drawn_card');
      socket.off('power_available');
      socket.off('peek_own_result');
      socket.off('peek_other_result');
      socket.off('swap_look_result');
      socket.off('match_penalty');
      socket.off('error');
    };
  }, [gameState]);

  // ---- PEEK PHASE ----
  function handlePeekSelect(index) {
    const half = gameState.cardCount / 2;
    if (peekPhaseSelections.includes(index)) {
      setPeekPhaseSelections(peekPhaseSelections.filter(i => i !== index));
    } else if (peekPhaseSelections.length < half) {
      const next = [...peekPhaseSelections, index];
      setPeekPhaseSelections(next);
      if (next.length === half) {
        socket.emit('peek_cards', { roomCode, cardIndices: next });
      }
    }
  }

  // ---- DRAWING ----
  function handleDraw() {
    if (!isMyTurn || drawnCard) return;
    socket.emit('draw_card', { roomCode });
  }

  function handleSwapIntoHand(handIndex) {
    if (!drawnCard) return;
    socket.emit('swap_drawn_card', { roomCode, handIndex, drawnCard });
    setDrawnCard(null);
    setSelectedIndex(null);
    setMessage('');
  }

  function handleDiscardDrawn() {
    if (!drawnCard) return;
    socket.emit('discard_drawn_card', { roomCode, drawnCard });
    setDrawnCard(null);
  }

  // ---- POWERS ----
  function handlePowerCardClick(handIndex) {
    if (power === 'peek-own') {
      socket.emit('peek_own', { roomCode, handIndex });
      setPower(null);
    } else if (power === 'swap-blind' || power === 'swap-look') {
      setSelectedIndex(handIndex);
    }
  }

  function handlePowerOpponentClick(targetPlayerId, handIndex) {
    if (power === 'peek-other') {
      socket.emit('peek_other', { roomCode, targetPlayerId, handIndex });
      setPower(null);
      setMessage('');
    } else if (power === 'swap-blind') {
      socket.emit('swap_blind', { roomCode, myIndex: selectedIndex, targetPlayerId, theirIndex: handIndex });
      setSelectedIndex(null);
      setPower(null);
      setMessage('');
    } else if (power === 'swap-look') {
      socket.emit('swap_and_look', { roomCode, myIndex: selectedIndex, targetPlayerId, theirIndex: handIndex });
      setSelectedIndex(null);
      setPower(null);
      setMessage('');
    }
  }

  function handleSkipPower() {
    socket.emit('skip_power', { roomCode });
    setPower(null);
    setMessage('');
  }

  // ---- MATCHING ----
  // BUG1: toggleMatchRef now works for both own and opponent cards
  // Hand component receives an array for selectedIndex in match mode
  function toggleMatchRef(playerId, handIndex) {
    const exists = matchRefs.findIndex(r => r.playerId === playerId && r.handIndex === handIndex);
    if (exists >= 0) {
      setMatchRefs(matchRefs.filter((_, i) => i !== exists));
    } else {
      setMatchRefs([...matchRefs, { playerId, handIndex }]);
    }
  }

  function submitMatch() {
    socket.emit('attempt_match', { roomCode, cardRefs: matchRefs });
    setMatchRefs([]);
    setMatchMode(false);
  }

  // ---- KNOCKING ----
  function handleKnock() {
    socket.emit('knock', { roomCode });
  }

  // ---- build display hands with transient reveals overlaid ----
  // BUG4: if we have a transient reveal for own card, show it face up temporarily
  function buildMyHand() {
    return (me?.hand || []).map((card, i) => {
      if (transientReveal?.type === 'own' && transientReveal.index === i) {
        return transientReveal.card;
      }
      return card;
    });
  }

  function buildOpponentHand(opp) {
    return opp.hand.map((card, i) => {
      if (
        transientReveal?.type === 'other' &&
        transientReveal.targetPlayerId === opp.id &&
        transientReveal.index === i
      ) {
        return transientReveal.card;
      }
      return card;
    });
  }

  // ---- ENDED PHASE ----
  if (gameState.phase === 'ended') {
    const winner = gameState.players.find(p => p.id === gameState.winner);
    return (
      <div style={fullScreenStyle}>
        <div style={{ ...panelStyle, maxWidth: 700 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <h2 style={titleStyle}>{winner?.name} wins!</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16, width: '100%' }}>
            {gameState.players.map(p => {
              const sum = p.hand.reduce((t, c) => t + (c.value || 0), 0);
              const isWinner = p.id === gameState.winner;
              return (
                <div key={p.id} style={{
                  background: isWinner ? '#f0c04011' : '#ffffff08',
                  borderRadius: 12,
                  border: isWinner ? '1px solid #f0c040' : '1px solid #ffffff11',
                  padding: '14px 18px',
                }}>
                  {/* player name + score */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 12,
                  }}>
                    <span style={{
                      fontFamily: "'Playfair Display', serif",
                      color: isWinner ? '#f0c040' : '#fffef5',
                      fontSize: 18,
                    }}>
                      {isWinner ? '🏆 ' : ''}{p.name}
                    </span>
                    <span style={{ color: '#b8a96a', fontSize: 15 }}>
                      {sum} pts · {p.hand.length} cards
                    </span>
                  </div>

                  {/* their cards laid out */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.hand.map((card, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <Card card={{ ...card, faceUp: true }} small />
                        <span style={{ fontSize: 10, color: '#ffffff55' }}>{card.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
}

  // ---- PEEK / REVEALING PHASE ----
  if (gameState.phase === 'peek' || gameState.phase === 'revealing') {
    const half = gameState.cardCount / 2;
    const done = peekPhaseSelections.length === half;
    const isRevealing = gameState.phase === 'revealing';

    const displayHand = (me?.hand || []).map((card, i) => {
      if (revealedPeekCards[i]) return revealedPeekCards[i];
      return card;
    });

    return (
      <div style={fullScreenStyle}>
        <div style={panelStyle}>
          <h2 style={titleStyle}>
            {isRevealing ? 'Memorize your cards!' : 'Peek at your cards'}
          </h2>
          <p style={subtitleStyle}>
            {isRevealing && revealCountdown > 0
              ? `Cards hiding in ${revealCountdown}...`
              : isRevealing
              ? 'Waiting...'
              : done
              ? 'Waiting for other players...'
              : `Choose ${half} cards to peek at`}
          </p>
          <Hand
            cards={displayHand}
            onCardClick={!done && !isRevealing ? handlePeekSelect : undefined}
            selectedIndex={peekPhaseSelections}
            disabled={done || isRevealing}
          />
          {isRevealing && revealCountdown > 0 && (
            <div style={{
              marginTop: 8, background: '#f0c04022', border: '1px solid #f0c04066',
              borderRadius: 10, padding: '10px 24px', color: '#f0c040', fontSize: 15,
            }}>
              ⏳ {revealCountdown} second{revealCountdown !== 1 ? 's' : ''} remaining
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- MAIN GAME ----
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 50%, #1a3a2a 0%, #0d1f15 70%, #070d0a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 16px', gap: 24, fontFamily: "'Crimson Text', serif",
      boxSizing: 'border-box',
    }}>

      {/* header */}
      <div style={{
        width: '100%', maxWidth: 900, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: "'Playfair Display', serif", color: '#b8a96a', fontSize: 22 }}>
          Ching Chong
        </span>
        <span style={{
          background: '#ffffff0a', border: '1px solid #b8a96a33',
          borderRadius: 8, padding: '4px 14px', color: '#b8a96a', fontSize: 14, letterSpacing: 2,
        }}>
          {roomCode}
        </span>
        <span style={{ color: isMyTurn ? '#f0c040' : '#ffffff44', fontSize: 14 }}>
          {isMyTurn ? '⟡ Your turn' : `${gameState.players[gameState.currentTurn]?.name}'s turn`}
        </span>
      </div>

      {/* opponents — BUG1: selectedIndex is now an array for match mode */}
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        {opponents.map(opp => (
          <Hand
            key={opp.id}
            cards={buildOpponentHand(opp)}
            small
            label={opp.name}
            onCardClick={
              (power === 'peek-other' || power === 'swap-blind' || power === 'swap-look' || matchMode)
                ? (i) => {
                    if (matchMode) toggleMatchRef(opp.id, i);
                    else handlePowerOpponentClick(opp.id, i);
                  }
                : undefined
            }
            selectedIndices={matchRefs.filter(r => r.playerId === opp.id).map(r => r.handIndex)}
          />
        ))}
      </div>

      {/* center table */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 32,
        background: '#ffffff08', borderRadius: 16,
        border: '1px solid #b8a96a22', padding: '20px 40px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#b8a96a', fontSize: 13, letterSpacing: 1 }}>DRAW</span>
          <div
            onClick={isMyTurn && !drawnCard && !power ? handleDraw : undefined}
            style={{ cursor: isMyTurn && !drawnCard && !power ? 'pointer' : 'default' }}
          >
            <Card card={{ faceUp: false }} />
          </div>
          <span style={{ color: '#ffffff33', fontSize: 12 }}>{gameState.deck?.length} left</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#b8a96a', fontSize: 13, letterSpacing: 1 }}>DISCARD</span>
          {topDiscard
            ? <Card card={topDiscard} />
            : <div style={{
                width: 72, height: 100, borderRadius: 8,
                border: '2px dashed #b8a96a33',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#b8a96a33', fontSize: 24,
              }}>+</div>
          }
        </div>

        {drawnCard && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#f0c040', fontSize: 13, letterSpacing: 1 }}>DRAWN</span>
            <Card card={drawnCard} />
            <button onClick={handleDiscardDrawn} style={smallBtnStyle}>Discard</button>
          </div>
        )}
      </div>

      {/* status message — BUG5: all messages auto-clear via flashMessage() */}
      {message && (
        <div style={{
          background: '#f0c04022', border: '1px solid #f0c04066',
          borderRadius: 10, padding: '10px 24px',
          color: '#f0c040', fontSize: 15, textAlign: 'center', maxWidth: 500,
        }}>
          {message}
        </div>
      )}

      {/* transient reveal indicator */}
      {transientReveal && (
        <div style={{
          background: '#1a3a2a', border: '1px solid #b8a96a44',
          borderRadius: 10, padding: '8px 20px',
          color: '#b8a96a', fontSize: 13, textAlign: 'center',
        }}>
          {transientReveal.type === 'own'
            ? `👁 Peeking at your card ${transientReveal.index + 1} — hiding in 3s`
            : `👁 Peeking at opponent's card — hiding in 3s`}
        </div>
      )}

      {/* my hand — BUG1: selectedIndices array for match mode, single for others */}
      <div style={{ marginTop: 'auto', width: '100%', maxWidth: 900 }}>
        <Hand
          cards={buildMyHand()}
          onCardClick={(i) => {
            if (drawnCard) handleSwapIntoHand(i);
            else if (power === 'peek-own' || power === 'swap-blind' || power === 'swap-look') handlePowerCardClick(i);
            else if (matchMode) toggleMatchRef(myId, i);
            else setSelectedIndex(selectedIndex === i ? null : i);
          }}
          selectedIndices={
            matchMode
              ? matchRefs.filter(r => r.playerId === myId).map(r => r.handIndex)
              : selectedIndex !== null ? [selectedIndex] : []
          }
          label="Your hand"
        />
      </div>

      {/* action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {isMyTurn && !drawnCard && !power && (
          <button onClick={handleKnock} style={actionBtnStyle('#c0392b')}>
            Knock 🤜
          </button>
        )}
        {!power && !drawnCard && (
          <button
            onClick={() => { setMatchMode(!matchMode); setMatchRefs([]); }}
            style={actionBtnStyle(matchMode ? '#7a6a20' : '#2c3e50')}
          >
            {matchMode ? 'Cancel Match' : 'Match Card'}
          </button>
        )}
        {matchMode && matchRefs.length > 0 && (
          <button onClick={submitMatch} style={actionBtnStyle('#1a5c2a')}>
            Submit Match ({matchRefs.length} cards)
          </button>
        )}
        {power && (
          <button onClick={handleSkipPower} style={actionBtnStyle('#2c3e50')}>
            Skip Power
          </button>
        )}
      </div>

      {gameState.phase === 'knocked' && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#c0392b', borderRadius: 10, padding: '8px 24px',
          color: '#fff', fontFamily: "'Playfair Display', serif", fontSize: 15,
          boxShadow: '0 4px 20px #c0392b88',
        }}>
          {gameState.players.find(p => p.id === gameState.knockedBy)?.name} knocked — last round!
        </div>
      )}
    </div>
  );
}

function suitSymbol(suit) {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit?.toLowerCase()] || '';
}

function powerMessage(power) {
  if (power === 'peek-own')   return 'Power: Click one of your own cards to peek';
  if (power === 'peek-other') return "Power: Click an opponent's card to peek";
  if (power === 'swap-blind') return 'Power: Click your card, then an opponent\'s to swap';
  if (power === 'swap-look')  return 'Power: Click your card, then an opponent\'s to swap (you\'ll see your new card)';
  return '';
}

const fullScreenStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'radial-gradient(ellipse at 60% 40%, #1a3a2a 0%, #0d1f15 60%, #070d0a 100%)',
};

const panelStyle = {
  background: '#ffffff0a', borderRadius: 16, border: '1px solid #b8a96a33',
  padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
  maxWidth: 500, width: '90%',
};

const titleStyle = {
  fontFamily: "'Playfair Display', serif", color: '#fffef5', margin: 0, fontSize: 28,
};

const subtitleStyle = {
  color: '#b8a96a99', fontSize: 16, margin: 0, textAlign: 'center',
};

function actionBtnStyle(bg) {
  return {
    padding: '10px 22px', borderRadius: 8, border: 'none',
    background: bg, color: '#fffef5', fontSize: 15, cursor: 'pointer',
    fontFamily: "'Crimson Text', serif", letterSpacing: 0.5,
  };
}

const smallBtnStyle = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid #b8a96a44',
  background: 'transparent', color: '#b8a96a', fontSize: 13, cursor: 'pointer',
  fontFamily: "'Crimson Text', serif",
};
