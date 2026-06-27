'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { getAllowedAdminEmailClient } from '../../lib/admin-access'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password,     setPassword]     = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [status,       setStatus]       = React.useState('')
  const [statusType,   setStatusType]   = React.useState<'error' | 'success'>('error')
  const [isBusy,       setIsBusy]       = React.useState(false)

  const allowedAdminEmail = getAllowedAdminEmailClient()

  // If already authenticated, skip the login form entirely
  React.useEffect(() => {
    async function checkSession() {
      try {
        const { createSupabaseBrowserClient } = await import('../../lib/supabase/client')
        const supabase = createSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email?.toLowerCase() === allowedAdminEmail) {
          router.replace('/admin/dashboard')
        }
      } catch { /* no-op */ }
    }
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const authError = params.get('authError')
    if (authError === 'session')      setStatus('Login succeeded in the browser, but the server could not verify the session. Restart the dev server and try again.')
    if (authError === 'missing')      setStatus('Your admin session has expired. Log in again.')
    if (authError === 'unauthorized') setStatus('This account is not authorised for admin access.')
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
          ? 'Could not submit the login request. Check your network connection and try again.'
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
      setStatus(`Password reset email sent to ${allowedAdminEmail}. Check your inbox.`)
      setStatusType('success')
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : 'Could not send reset email.')
      setStatusType('error')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">

        <a
          href="/"
          className="inline-flex items-center gap-[6px] text-[12px] font-medium text-[#8b8a81] mb-7 hover:text-[#1a1a18] transition-colors"
        >
          ← Back to website
        </a>

        <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.05)]">

          {/* Card header */}
          <div className="px-7 py-5 border-b border-[#edf4eb] bg-[#f5f8f4]">
            <img
              src="/images/horizontal-pcd-logo.png"
              alt="Perth Cabinet Doors"
              className="w-[min(190px,55vw)] h-auto block mb-4"
            />
            <h1 className="text-[16px] font-semibold text-[#1a1a18] leading-snug mb-[3px]">
              Staff sign in
            </h1>
            <p className="text-[12px] text-[#5a5a52]">
              Admin access for the PCD team.
            </p>
          </div>

          {/* Card body */}
          <div className="px-7 py-6">
            <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-[6px]">
                <label htmlFor="password" className="text-[12px] font-semibold text-[#1a1a18]">
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
                    className="flex-1 h-[40px] border border-[#dbd8cc] rounded-l-[6px] bg-white text-[#1a1a18] px-3 text-[13px] outline-none focus:border-[#6b9e61] focus:shadow-[0_0_0_3px_rgba(107,158,97,0.12)] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="min-w-[40px] h-[40px] border border-l-0 border-[#dbd8cc] rounded-r-[6px] bg-white text-[#6b9e61] flex items-center justify-center hover:bg-[#f5f8f4] transition-colors"
                  >
                    {showPassword ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="h-[40px] rounded-[6px] bg-[#1c2b1e] text-white text-[13px] font-semibold cursor-pointer hover:bg-[#2d3f2f] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isBusy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#edf4eb]">
              <span className="text-[12px] text-[#8b8a81]">Admin access only</span>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isBusy}
                className="text-[12px] font-medium text-[#6b9e61] hover:text-[#2d5e28] transition-colors disabled:opacity-60"
              >
                Forgot password?
              </button>
            </div>

            {status && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-4 px-3 py-[10px] rounded-[6px] text-[13px] leading-relaxed border ${
                  statusType === 'success'
                    ? 'bg-[#edf4eb] border-[#a8c5a0] text-[#2d5e28]'
                    : 'bg-[#fff8df] border-[#dcbf55] text-[#5c4200]'
                }`}
              >
                {status}
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-[#c5cdd8] text-center mt-5">
          Accounts are managed by administrators only.
        </p>
      </div>
    </main>
  )
}
