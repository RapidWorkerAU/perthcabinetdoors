'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createSupabaseBrowserClient } from '../../../lib/supabase/client'
import { getAllowedAdminEmailClient } from '../../../lib/admin-access'
import { DEFAULT_LAUNCH_SETTINGS } from '../../../lib/launch-settings'
import { DEFAULT_BUSINESS_DEFAULTS } from '../../../lib/pcd-quote-utils'
import { cn } from '@/lib/utils'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import launchStyles from './launch-preview.module.css'

interface DefaultField {
  key:        string
  label:      string
  help:       string
  type?:      string
  step?:      string
  min?:       string
  transform?: string
  prefix?:    string
  suffix?:    string
}

const DEFAULTS_FIELDS: DefaultField[] = [
  {
    key:       'currency',
    label:     'Default quote currency',
    help:      'Used for quote totals and customer-facing pricing across the backend.',
    type:      'text',
    transform: 'uppercase',
  },
  {
    key:   'gst_rate',
    label: 'Default GST rate',
    help:  'Used for quote GST calculations unless a quote already has its own stored rate.',
    type:  'number',
    step:  '0.01',
    min:   '0',
  },
  {
    key:    'markup_percent',
    label:  'Default line markup %',
    help:   'Used for new quote item lines. Admin can still edit the markup on each line.',
    suffix: '%',
  },
  {
    key:    'hinge_drilling_unit_cost_ex_gst',
    label:  'Hinge drilling cost ex GST',
    help:   'Cost per hinge hole set used when hinge drilling is required.',
    prefix: '$',
  },
  {
    key:    'hinge_supply_unit_cost_ex_gst',
    label:  'Hinge supply cost ex GST',
    help:   'Cost per supplied hinge used when hinge supply is required.',
    prefix: '$',
  },
  {
    key:    'worker_hourly_rate',
    label:  'Labour hourly rate ex GST',
    help:   'Used as the default worker hourly rate on quotes.',
    prefix: '$',
  },
]

const LAUNCH_TEXT_FIELDS: [string, string, string?][] = [
  ['statusPill', 'Status pill'],
  ['eyebrow', 'Eyebrow'],
  ['headline', 'Headline'],
  ['headlineAccent', 'Headline accent'],
  ['copy', 'Intro copy', 'textarea'],
  ['passwordLabel', 'Password label'],
  ['showPasswordText', 'Show password button'],
  ['hidePasswordText', 'Hide password button'],
  ['submitButtonText', 'Submit button'],
  ['busyButtonText', 'Busy button'],
  ['emptyPasswordMessage', 'Empty password message'],
  ['configMissingMessage', 'Missing config message', 'textarea'],
  ['acceptedButUnsavedMessage', 'Accepted but unsaved message', 'textarea'],
  ['enquiryPromptText', 'Enquiry prompt'],
  ['enquiryButtonText', 'Enquiry button'],
  ['enquiryEyebrow', 'Enquiry modal eyebrow'],
  ['enquiryTitle', 'Enquiry modal title'],
  ['closeButtonText', 'Close button'],
  ['cancelButtonText', 'Cancel button'],
  ['sendButtonText', 'Send button'],
  ['sendingButtonText', 'Sending button'],
  ['enquirySuccessMessage', 'Enquiry success message', 'textarea'],
]

type LaunchSettings = typeof DEFAULT_LAUNCH_SETTINGS & Record<string, unknown>
type Defaults = typeof DEFAULT_BUSINESS_DEFAULTS & Record<string, unknown>

