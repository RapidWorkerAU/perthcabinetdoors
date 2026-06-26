'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { createSupabaseBrowserClient } from '../../../lib/supabase/client'

export default function AdminResetPasswordPage() {
  const router = useRouter()
  const [password,            setPassword]            = React.useState('')
  const [confirmPassword,     setConfirmPassword]     = React.useState('')
  const [showPassword,        setShowPassword]        = React.useState(false)
  const [status,              setStatus]              = React.useState('')
  const [statusType,          setStatusType]          = React.useState<'error' | 'success'>('error')
  const [isBusy,              setIsBusy]              = React.useState(false)
  const [hasRecoverySession,  setHasRecoverySession]  = React.useState(false)

  React.useEffect(() => {
    async function initRecoverySession() {
      const supabase    = createSupabaseBrowserClient()
      const hash        = window.location.hash || ''
      const hashParams  = new URLSearchParams(hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken= hashParams.get('refresh_token')
      const type        = hashParams.get('type')

      if (type === 'recovery' && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) { setStatus('Reset link is invalid or expired. Request a new reset email.'); return }
        setHasRecoverySession(true)
        window.history.replaceState({}, '', '/admin/reset-password')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setHasRecoverySession(true)
      } else {
        setStatus('Reset link is invalid or expired. Request a new reset email.')
      }
    }
    initRecoverySession()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('')
    if (!hasRecoverySession) { setStatus('Reset link is invalid or expired. Request a new reset email.'); return }
    if (password.length < 8)  { setStatus('Password must be at least 8 characters.'); setStatusType('error'); return }
    if (password !== confirmPassword) { setStatus('Passwords do not match.'); setStatusType('error'); return }

    setIsBusy(true)
    try {
      const supabase  = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setStatus(error.message || 'Unable to reset password.'); setStatusType('error'); return }
      setStatus('Password updated. Redirecting to login...')
      setStatusType('success')
      setTimeout(() => { router.push('/admin'); router.refresh() }, 900)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f0ede4] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px] bg-[#f8f4ef] rounded-[8px] border border-[#dbd8cc] px-8 py-10 flex flex-col items-center shadow-[0_16px_30px_rgba(28,43,30,0.08)]">

        <img
          src="/images/horizontal-pcd-logo.png"
          alt="Perth Cabinet Doors"
          className="w-[min(200px,60vw)] h-auto block mb-6"
        />

        <h1 className="text-[28px] font-normal text-[#1a1a18] text-center leading-snug mb-6">
          Reset admin password
        </h1>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="password" className="text-[12px] font-semibold text-[#1c2b1e]">
              New password
            </label>
            <div className="flex">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="flex-1 h-[52px] border border-[#dbd8cc] rounded-l-[4px] bg-white text-[#1a1a18] px-4 text-[15px] outline-none focus:border-[#6b9e61] focus:shadow-[0_0_0_3px_rgba(107,158,97,0.16)] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="min-w-[52px] h-[52px] border border-l-0 border-[#dbd8cc] rounded-r-[4px] bg-white text-[#6b9e61] flex items-center justify-center hover:bg-[#edf4eb] transition-colors"
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-[6px]">
            <label htmlFor="confirmPassword" className="text-[12px] font-semibold text-[#1c2b1e]">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="h-[52px] border border-[#dbd8cc] rounded-[4px] bg-white text-[#1a1a18] px-4 text-[15px] outline-none focus:border-[#6b9e61] focus:shadow-[0_0_0_3px_rgba(107,158,97,0.16)] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isBusy || !hasRecoverySession}
            className="h-[54px] rounded-[4px] bg-[#1c2b1e] border border-[#1c2b1e] text-[#f0ede4] text-[15px] font-semibold cursor-pointer hover:bg-[#16211a] transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_16px_30px_rgba(28,43,30,0.18)] mt-1"
          >
            {isBusy ? 'Saving...' : 'Update password'}
          </button>
        </form>

        {status && (
          <div
            role="status"
            className={`mt-4 w-full px-4 py-3 rounded-[4px] text-[14px] leading-relaxed border ${
              statusType === 'success'
                ? 'bg-[#edf4eb] border-[#a8c5a0] text-[#2d5e28]'
                : 'bg-[#fff8df] border-[#dcbf55] text-[#5c4200]'
            }`}
          >
            {status}
          </div>
        )}

        <a
          href="/admin"
          className="mt-6 text-[13px] font-semibold text-[#6b9e61] hover:text-[#2d5e28] transition-colors"
        >
          Back to login
        </a>
      </div>
    </main>
  )
}
