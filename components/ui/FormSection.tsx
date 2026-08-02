import * as React from 'react'
import { cn } from '@/lib/utils'

export interface FormSectionProps {
  title?: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function FormSection({ title, description, aside, children, className }: FormSectionProps) {
  return (
    <section className={cn('rounded-[8px] border border-[#dbd8cc] bg-white p-4 md:p-5', className)}>
      {(title || description || aside) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-[#1a1a18]">{title}</h2>}
            {description && <p className="mt-1 text-[13px] leading-relaxed text-[#5a5a52]">{description}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function FieldGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2', className)}>
      {children}
    </div>
  )
}
