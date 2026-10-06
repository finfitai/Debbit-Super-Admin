import React, { Component, ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { isMissingConfig, envUrl, envAnonKey } from './lib/supabase'

// Atomic Templates
import MainLayout from './components/templates/MainLayout/MainLayout'

// Pages
import Login from './pages/Login/Login'
import Dashboard from './pages/Dashboard/Dashboard'
import Businesses from './pages/Businesses/Businesses'
import BusinessDetail from './pages/BusinessDetail/BusinessDetail'
import Users from './pages/Users/Users'
import Telemetry from './pages/Telemetry/Telemetry'
import SyncHealth from './pages/SyncHealth/SyncHealth'
import Billing from './pages/Billing/Billing'
import Admins from './pages/Admins/Admins'

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' }
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '14px', padding: '40px', maxWidth: '480px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ color: '#ef4444', fontSize: '18px', marginBottom: '8px' }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>{this.state.message}</p>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Missing Config Banner ───────────────────────────────────────────────────

function MissingConfigBanner() {
  const currentUrl = envUrl || 'https://your-project.supabase.co'
  const currentKey = envAnonKey || 'your-anon-key-starting-with-eyJ'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '14px', padding: '40px', maxWidth: '580px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔧</div>
        <h2 style={{ color: '#f59e0b', fontSize: '20px', marginBottom: '8px' }}>Supabase Environment Variables Required</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.7, marginBottom: '16px' }}>
          Please configure your <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '4px', color: 'var(--purple-main)' }}>.env.local</code> file in the project root:
        </p>
        <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'left', fontSize: '12px', color: 'var(--cyan)', overflowX: 'auto', marginBottom: '16px' }}>
{`VITE_SUPABASE_URL=${currentUrl}
VITE_SUPABASE_ANON_KEY=${currentKey}`}
        </pre>
      </div>
    </div>
  )
}

// ─── Protected Layout (Atomic MainLayout Wrapper) ─────────────────────────────

function ProtectedLayout() {
  const { session, isSuperAdmin, checking } = useAuth()

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Verifying super-admin credentials…</p>
      </div>
    )
  }

  if (!session || !isSuperAdmin) {
    return <Navigate to="/login" replace />
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/"               element={<Dashboard />} />
        <Route path="/businesses"     element={<Businesses />} />
        <Route path="/businesses/:id" element={<BusinessDetail />} />
        <Route path="/users"          element={<Users />} />
        <Route path="/telemetry"      element={<Telemetry />} />
        <Route path="/sync"           element={<SyncHealth />} />
        <Route path="/billing"        element={<Billing />} />
        <Route path="/admins"         element={<Admins />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const { session, isSuperAdmin, checking } = useAuth()

  if (isMissingConfig) return <MissingConfigBanner />

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              !checking && session && isSuperAdmin
                ? <Navigate to="/" replace />
                : <Login />
            }
          />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
