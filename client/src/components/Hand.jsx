import Card from './Card';

// BUG1 FIX: now accepts selectedIndices (array) instead of selectedIndex (single number)
// This lets multiple cards glow/lift at once during match mode
export default function Hand({ cards, onCardClick, selectedIndices = [], disabled, small, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {label && (
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: small ? 13 : 15,
          color: '#b8a96a',
          letterSpacing: 1,
        }}>
          {label}
        </span>
      )}
      <div style={{ display: 'flex', gap: small ? 4 : 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map((card, i) => (
          <Card
            key={i}
            card={card}
            onClick={() => onCardClick && onCardClick(i)}
            selected={selectedIndices.includes(i)}
            disabled={disabled}
            small={small}
          />
        ))}
      </div>
      <span style={{ fontSize: 12, color: '#ffffff44', fontFamily: "'Crimson Text', serif" }}>
        {cards.length} card{cards.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
