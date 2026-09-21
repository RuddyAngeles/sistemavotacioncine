import { Link2, Pin, ShieldCheck } from 'lucide-react'
import { CopyField } from '@/client/components/common/copy-field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  title: string
}

/**
 * Comparte la votacion.
 *
 * Se ofrecen dos enlaces con proposito distinto:
 *
 *   /votar                  enlace fijo, el que se reparte una sola vez.
 *                           Siempre lleva a la votacion abierta en ese
 *                           momento, asi que no hay que volver a avisar a
 *                           nadie cada mes.
 *
 *   /app/votacion/<slug>    enlace directo a ESTA votacion en concreto,
 *                           util para un recordatorio puntual.
 *
 * Ninguno de los dos da acceso por si mismo: quien lo abra sin sesion acaba
 * en el login y, tras entrar, vuelve automaticamente a donde iba.
 */
export function ShareDialog({ open, onOpenChange, slug, title }: ShareDialogProps) {
  const origin = window.location.origin
  const fixedUrl = origin + '/votar'
  const directUrl = origin + '/app/votacion/' + slug

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            Compartir votacion
          </DialogTitle>
          <DialogDescription>
            Enlaces de <span className="font-medium text-foreground">{title}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Pin className="size-4 text-primary" aria-hidden="true" />
              <label htmlFor="enlace-fijo" className="text-sm font-medium">
                Enlace fijo
              </label>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Recomendado
              </span>
            </div>
            <CopyField id="enlace-fijo" value={fixedUrl} highlighted />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Repartelo una sola vez. Lleva siempre a la votacion que este abierta en ese
              momento, asi que sirve tambien para las proximas Movie Nights sin avisar de nuevo.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="enlace-directo" className="text-sm font-medium">
              Enlace directo a esta votacion
            </label>
            <CopyField id="enlace-directo" value={directUrl} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Apunta solo a <span className="font-medium text-foreground">{title}</span>. Util
              para un recordatorio concreto.
            </p>
          </div>
        </div>

        <div className="mt-2 flex gap-3 rounded-lg border border-border bg-surface-subtle p-3.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Los dos exigen iniciar sesion. Solo pueden votar las cuentas activas creadas por un
            administrador; el enlace por si solo no concede ningun acceso.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
