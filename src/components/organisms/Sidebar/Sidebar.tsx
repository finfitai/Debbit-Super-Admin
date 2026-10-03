import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { sidebarStyles } from './Sidebar.styles'

interface NavItem {
  to: string
  label: string
  subtitle: string
  icon: string
  badge?: string
  badgeColor?: string
}

const NAV: NavItem[] = [
  { to: '/',            label: 'Today',       subtitle: 'Platform at a glance', icon: '🏠' },
  { to: '/businesses',  label: 'Businesses',  subtitle: 'Tenant accounts',      icon: '🏢', badgeColor: 'badge-green' },
  { to: '/users',       label: 'Users',       subtitle: 'Registered accounts',   icon: '👥' },
  { to: '/telemetry',   label: 'Telemetry',   subtitle: 'Error & crash logs',    icon: '📡' },
  { to: '/sync',        label: 'Sync Health', subtitle: 'Workstations & POS',   icon: '🔄' },
  { to: '/billing',     label: 'Billing',     subtitle: 'Subscriptions & MRR',  icon: '💳' },
  { to: '/ai',          label: 'AI Usage',    subtitle: 'Metering & controls',  icon: '🤖' },
]

export default function Sidebar() {
  const [businessCount, setBusinessCount] = useState<number | null>(null)
  const [userCount, setUserCount] = useState<number | null>(null)

  useEffect(() => {
    async function fetchCounts() {
      const [bizRes, userRes] = await Promise.all([
        supabase.from('businesses').select('id', { count: 'exact', head: true }),
        supabase.from('business_members').select('id', { count: 'exact', head: true }),
      ])
      if (!bizRes.error && bizRes.count !== null) {
        setBusinessCount(bizRes.count)
      }
      if (!userRes.error && userRes.count !== null) {
        setUserCount(userRes.count)
      }
    }
    fetchCounts()
  }, [])

  const navWithBadges = NAV.map(item => {
    if (item.to === '/businesses') {
      return { ...item, badge: businessCount !== null ? `${businessCount} active` : '…' }
    }
    if (item.to === '/users') {
      return { ...item, badge: userCount !== null ? String(userCount) : '…' }
    }
    return item
  })

  return (
    <nav style={sidebarStyles.sidebar}>
      <div style={sidebarStyles.navArea}>
        <div style={sidebarStyles.sectionLabel}>YOU RUN THE PLATFORM</div>

        {navWithBadges.map(({ to, label, subtitle, icon, badge, badgeColor }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              ...sidebarStyles.link,
              background: isActive ? 'var(--purple-bg)' : 'transparent',
              color:      isActive ? 'var(--purple-main)' : 'var(--text-primary)',
              fontWeight: isActive ? 700 : 500,
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                {/* Active Indicator Bar on Far Left */}
                {isActive && <span style={sidebarStyles.activePill} />}

                <span style={sidebarStyles.linkIcon}>{icon}</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '13px', lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }} className="truncate">
                    {subtitle}
                  </div>
                </div>
                {badge && (
                  <span className={`badge ${badgeColor || 'badge-purple'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer Promo Card */}
      <div style={sidebarStyles.footer}>
        <div style={sidebarStyles.promoCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f472b6', display: 'inline-block' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f4e8fb' }}>debbit balances the books</span>
          </div>
          <p style={{ fontSize: '11px', color: '#d8b4fe', lineHeight: 1.4 }}>
            Money, tax & ledger post themselves in the background automatically.
          </p>
        </div>
      </div>
    </nav>
  )
}
