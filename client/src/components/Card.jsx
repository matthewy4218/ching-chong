// A single playing card.
// Props:
//   card      — the card object { rank, suit, faceUp, hidden }
//   onClick   — called when the card is clicked
//   selected  — whether this card is currently selected (highlights it)
//   disabled  — whether this card can be clicked
//   small     — renders a smaller version for opponent hands

const SUIT_SYMBOLS = {
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
  spades:   '♠',
};

// hearts and diamonds are red, clubs and spades are black
const SUIT_COLORS = {
  hearts:   '#c0392b',
  diamonds: '#c0392b',
  clubs:    '#1a1a2e',
  spades:   '#1a1a2e',
};

export default function Card({ card, onClick, selected, disabled, small }) {
  // --- FACE DOWN CARD ---
  // If hidden or not faceUp, show the card back
  if (!card || !card.faceUp || card.hidden) {
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        style={{
          width:        small ? 44 : 72,
          height:       small ? 64 : 100,
          borderRadius: 8,
          cursor:       disabled ? 'default' : 'pointer',
          border:       selected ? '2.5px solid #f0c040' : '2px solid #b8a96a',
          boxShadow:    selected
            ? '0 0 0 3px #f0c04066, 0 4px 16px #0006'
            : '0 4px 12px #0005',
          background:   `
            repeating-linear-gradient(
              45deg,
              #1a3a2a 0px, #1a3a2a 4px,
              #1e4030 4px, #1e4030 8px
            )
          `,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          transition:     'transform 0.15s, box-shadow 0.15s',
          transform:      selected ? 'translateY(-8px)' : 'none',
          flexShrink:     0,
        }}
      >
        {/* decorative diamond pattern in center of card back */}
        <div style={{
          width:       small ? 28 : 44,
          height:      small ? 40 : 64,
          border:      '1.5px solid #b8a96a55',
          borderRadius: 4,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          fontSize:     small ? 14 : 22,
          color:        '#b8a96a55',
        }}>
          ◆
        </div>
      </div>
    );
  }

  // --- FACE UP CARD ---
const symbol = SUIT_SYMBOLS[card.suit?.toLowerCase()];
const color  = SUIT_COLORS[card.suit?.toLowerCase()];

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{
        width:        small ? 44 : 72,
        height:       small ? 64 : 100,
        borderRadius: 8,
        cursor:       disabled ? 'default' : 'pointer',
        background:   '#fffef5',
        border:       selected ? '2.5px solid #f0c040' : '2px solid #d4c9a0',
        boxShadow:    selected
          ? '0 0 0 3px #f0c04066, 0 4px 16px #0006'
          : '0 4px 12px #0005',
        display:      'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding:      small ? '3px 4px' : '5px 7px',
        transition:   'transform 0.15s, box-shadow 0.15s',
        transform:    selected ? 'translateY(-8px)' : 'none',
        flexShrink:   0,
        position:     'relative',
        userSelect:   'none',
      }}
    >
      {/* top-left rank + suit */}
      <div style={{
        display:    'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        lineHeight: 1,
      }}>
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontSize:   small ? 11 : 17,
          fontWeight: 700,
          color,
        }}>
          {card.rank}
        </span>
        <span style={{ fontSize: small ? 9 : 13, color }}>
          {symbol}
        </span>
      </div>

      {/* center suit symbol */}
      <div style={{
        position:       'absolute',
        top: '50%', left: '50%',
        transform:      'translate(-50%, -50%)',
        fontSize:       small ? 20 : 32,
        color,
        opacity:        0.15,
        pointerEvents:  'none',
      }}>
        {symbol}
      </div>

      {/* bottom-right rank + suit (upside down) */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'flex-end',
        lineHeight:     1,
        transform:      'rotate(180deg)',
      }}>
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontSize:   small ? 11 : 17,
          fontWeight: 700,
          color,
        }}>
          {card.rank}
        </span>
        <span style={{ fontSize: small ? 9 : 13, color }}>
          {symbol}
        </span>
      </div>
    </div>
  );
}