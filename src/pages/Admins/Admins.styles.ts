import React from 'react'

export const adminsStyles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    marginTop: '4px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.4fr',
    gap: '18px',
    alignItems: 'start',
  },
  formCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '24px',
  },
  formTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '16px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: '10px 14px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    outline: 'none',
  },
}
