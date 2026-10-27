import { Lock } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Input } from '../../components/ui/Field'
import { passwordChecks } from './passwordRules'

export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  autoFocus,
}: {
  password: string
  confirm: string
  onPassword: (v: string) => void
  onConfirm: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <div className="space-y-4">
      <Input
        label="Nueva contraseña"
        type="password"
        icon={Lock}
        autoComplete="new-password"
        autoFocus={autoFocus}
        value={password}
        onChange={(e) => onPassword(e.target.value)}
      />
      <Input
        label="Confirma la nueva contraseña"
        type="password"
        icon={Lock}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => onConfirm(e.target.value)}
      />
      <ul className="space-y-1 text-xs">
        {passwordChecks(password, confirm).map((c) => (
          <li
            key={c.label}
            className={cn(
              'flex items-center gap-2',
              c.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-subtle',
            )}
          >
            <span className={cn('size-1.5 rounded-full', c.ok ? 'bg-emerald-500' : 'bg-border-strong')} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
