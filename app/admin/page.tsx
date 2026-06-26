'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowLeft, IconEye, IconEyeOff } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { getAllowedAdminEmailClient } from '../../lib/admin-access'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password,     setPassword]     = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [status,       setStatus]       = React.useState('')
  const [statusType,   setStatusType]   = React.useState<'error' | 'success' | 'info'>('error')
  const [isBusy,       setIsBusy]       = React.useState(false)

  const allowedAdminEmail = getAllowedAdminEmailClient()

  React.useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const authError = params.get('authError')
    if (authError === 'session')      setStatus('Login succeeded in the browser, but the server could not verify the session. Restart the dev server and try again.')
    if (authError === 'missing')      setStatus('Your admin session has expired. Log in again.')
    if (authError === 'unauthorized') setStatus('This account is not authorized for admin access.')
    if (authError) window.history.replaceState({}, '', '/admin')
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setStatus('')
    if (!password) { setStatus('Enter your admin password.'); return }
    setIsBusy(true)
    try {
      const res     = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.ok) {
        setStatus(payload.error || 'Login failed. Please try again.')
        setStatusType('error')
        return
      }
      router.push('/admin/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setStatus(
        msg === 'Failed to fetch'
          ? 'Could not submit the login request. Check the network connection and try again.'
          : msg || 'Login failed. Please check the site configuration and try again.'
      )
      setStatusType('error')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleForgotPassword() {
    setStatus('')
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setStatus('Password reset is not configured. Supabase environment variables are missing.')
      setStatusType('error')
      return
    }
    setIsBusy(true)
    try {
      const { createSupabaseBrowserClient } = await import('../../lib/supabase/client')
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.resetPasswordForEmail(allowedAdminEmail, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      })
      if (error) {
        setStatus(error.message || 'Could not send reset email.')
        setStatusType('error')
        return
      }
      setStatus('Password reset email sent. Check your inbox.')
      setStatusType('success')
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : 'Could not send reset email.')
      setStatusType('error')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f0ede4]">
      <div className="grid min-h-screen md:grid-cols-[minmax(420px,0.78fr)_minmax(0,1.22fr)]">

        {/* ── Form panel ── */}
        <div className="flex flex-col justify-center px-6 py-10 md:px-[clamp(36px,7vw,92px)] bg-[#f8f4ef]">

          <a
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#5a5a52] mb-10 w-fit hover:text-[#1a1a18] transition-colors"
          >
            <IconArrowLeft size={14} />
            Back to website
          </a>

          <img
            src="/images/horizontal-pcd-logo.png"
            alt="Perth Cabinet Doors"
            className="w-[min(245px,68vw)] h-auto block mb-5"
          />

          <h1 className="text-[clamp(24px,2.6vw,36px)] font-normal text-[#1a1a18] leading-[1.12] mb-3">
            Secure access for the PCD team.
          </h1>
          <p className="text-[15px] text-[#5a5a52] leading-relaxed mb-6 max-w-[620px]">
            Sign in to manage products, quote requests, enquiries, quotes and orders.
          </p>

          <form onSubmit={handleLogin} noValidate className="flex flex-col gap-3 mt-2">
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="password" className="text-[12px] font-semibold text-[#1c2b1e]">
                Password
              </label>
              <div className="flex">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="flex-1 h-[52px] border border-[#dbd8cc] rounded-l-[4px] bg-white text-[#1a1a18] px-4 text-[15px] outline-none focus:border-[#6b9e61] focus:shadow-[0_0_0_3px_rgba(107,158,97,0.16)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="min-w-[52px] h-[52px] border border-l-0 border-[#dbd8cc] rounded-r-[4px] bg-white text-[#6b9e61] flex items-center justify-center hover:bg-[#edf4eb] transition-colors"
                >
                  {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[13px] text-[#5a5a52]">
              <span>Accounts are created by administrators only.</span>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isBusy}
                className="text-[13px] font-semibold text-[#6b9e61] hover:text-[#2d5e28] transition-colors text-left sm:text-right disabled:opacity-60 w-fit"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="h-[54px] rounded-[4px] bg-[#1c2b1e] border border-[#1c2b1e] text-[#f0ede4] text-[15px] font-semibold cursor-pointer hover:bg-[#16211a] transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_16px_30px_rgba(28,43,30,0.18)]"
            >
              {isBusy ? 'Please wait...' : 'Log in'}
            </button>
          </form>

          {status && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-4 px-4 py-3 rounded-[4px] text-[14px] leading-relaxed border ${
                statusType === 'success'
                  ? 'bg-[#edf4eb] border-[#a8c5a0] text-[#2d5e28]'
                  : 'bg-[#fff8df] border-[#dcbf55] text-[#5c4200]'
              }`}
            >
              {status}
            </div>
          )}
        </div>

        {/* ── Visual panel — desktop only ── */}
        <aside
          className="hidden md:flex items-center justify-center overflow-hidden relative"
          style={{
            background: 'linear-gradient(120deg, rgba(12,17,11,0.93), rgba(36,46,28,0.9)), url("/images/kitchen-detail-landscape.jpg") center / cover',
          }}
        >
          <div
            className="absolute w-[760px] h-[760px] rounded-full pointer-events-none"
            style={{
              right: '-170px', top: '-120px',
              border: '1px solid rgba(232,217,167,0.24)',
              boxShadow: 'inset 0 0 60px rgba(236,209,128,0.18)',
            }}
          />
          <div
            className="absolute w-[520px] h-[520px] rounded-full pointer-events-none"
            style={{
              bottom: '-180px', left: '16%',
              border: '1px solid rgba(232,217,167,0.24)',
              boxShadow: 'inset 0 0 44px rgba(236,209,128,0.12)',
            }}
          />
          <div
            className="relative z-10 rounded-full"
            style={{
              width: 'min(420px, 42vw)',
              aspectRatio: '1 / 1',
              border: '1px solid rgba(248,244,234,0.18)',
              background: 'rgba(248,244,234,0.04)',
              boxShadow: 'inset 0 0 80px rgba(236,209,128,0.08), 0 30px 80px rgba(0,0,0,0.22)',
            }}
            aria-hidden="true"
          />
        </aside>
      </div>
    </main>
  )
}
