'use client'

import { useMemo, useState } from 'react'
import { customerReviewRequestHtml } from '../../../lib/pcd-email-templates'
import { reviewMessageParagraphs, reviewSettingsProblem } from '../../../lib/pcd-review-requests'

// THE GOOGLE REVIEW REQUEST, AS SETTINGS.
//
// Part of the Business Defaults form rather than a card that saves itself: the
// form sends the whole row on Save defaults, so a card saving its own copy
// would be overwritten by whatever the form loaded before it. One state, one
// save. The rules these feed are in lib/pcd-review-requests.js.
//
// THE PREVIEW IS THE REAL TEMPLATE, filled with an example customer, so what is
// checked here is what arrives.

const GAP_OPTIONS = [
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
  { value: 24, label: '24 months' },
  { value: 0, label: 'Every order' },
]

const field = 'h-[36px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]'
const label = 'flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]'
const hint = 'text-[11px] font-normal leading-snug text-[#8b8a81]'

interface Props {
  defaults: Record<string, unknown>
  updateDefault: (field: string, value: unknown) => void
}

export default function ReviewRequestCard({ defaults, updateDefault }: Props) {
  const [preview, setPreview] = useState(false)
  const enabled = defaults.review_requests_enabled === true
  const problem = reviewSettingsProblem(defaults)

  const previewHtml = useMemo(() => {
    if (!preview) return ''
    return customerReviewRequestHtml({
      heading: 'Thank you, Sarah',
      paragraphs: reviewMessageParagraphs(String(defaults.review_request_message || ''), {
        firstName: 'Sarah',
        orderNumber: 'PCD-1042',
      }),
      buttonUrl: String(defaults.google_review_url || '#'),
      unsubscribeUrl: '#',
      orderNumber: 'PCD-1042',
    })
  }, [preview, defaults.review_request_message, defaults.google_review_url])

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Google review requests</p>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <p className="text-[11px] leading-snug text-[#8b8a81]">
          When an order is marked Complete and paid in full, the customer is emailed a thank you asking for a Google
          review, after the wait below. It goes at 9am Perth time. Only orders finished after this is switched on are
          asked, and every order page shows when its request will go.
        </p>

        <label className="flex items-center justify-between gap-4 text-[13px] font-medium text-[#1a1a18]">
          <span>
            Send review requests automatically
            <span className={`mt-[2px] block ${hint}`}>Off sends nothing. Saved with Save defaults below.</span>
          </span>
          <input
            id="review_requests_enabled"
            type="checkbox"
            className="h-[18px] w-[18px] accent-[#2d5e28]"
            checked={enabled}
            onChange={event => updateDefault('review_requests_enabled', event.target.checked)}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={label}>
            Days to wait after Complete
            <input
              id="review_request_delay_days"
              type="number"
              min="0"
              max="60"
              step="1"
              className={field}
              value={(defaults.review_request_delay_days as number | string) ?? ''}
              onChange={event =>
                updateDefault('review_request_delay_days', event.target.value === '' ? '' : Number(event.target.value))
              }
            />
            <span className={hint}>Counted from the later of Complete and paid in full. 0 sends on the next pass.</span>
          </label>
          <label className={label}>
            Ask the same customer at most every
            <select
              id="review_request_gap_months"
              className={field}
              value={Number(defaults.review_request_gap_months ?? 12)}
              onChange={event => updateDefault('review_request_gap_months', Number(event.target.value))}
            >
              {GAP_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className={hint}>Matched on the customer and on the email address.</span>
          </label>
        </div>

        <label className={label}>
          Google review link
          <input
            id="google_review_url"
            type="text"
            className={field}
            value={String(defaults.google_review_url ?? '')}
            onChange={event => updateDefault('google_review_url', event.target.value)}
            placeholder="https://g.page/r/.../review"
          />
          <span className={hint}>From your Google Business Profile, under Ask for reviews.</span>
        </label>

        <label className={label}>
          Subject
          <input
            id="review_request_subject"
            type="text"
            className={field}
            value={String(defaults.review_request_subject ?? '')}
            onChange={event => updateDefault('review_request_subject', event.target.value)}
          />
        </label>

        <label className={label}>
          Message
          <textarea
            id="review_request_message"
            className="min-h-[220px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61]"
            value={String(defaults.review_request_message ?? '')}
            onChange={event => updateDefault('review_request_message', event.target.value)}
          />
          <span className={hint}>
            Leave a blank line between paragraphs. {'{first_name}'} and {'{order_number}'} are filled in for each
            customer, and {'{review_button}'} is where the button goes. The unsubscribe line is always added at the
            bottom, because the law requires it.
          </span>
        </label>

        {problem ? (
          <p className="rounded-[6px] border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">{problem}</p>
        ) : null}

        <div>
          <button
            type="button"
            onClick={() => setPreview(open => !open)}
            className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4]"
          >
            {preview ? 'Hide the preview' : 'Preview the email'}
          </button>
        </div>

        {preview ? (
          // srcDoc and an empty sandbox, the same as the signature preview:
          // the email's own styles, and nothing in it can run or navigate.
          <iframe
            title="Preview of the review request email"
            sandbox=""
            className="h-[620px] w-full rounded-[8px] border border-[#dbd8cc] bg-white"
            srcDoc={previewHtml}
          />
        ) : null}
      </div>
    </div>
  )
}
