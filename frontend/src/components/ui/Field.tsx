import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

const CONTROL =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none disabled:bg-slate-100'

interface FieldWrapperProps {
  label?: string
  error?: string
  children: ReactNode
}

function FieldWrapper({ label, error, children }: FieldWrapperProps) {
  return (
    <label className="block space-y-1">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className = '', ...props }, ref) => (
  <FieldWrapper label={label} error={error}>
    <input ref={ref} className={`${CONTROL} ${error ? 'border-red-400' : ''} ${className}`} {...props} />
  </FieldWrapper>
))
Input.displayName = 'Input'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', children, ...props }, ref) => (
    <FieldWrapper label={label} error={error}>
      <select ref={ref} className={`${CONTROL} ${error ? 'border-red-400' : ''} ${className}`} {...props}>
        {children}
      </select>
    </FieldWrapper>
  ),
)
Select.displayName = 'Select'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, className = '', ...props }, ref) => (
  <FieldWrapper label={label} error={error}>
    <textarea ref={ref} className={`${CONTROL} ${error ? 'border-red-400' : ''} ${className}`} {...props} />
  </FieldWrapper>
))
Textarea.displayName = 'Textarea'
