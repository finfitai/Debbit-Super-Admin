import React from 'react'

export const aiUsageStyles: Record<string, React.CSSProperties> = {
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  subtitle: { color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' },
  cardLabel: { color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' },
  cardValue: { color: 'var(--text-primary)', fontSize: '22px', fontWeight: 800 },
  panel: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px' },
  panelTitle: { color: 'var(--text-primary)', fontWeight: 700, marginBottom: '12px' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
}
