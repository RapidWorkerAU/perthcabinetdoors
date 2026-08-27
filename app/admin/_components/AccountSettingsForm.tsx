'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createSupabaseBrowserClient } from '../../../lib/supabase/client'
import { getAllowedAdminEmailClient } from '../../../lib/admin-access'
import { DEFAULT_LAUNCH_SETTINGS } from '../../../lib/launch-settings'
import { DEFAULT_BUSINESS_DEFAULTS } from '../../../lib/pcd-quote-utils'
import { cn } from '@/lib/utils'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import launchStyles from './launch-preview.module.css'
import QuoteTermsManager from './QuoteTermsManager'
import EmailSignatureCard from './EmailSignatureCard'
import ListsManager from './ListsManager'

interface DefaultField {
  key:        string
  group:      string
  label:      string
  step?:      string
  prefix?:    string
  suffix?:    string
  hint:       string
}

const DEFAULTS_FIELDS: DefaultField[] = [
  {
    group: 'Labour',
    key:   'labour_hours_per_cabinet',
    label: 'Labour hours per cabinet',
    suffix: 'h',
    step:  '0.25',
    hint:  'Added to quote labour for every base-cabinet line x qty.',
  },
  {
    group: 'Labour',
    key:   'inhouse_processing_hours_per_piece',
    label: 'In-house processing time',
    suffix: 'h',
    step:  '0.05',
    hint:  'Hours to make one decorative board door, drawer front or panel. Added to quote labour for every such line x qty.',
  },
  {
    group:  'Labour',
    key:    'worker_hourly_rate',
    label:  'Worker hourly rate',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Multiplies total labour hours.',
  },
  {
    group:  'Pricing',
    key:    'markup_percent',
    label:  'Default markup',
    suffix: '%',
    step:   '1',
    hint:   'Applied to product cost on each line.',
  },
  {
    group: 'Pricing',
    key:   'gst_rate',
    label: 'GST rate',
    step:  '0.01',
    hint:  'As a decimal. 0.1 = 10%.',
  },
  // ONE FIGURE, AND FOUR THINGS READ IT. It used to be two numbers that
  // disagreed: the terms wording said 14 days and the lead conversion report
  // counted 30. Changing it here moves the reminder email, the date the customer
  // is given, the day the quote archives itself and the point the report calls a
  // quote lost, all together.
  {
    group:  'Pricing',
    key:    'quote_valid_days',
    label:  'Quote validity',
    suffix: 'days',
    step:   '1',
    hint:   'How long a quote stands for. The customer is emailed a reminder 7 days before it runs out, and it archives itself the day after. Change your terms wording to match.',
  },
  // Workshop fees. The drawer runner rates used to live here, one per runner
  // type. Runners are ordinary hardware now, picked from the hardware library
  // and added to a quote as their own line, so there is nothing to set here.
  {
    group:  'Workshop fees',
    key:    'hinge_drilling_unit_cost_ex_gst',
    label:  'Hinge drilling',
    prefix: '$',
    step:   '0.5',
    hint:   'Per hinge hole, ex GST. Supplied hinges are added as separate hardware line items.',
  },
  {
    group:  'Workshop fees',
    key:    'abs_edging_cost_per_lineal_metre_ex_gst',
    label:  'ABS edging',
    prefix: '$',
    suffix: '/lm',
    step:   '0.1',
    hint:   'Per lineal metre, ex GST, including your uplift. Charged on the edges of every decorative board line on a quote.',
  },
  // Everything below prefills the box of the same name on a NEW quote and stays
  // editable per job. Leave one at 0 and that quote box simply starts empty, so
  // filling these in is entirely optional.
  {
    group:  'Workshop fees',
    key:    'default_installation_cost_ex_gst',
    label:  'Consumables',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Starting value for the Consumables box on a new quote.',
  },
  {
    group:  'Workshop fees',
    key:    'default_delivery_cost_ex_gst',
    label:  'Delivery',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Starting value for the Delivery box on a new quote.',
  },
  {
    group:  'Workshop fees',
    key:    'default_removal_cost_ex_gst',
    label:  'Door removal / disposal',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Starting value for the Door removal box on a new quote.',
  },
  {
    group:  'Workshop fees',
    key:    'default_travel_cost_ex_gst',
    label:  'Travel',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Starting value for the Travel box on a new quote.',
  },
  {
    group:  'Workshop fees',
    key:    'default_painting_cost_ex_gst',
    label:  'Painting',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Starting value for the Painting box on a new quote.',
  },
  {
    group:  'Workshop fees',
    key:    'default_glass_cost_ex_gst',
    label:  'Glass',
    prefix: '$',
    step:   '1',
    hint:   'Ex GST. Starting value for the Glass box on a new quote.',
  },
]