function getPreviewCountdown(liveAt: string) {
  const target      = liveAt ? new Date(liveAt) : new Date(DEFAULT_LAUNCH_SETTINGS.liveAt)
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000))
  return {
    days:    Math.floor(totalSeconds / 86400),
    hours:   Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function LaunchOverlayPreview({
  launchCountdown,
  launchSettings,
}: {
  launchCountdown: ReturnType<typeof getPreviewCountdown>
  launchSettings: LaunchSettings
}) {
  return (
    <main className={launchStyles.page}>
      <section className={launchStyles.panel}>
        <div className={launchStyles.brandRow}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={launchStyles.logo} />
          <span className={launchStyles.statusPill}>{launchSettings.statusPill as string}</span>
        </div>
        <div className={launchStyles.content}>
          <p className={launchStyles.eyebrow}>{launchSettings.eyebrow as string}</p>
          <h1>
            {launchSettings.headline as string} <em>{launchSettings.headlineAccent as string}</em>
          </h1>
          <p className={launchStyles.copy}>{launchSettings.copy as string}</p>
          <div className={launchStyles.countdown} aria-label="Preview countdown">
            <div>
              <strong>{launchCountdown.days}</strong>
              <span>Days</span>
            </div>
            <div>
              <strong>{pad(launchCountdown.hours)}</strong>
              <span>Hours</span>
            </div>
            <div>
              <strong>{pad(launchCountdown.minutes)}</strong>
              <span>Minutes</span>
            </div>
            <div>
              <strong>{pad(launchCountdown.seconds)}</strong>
              <span>Seconds</span>
            </div>
          </div>
          <div className={launchStyles.form}>
            <span className={launchStyles.label}>{launchSettings.passwordLabel as string}</span>
            <div className={launchStyles.passwordRow}>
              <input className={launchStyles.input} type="password" value="preview" readOnly />
              <button type="button" className={launchStyles.toggleButton}>
                {launchSettings.showPasswordText as string}
              </button>
            </div>
            <button type="button" className={launchStyles.submitButton}>
              {launchSettings.submitButtonText as string}
            </button>
          </div>
          <div className={launchStyles.enquiryPrompt}>
            <span>{launchSettings.enquiryPromptText as string}</span>
            <button type="button">{launchSettings.enquiryButtonText as string}</button>
          </div>
        </div>
      </section>
    </main>
  )
}

// Shared input / button class helpers
const inputClass = 'h-[36px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]'
const textareaClass = 'w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-y min-h-[72px]'
const primaryBtn = 'h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors'
const secondaryBtn = 'h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors'
const fieldLabelClass = 'flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]'

type Tab = 'profile' | 'launch' | 'defaults'

export default function AccountSettingsForm({ currentEmail }: { currentEmail?: string }) {
  const [activeTab,        setActiveTab]        = useState<Tab>('profile')
  const [mobileView,       setMobileView]       = useState<'list' | 'detail'>('list')
  const [email,            setEmail]            = useState(currentEmail || '')
  const [newPassword,      setNewPassword]      = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [showPassword,     setShowPassword]     = useState(false)
  const [launchSettings,   setLaunchSettings]   = useState<LaunchSettings>(DEFAULT_LAUNCH_SETTINGS as LaunchSettings)
  const [launchCountdown,  setLaunchCountdown]  = useState(getPreviewCountdown(DEFAULT_LAUNCH_SETTINGS.liveAt))
  const [emailStatus,      setEmailStatus]      = useState('')
  const [passwordStatus,   setPasswordStatus]   = useState('')
  const [launchStatus,     setLaunchStatus]     = useState('')
  const [showLaunchPreview, setShowLaunchPreview] = useState(false)
  const [emailBusy,        setEmailBusy]        = useState(false)
  const [passwordBusy,     setPasswordBusy]     = useState(false)
  const [launchBusy,       setLaunchBusy]       = useState(false)
  const [defaults,         setDefaults]         = useState<Defaults>(DEFAULT_BUSINESS_DEFAULTS as Defaults)
  const [defaultsFeedback, setDefaultsFeedback] = useState('')
  const [defaultsBusy,     setDefaultsBusy]     = useState(false)

  const allowedAdminEmail = useMemo(() => getAllowedAdminEmailClient(), [])
  const accountLabel      = email?.split('@')[0] || 'Admin account'
  const accountInitials   =
    accountLabel
      .split(/[.\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'AD'

  useEffect(() => {
    fetch('/api/admin/launch-settings')
      .then(r => r.json())
      .then(result => {
        if (result?.settings) {
          setLaunchSettings({ ...DEFAULT_LAUNCH_SETTINGS, ...result.settings } as LaunchSettings)
        } else if (result?.error) {
          setLaunchStatus(result.error)
        }
      })
      .catch(err => setLaunchStatus(err?.message || 'Could not load launch settings.'))
  }, [])

  useEffect(() => {
    setLaunchCountdown(getPreviewCountdown(launchSettings.liveAt as string))
    const timer = window.setInterval(() => {
      setLaunchCountdown(getPreviewCountdown(launchSettings.liveAt as string))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [launchSettings.liveAt])

  async function handleEmailUpdate(event: React.FormEvent) {
    event.preventDefault()
    setEmailStatus('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) { setEmailStatus('Enter an email address.'); return }
    if (normalizedEmail !== allowedAdminEmail) {
      setEmailStatus(`Allowed admin email is ${allowedAdminEmail}. Update NEXT_PUBLIC_ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_EMAIL if you want to change it.`)
      return
    }
    setEmailBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser(
        { email: normalizedEmail },
        { emailRedirectTo: `${window.location.origin}/admin/settings` }
      )
      if (error) { setEmailStatus(error.message || 'Could not update email.'); return }
      setEmailStatus('Confirmation email sent. Please confirm the email change from your inbox.')
    } finally {
      setEmailBusy(false)
    }
  }

  async function handlePasswordUpdate(event: React.FormEvent) {
    event.preventDefault()
    setPasswordStatus('')
    if (newPassword.length < 8) { setPasswordStatus('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordStatus('Passwords do not match.'); return }
    setPasswordBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) { setPasswordStatus(error.message || 'Could not update password.'); return }
      setNewPassword('')
      setConfirmPassword('')
      setPasswordStatus('Password updated successfully.')
    } finally {
      setPasswordBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/business-defaults', { cache: 'no-store' })
      .then(r => r.json())
      .then(payload => {
        if (!cancelled && payload.ok) {
          setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults } as Defaults)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function updateDefault(field: string, value: unknown) {
    setDefaults(cur => ({ ...cur, [field]: value }))
  }

  async function handleDefaultsSave(event: React.FormEvent) {
    event.preventDefault()
    setDefaultsFeedback('')
    setDefaultsBusy(true)
    try {
      const res     = await fetch('/api/admin/business-defaults', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ defaults }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.ok) {
        setDefaultsFeedback(payload.error || 'Could not save business defaults.')
        return
      }
      setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults } as Defaults)
      setDefaultsFeedback('Business defaults saved.')
    } catch (err: unknown) {
      setDefaultsFeedback(err instanceof Error ? err.message : 'Could not save business defaults.')
    } finally {
      setDefaultsBusy(false)
    }
  }

  function updateLaunchField(field: string, value: unknown) {
    setLaunchSettings(cur => ({ ...cur, [field]: value }))
  }

  async function handleLaunchSettingsSave(event: React.FormEvent) {
    event.preventDefault()
    setLaunchStatus('')
    setLaunchBusy(true)
    try {
      const res    = await fetch('/api/admin/launch-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ settings: launchSettings }),
      })
      const result = await res.json()
      if (!res.ok || !result.ok) throw new Error(result.error || 'Could not save launch settings.')
      setLaunchSettings({ ...DEFAULT_LAUNCH_SETTINGS, ...result.settings } as LaunchSettings)
      setLaunchStatus('Launch overlay settings saved.')
    } catch (err: unknown) {
      setLaunchStatus(err instanceof Error ? err.message : 'Could not save launch settings.')
    } finally {
      setLaunchBusy(false)
    }
  }

  const TAB_ITEMS: { key: Tab; label: string; description: string; icon: string }[] = [
    { key: 'profile',  label: 'My Profile',        description: 'Name, email and password',                              icon: accountInitials },
    { key: 'launch',   label: 'Website Overlay',    description: 'Password gate, copy and countdown',                    icon: 'WO' },
    { key: 'defaults', label: 'Business Defaults',  description: 'GST, markup, labour and hardware costs',               icon: 'BD' },
  ]

  // Profile tab content
  const profileContent = (
    <>
      {/* Profile summary */}
      <div className="bg-white border border-[#dbd8cc] rounded-[8px] p-5 flex items-center gap-4 mb-4">
        <div className="w-[48px] h-[48px] rounded-full bg-[#1c2b1e] text-white text-[16px] font-bold flex items-center justify-center flex-shrink-0">
          {accountInitials}
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[#1a1a18]">Admin Account</p>
          <p className="text-[13px] text-[#5a5a52]">{currentEmail || allowedAdminEmail}</p>
        </div>
      </div>

      {/* Personal information card */}
      <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#edf4eb]">
          <h3 className="text-[15px] font-semibold text-[#1a1a18]">Personal Information</h3>
          <p className="text-[12px] text-[#5a5a52] mt-[2px]">Core account details used for sign-in and admin access.</p>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[#edf4eb] text-[13px]">
          {[
            { label: 'Full name',      value: 'Admin Account' },
            { label: 'Username',       value: accountLabel },
            { label: 'Email address',  value: currentEmail || allowedAdminEmail },
            { label: 'Password',       value: 'Hidden' },
          ].map(({ label, value }) => (
            <div key={label}>
              <span className="text-[11px] uppercase tracking-[0.06em] text-[#8b8a81] font-semibold">{label}</span>
              <p className="font-medium text-[#1a1a18] mt-[3px]">{value}</p>
            </div>
          ))}
        </div>

        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email form */}
          <form onSubmit={handleEmailUpdate} className="flex flex-col gap-3">
            <div>
              <h4 className="text-[14px] font-semibold text-[#1a1a18]">Email</h4>
              <p className="text-[12px] text-[#5a5a52] mt-[2px]">
                Allowed admin email: <strong>{allowedAdminEmail}</strong>
              </p>
            </div>
            <label className={fieldLabelClass} htmlFor="adminEmail">
              Account email
              <input
                id="adminEmail"
                type="email"
                className={inputClass}
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className={primaryBtn} disabled={emailBusy}>
                {emailBusy ? 'Sending confirmation...' : 'Update email'}
              </button>
            </div>
            {emailStatus && <p className="text-[13px] text-[#5a5a52]">{emailStatus}</p>}
          </form>

          {/* Password form */}
          <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-3">
            <div>
              <h4 className="text-[14px] font-semibold text-[#1a1a18]">Password</h4>
              <p className="text-[12px] text-[#5a5a52] mt-[2px]">
                Update the login password for this admin account. The website overlay uses this same password.
              </p>
            </div>
            <label className={fieldLabelClass} htmlFor="newPassword">
              New password
              <div className="flex items-center gap-2">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={inputClass}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className={cn(secondaryBtn, 'flex-shrink-0')}
                  onClick={() => setShowPassword(prev => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className={fieldLabelClass} htmlFor="confirmPassword">
              Confirm password
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                className={inputClass}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className={primaryBtn} disabled={passwordBusy}>
                {passwordBusy ? 'Updating...' : 'Update password'}
              </button>
            </div>
            {passwordStatus && <p className="text-[13px] text-[#5a5a52]">{passwordStatus}</p>}
          </form>
        </div>
      </div>
    </>
  )

  // Launch tab content
  const launchContent = (
    <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
      <form onSubmit={handleLaunchSettingsSave}>
        <div className="px-5 py-4 border-b border-[#edf4eb]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1a1a18]">Password Protected Website Overlay</h3>
              <p className="text-[12px] text-[#5a5a52] mt-[2px]">
                Toggle the main website gate, edit overlay text, and preview the countdown state.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" className={secondaryBtn} onClick={() => setShowLaunchPreview(true)}>
                Show preview
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className={cn(
                  'relative w-[36px] h-[20px] rounded-full transition-colors flex-shrink-0',
                  launchSettings.isActive ? 'bg-[#6b9e61]' : 'bg-[#dbd8cc]'
                )}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!launchSettings.isActive}
                    onChange={e => updateLaunchField('isActive', e.target.checked)}
                  />
                  <span className={cn(
                    'absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-white rounded-full shadow transition-transform',
                    launchSettings.isActive ? 'translate-x-[16px]' : 'translate-x-0'
                  )} />
                </div>
                <span className="text-[13px] font-medium text-[#1a1a18]">
                  {launchSettings.isActive ? 'Active' : 'Inactive'}
                </span>
              </label>
              <button type="submit" className={primaryBtn} disabled={launchBusy}>
                {launchBusy ? 'Saving...' : 'Save overlay settings'}
              </button>
            </div>
          </div>
          {launchStatus && <p className="text-[13px] text-[#5a5a52] mt-3">{launchStatus}</p>}
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <label className={fieldLabelClass} htmlFor="launchLiveAt">
            Live date and time
            <input
              id="launchLiveAt"
              type="datetime-local"
              className={inputClass}
              value={launchSettings.liveAt as string}
              onChange={e => updateLaunchField('liveAt', e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LAUNCH_TEXT_FIELDS.map(([field, label, type]) => (
              <label key={field} className={fieldLabelClass} htmlFor={`launch-${field}`}>
                {label}
                {type === 'textarea' ? (
                  <textarea
                    id={`launch-${field}`}
                    className={textareaClass}
                    value={(launchSettings[field] as string) || ''}
                    onChange={e => updateLaunchField(field, e.target.value)}
                  />
                ) : (
                  <input
                    id={`launch-${field}`}
                    type="text"
                    className={inputClass}
                    value={(launchSettings[field] as string) || ''}
                    onChange={e => updateLaunchField(field, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      </form>
    </div>
  )

  // Defaults tab content
  const defaultsContent = (
    <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
      <form onSubmit={handleDefaultsSave}>
        <div className="px-5 py-4 border-b border-[#edf4eb]">
          <h3 className="text-[15px] font-semibold text-[#1a1a18]">Quote Calculation Defaults</h3>
          <p className="text-[12px] text-[#5a5a52] mt-[2px]">
            These values are applied to new quote lines and cost fields. Existing quotes and per-line edits stay editable.
          </p>
        </div>
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {DEFAULTS_FIELDS.map(field => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#5a5a52]" htmlFor={`default-${field.key}`}>
                {field.label}
              </label>
              <p className="text-[11px] text-[#8b8a81]">{field.help}</p>
              {field.prefix || field.suffix ? (
                <div className="flex items-center h-[36px] border border-[#dbd8cc] rounded-[6px] overflow-hidden">
                  {field.prefix && (
                    <span className="px-3 h-full flex items-center text-[13px] text-[#5a5a52] bg-[#f5f8f4] border-r border-[#dbd8cc] flex-shrink-0">
                      {field.prefix}
                    </span>
                  )}
                  <input
                    id={`default-${field.key}`}
                    className="flex-1 h-full px-3 text-[13px] text-[#1a1a18] focus:outline-none bg-white"
                    type={field.type || 'number'}
                    min={field.min || '0'}
                    step={field.step || '0.01'}
                    value={(defaults[field.key] as string | number) ?? ''}
                    onChange={e =>
                      updateDefault(
                        field.key,
                        field.transform === 'uppercase'
                          ? e.target.value.toUpperCase()
                          : e.target.value
                      )
                    }
                  />
                  {field.suffix && (
                    <span className="px-3 h-full flex items-center text-[13px] text-[#5a5a52] bg-[#f5f8f4] border-l border-[#dbd8cc] flex-shrink-0">
                      {field.suffix}
                    </span>
                  )}
                </div>
              ) : (
                <input
                  id={`default-${field.key}`}
                  className={inputClass}
                  type={field.type || 'number'}
                  min={field.min}
                  step={field.step}
                  value={(defaults[field.key] as string | number) ?? ''}
                  onChange={e =>
                    updateDefault(
                      field.key,
                      field.transform === 'uppercase'
                        ? e.target.value.toUpperCase()
                        : e.target.value
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>
        {defaultsFeedback && (
          <div className="px-5 pb-4">
            <p className="text-[13px] text-[#5a5a52]">{defaultsFeedback}</p>
          </div>
        )}
        <div className="px-5 pb-5 flex items-center gap-3">
          <button type="submit" className={primaryBtn} disabled={defaultsBusy}>
            {defaultsBusy ? 'Saving...' : 'Save defaults'}
          </button>
        </div>
      </form>
    </div>
  )

  const tabContent = activeTab === 'profile' ? profileContent : activeTab === 'launch' ? launchContent : defaultsContent

  const launchPreviewModal =
    showLaunchPreview && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 bg-black/80 z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Website overlay preview"
          >
            <div className="flex-shrink-0 flex justify-end p-4">
              <button
                type="button"
                onClick={() => setShowLaunchPreview(false)}
                className="h-[34px] px-4 bg-white text-[13px] font-medium rounded-[6px] hover:bg-[#f5f8f4] transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <LaunchOverlayPreview launchCountdown={launchCountdown} launchSettings={launchSettings} />
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div className="min-h-full">
        {/* Page header */}
        <div className="px-4 md:px-6 py-5 border-b border-[#edf4eb] bg-white">
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Settings</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage your account, website overlay and business defaults</p>
        </div>

        {/* Desktop: two-panel */}
        <div className="hidden md:flex items-start">
          <aside className="w-[220px] flex-shrink-0 border-r border-[#edf4eb] bg-white min-h-full">
            <nav className="p-3 flex flex-col gap-[2px]">
              {TAB_ITEMS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-[10px] rounded-[6px] w-full text-left transition-colors',
                    activeTab === item.key
                      ? 'bg-[#edf4eb] text-[#1c2b1e]'
                      : 'text-[#5a5a52] hover:bg-[#f5f8f4]'
                  )}
                >
                  <span className="w-[28px] h-[28px] rounded-[6px] bg-[#1c2b1e] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </span>
                  <span className="text-[13px] font-medium">{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-6 bg-[#f5f8f4] min-h-full">
            {tabContent}
          </main>
        </div>

        {/* Mobile: list → detail drill-down */}
        <div className="md:hidden">
          {mobileView === 'list' ? (
            <div className="p-4 flex flex-col gap-2 bg-[#f5f8f4] min-h-full">
              {TAB_ITEMS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => { setActiveTab(item.key); setMobileView('detail') }}
                  className="flex items-center gap-3 bg-white border border-[#dbd8cc] rounded-[8px] px-4 py-[14px] text-left w-full hover:bg-[#f5f8f4] transition-colors"
                >
                  <span className="w-[36px] h-[36px] rounded-[8px] bg-[#1c2b1e] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1a1a18]">{item.label}</p>
                    <p className="text-[12px] text-[#5a5a52] mt-[1px]">{item.description}</p>
                  </div>
                  <IconChevronRight size={16} className="text-[#c5cdd8] flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-[#edf4eb] flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="w-[32px] h-[32px] flex items-center justify-center text-[#5a5a52] hover:text-[#1a1a18] transition-colors -ml-1"
                  aria-label="Back to settings"
                >
                  <IconArrowLeft size={18} />
                </button>
                <span className="text-[15px] font-semibold text-[#1a1a18]">
                  {TAB_ITEMS.find(t => t.key === activeTab)?.label}
                </span>
              </div>
              <div className="p-4 bg-[#f5f8f4]">
                {tabContent}
              </div>
            </div>
          )}
        </div>
      </div>

      {launchPreviewModal}
    </>
  )
}
