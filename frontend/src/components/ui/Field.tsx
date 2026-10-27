import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

const CONTROL = cn(
  'w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg shadow-sm transition-colors',
  'placeholder:text-fg-subtle',
  'focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle',
)
const ERROR = 'border-red-500 focus:border-red-500 focus:ring-red-500/25'

interface FieldProps {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

function FieldWrapper({ label, error, hint, required, children }: FieldProps & { children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="block text-xs font-medium text-red-600 dark:text-red-400">{error}</span>
      ) : (
        hint && <span className="block text-xs text-fg-muted">{hint}</span>
      )}
    </label>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps & { icon?: LucideIcon }

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, icon: Icon, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <span className="relative block">
        {Icon && (
          <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
        )}
        <input
          ref={ref}
          required={required}
          aria-invalid={!!error}
          className={cn(CONTROL, 'h-9', Icon && 'pl-9', error && ERROR, className)}
          {...props}
        />
      </span>
    </FieldWrapper>
  ),
)
Input.displayName = 'Input'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldProps

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, required, className, children, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <span className="relative block">
        <select
          ref={ref}
          required={required}
          aria-invalid={!!error}
          className={cn(CONTROL, 'h-9 appearance-none pr-9', error && ERROR, className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
      </span>
    </FieldWrapper>
  ),
)
Select.displayName = 'Select'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <textarea
        ref={ref}
        required={required}
        aria-invalid={!!error}
        className={cn(CONTROL, 'py-2', error && ERROR, className)}
        {...props}
      />
    </FieldWrapper>
  ),
)
Textarea.displayName = 'Textarea'
