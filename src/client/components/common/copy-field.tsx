import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { cn } from '@/client/lib/utils'

interface CopyFieldProps {
  id: string
  value: string
  /** Resalta el campo cuando es la opcion recomendada. */
  highlighted?: boolean
  className?: string
}

/** Campo de solo lectura con boton de copiar. */
export function CopyField({ id, value, highlighted = false, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Enlace copiado')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // El portapapeles puede estar bloqueado; el texto sigue siendo
      // seleccionable a mano, asi que no es un callejon sin salida.
      toast.error('No se ha podido copiar. Selecciona el texto y copialo a mano.')
    }
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        id={id}
        readOnly
        value={value}
        onFocus={(event) => event.target.select()}
        className={cn('font-mono text-xs', highlighted && 'border-primary')}
      />
      <Button
        type="button"
        onClick={() => void copy()}
        variant={highlighted ? 'default' : 'outline'}
        className="shrink-0"
        aria-label={'Copiar ' + value}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