const DEFAULTS_GROUPS = ['Labour', 'Pricing', 'Workshop fees']

// Fields where zero is not a real answer. A $0 hourly rate prices the labour on
// every quote in the system at nothing, and it is far too easy to leave a box
// empty and save.
// A quote good for zero days would archive every live quote on the next pass
// and kill every customer link with it.
const DEFAULTS_MUST_BE_POSITIVE = new Set(['worker_hourly_rate', 'quote_valid_days'])

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

type Tab = 'profile' | 'launch' | 'defaults' | 'lists'

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
  // Whether the saved settings actually arrived. This screen used to start from
  // the built-in constants and swallow a failed load, so a settings row that
  // could not be read showed the factory numbers as if they were yours, and
  // pressing Save wrote them over your real ones. Nothing may be saved until
  // the real values are in hand.
  const [defaultsLoaded,   setDefaultsLoaded]   = useState(false)
  const [defaultsError,    setDefaultsError]    = useState('')

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

  const loadDefaults = useCallback(async () => {
    setDefaultsError('')
    try {
      const res     = await fetch('/api/admin/business-defaults', { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok || !payload.ok) {
        setDefaultsError(payload.error || 'Could not load your saved business defaults.')
        return
      }
      setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults } as Defaults)
      setDefaultsLoaded(true)
    } catch (err: unknown) {
      // Never swallowed. A silent failure here left the factory numbers on
      // screen looking like saved settings, and saving then destroyed the real
      // ones.
      setDefaultsError(err instanceof Error ? err.message : 'Could not load your saved business defaults.')
    }
  }, [])

  useEffect(() => { loadDefaults() }, [loadDefaults])

  function updateDefault(field: string, value: unknown) {
    setDefaultsFeedback('')
    setDefaults(cur => ({ ...cur, [field]: value }))
  }

  async function handleDefaultsSave(event: React.FormEvent) {
    event.preventDefault()
    setDefaultsFeedback('')

    if (!defaultsLoaded) {
      setDefaultsFeedback('Your saved defaults could not be loaded, so saving now would overwrite them. Reload and try again.')
      return
    }

    // A blank box is not zero, it is a missing answer. Saving one used to reset
    // that field to the built-in constant without saying so.
    const blank = DEFAULTS_FIELDS.find(field => {
      const value = defaults[field.key]
      return value === '' || value === null || value === undefined || Number.isNaN(Number(value))
    })
    if (blank) {
      setDefaultsFeedback(`Enter a number for ${blank.label.toLowerCase()} before saving.`)
      return
    }

    const notPositive = DEFAULTS_FIELDS.find(
      field => DEFAULTS_MUST_BE_POSITIVE.has(field.key) && Number(defaults[field.key]) <= 0
    )
    if (notPositive) {
      setDefaultsFeedback(`${notPositive.label} must be more than zero, or every quote prices its labour at nothing.`)
      return
    }

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
    // Last, because it is the one you visit rarely and on purpose. Business
    // Defaults changes what every quote costs; this changes what a dropdown
    // offers.
    { key: 'lists',    label: 'Lists',              description: 'Dropdown options you can add to yourself',            icon: 'LI' },
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
    <form onSubmit={handleDefaultsSave}>
      <div className="mb-5">
        <h3 className="text-[15px] font-semibold text-[#1a1a18]">Business Defaults</h3>
        <p className="mt-[2px] max-w-[760px] text-[13px] leading-relaxed text-[#5a5a52]">
          Set the pricing, labour and quote text defaults used when quotes are created or recalculated.
        </p>
      </div>

      {defaultsError ? (
        <div className="mb-5 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3">
          <p className="text-[13px] font-medium text-[#991b1b]">Your saved defaults could not be loaded.</p>
          <p className="mt-[2px] text-[12px] leading-snug text-[#7f1d1d]">
            The boxes below are showing built-in starting values, not your settings. Saving is blocked so they cannot
            overwrite what you have. {defaultsError}
          </p>
          <button
            type="button"
            onClick={loadDefaults}
            className="mt-3 h-[32px] rounded-[6px] border border-[#fca5a5] bg-white px-3 text-[12px] font-medium text-[#991b1b] hover:bg-[#fef2f2]"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-4">
          {DEFAULTS_GROUPS.map(group => (
            <div key={group} className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
              <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                {group}
              </div>
              <div className="divide-y divide-[#edf4eb]">
                {DEFAULTS_FIELDS.filter(field => field.group === group).map(field => (
                  <label key={field.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[#1a1a18]">{field.label}</span>
                      <span className="mt-[2px] block text-[11px] leading-snug text-[#8b8a81]">{field.hint}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      {field.prefix ? <span className="text-[12px] text-[#8b8a81]">{field.prefix}</span> : null}
                      <input
                        className="h-[36px] w-[110px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-right font-mono text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                        type="number"
                        min="0"
                        step={field.step}
                        value={(defaults[field.key] as string | number) ?? ''}
                        onChange={event => updateDefault(field.key, event.target.value === '' ? '' : Number(event.target.value))}
                      />
                      {field.suffix ? <span className="text-[12px] text-[#8b8a81]">{field.suffix}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {/* The terms library. This was one "Default terms text" box, which
              put the same wording on every quote whether it fitted the job or
              not. It saves per term rather than through Save defaults below. */}
          <QuoteTermsManager />

          {/* Signed onto replies sent from a customer page. Sits with the
              terms because both are wording that goes out to customers. */}
          <EmailSignatureCard />

          <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
            <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Variation terms</p>
            </div>
            <div className="p-4">
              <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                Default terms text
                <textarea
                  className="min-h-[92px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                  value={(defaults.variation_terms as string) || ''}
                  onChange={event => updateDefault('variation_terms', event.target.value)}
                  placeholder="Leave blank for no terms on a variation."
                />
              </label>
              <p className="mt-2 text-[11px] leading-snug text-[#8b8a81]">
                Written onto every new order variation. This wording used to be fixed in the code and could not be changed.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className={primaryBtn} disabled={defaultsBusy || !defaultsLoaded}>
          {defaultsBusy ? 'Saving...' : 'Save defaults'}
        </button>
        {defaultsFeedback ? <span className="text-[13px] text-[#5a5a52]">{defaultsFeedback}</span> : null}
      </div>
    </form>
  )

  const tabContent =
    activeTab === 'profile'  ? profileContent  :
    activeTab === 'launch'   ? launchContent   :
    activeTab === 'lists'    ? <ListsManager /> :
    defaultsContent

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
      <div className="flex min-h-full flex-col md:h-full md:min-h-0">
        {/* Page header */}
        <div className="px-4 md:px-6 py-5 border-b border-[#edf4eb] bg-white">
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Settings</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage your account, website overlay and business defaults</p>
        </div>

        {/* Desktop: two-panel */}
        <div className="hidden md:flex min-h-0 flex-1 items-stretch">
          <aside className="w-[220px] min-h-0 flex-shrink-0 border-r border-[#edf4eb] bg-white">
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
          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f5f8f4] p-6">
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
