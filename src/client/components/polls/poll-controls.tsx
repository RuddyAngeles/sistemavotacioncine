import {
  Archive,
  ArchiveRestore,
  Copy,
  FileEdit,
  Loader2,
  Lock,
  Play,
  Send,
  Share2,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { ConfirmDialog } from '@/client/components/common/confirm-dialog'
import { ShareDialog } from '@/client/components/polls/share-dialog'
import { Button } from '@/client/components/ui/button'
import type { PollTransitionName } from '@/client/lib/queries'
import { availableTransitions, type PollTransition } from '@/shared/policy'
import type { PollDTO } from '@/shared/types'

interface ActionConfig {
  label: string
  icon: ComponentType<{ className?: string }>
  variant: 'default' | 'outline' | 'secondary' | 'destructive'
  confirm?: { title: string; description: ReactNode; confirmLabel: string; destructive?: boolean }
}

const ACTIONS: Record<PollTransition, ActionConfig> = {
  publish: {
    label: 'Publicar votacion',
    icon: Send,
    variant: 'default',
    confirm: {
      title: 'Publicar la votacion?',
      description:
        'La votacion dejara de ser un borrador y sera visible para los trabajadores. Todavia no podran votar hasta que la abras (o hasta que llegue la hora de inicio programada).',
      confirmLabel: 'Publicar',
    },
  },
  open: {
    label: 'Abrir votacion',
    icon: Play,
    variant: 'default',
    confirm: {
      title: 'Abrir la votacion?',
      description: 'A partir de este momento los trabajadores podran emitir su voto.',
      confirmLabel: 'Abrir',
    },
  },
  close: {
    label: 'Cerrar votacion',
    icon: Lock,
    variant: 'destructive',
    confirm: {
      title: 'Cerrar la votacion?',
      description:
        'Una vez cerrada no se podran registrar nuevos votos ni cambiar los existentes. Podras volver a abrirla si hace falta.',
      confirmLabel: 'Cerrar votacion',
      destructive: true,
    },
  },
  archive: {
    label: 'Archivar',
    icon: Archive,
    variant: 'outline',
    confirm: {
      title: 'Archivar la votacion?',
      description:
        'Pasara al historial y no admitira nuevos votos. Los resultados se conservan intactos.',
      confirmLabel: 'Archivar',
    },
  },
  reopen: {
    label: 'Desarchivar',
    icon: ArchiveRestore,
    variant: 'outline',
  },
  'back-to-draft': {
    label: 'Volver a borrador',
    icon: FileEdit,
    variant: 'outline',
    confirm: {
      title: 'Volver a borrador?',
      description: 'Los trabajadores dejaran de ver la votacion hasta que la publiques de nuevo.',
      confirmLabel: 'Volver a borrador',
    },
  },
}

interface PollControlsProps {
  poll: PollDTO
  pending: PollTransitionName | 'duplicate' | 'delete' | null
  onTransition: (transition: PollTransitionName) => void
  onDuplicate: () => void
  onDelete: () => void
}

/**
 * Acciones del ciclo de vida.
 *
 * Se muestran unicamente las transiciones que el servidor aceptaria en el
 * estado actual, calculadas con la misma funcion que usa el backend.
 */
export function PollControls({
  poll,
  pending,
  onTransition,
  onDuplicate,
  onDelete,
}: PollControlsProps) {
  const [confirming, setConfirming] = useState<PollTransition | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)

  const transitions = availableTransitions(poll.status)
  const confirmConfig = confirming ? ACTIONS[confirming].confirm : null

  const run = (transition: PollTransition) => {
    const config = ACTIONS[transition]
    if (config.confirm) {
      setConfirming(transition)
      return
    }
    onTransition(transition)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {transitions.map((transition) => {
          const config = ACTIONS[transition]
          const Icon = config.icon
          const isPending = pending === transition

          return (
            <Button
              key={transition}
              variant={config.variant}
              disabled={pending !== null}
              onClick={() => run(transition)}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Icon />}
              {config.label}
            </Button>
          )
        })}

        {poll.status !== 'DRAFT' ? (
          <Button variant="outline" onClick={() => setSharing(true)}>
            <Share2 />
            Compartir
          </Button>
        ) : null}

        <Button variant="outline" disabled={pending !== null} onClick={onDuplicate}>
          {pending === 'duplicate' ? <Loader2 className="animate-spin" /> : <Copy />}
          Duplicar
        </Button>

        <Button variant="ghost" disabled={pending !== null} onClick={() => setDeleting(true)}>
          <Trash2 className="text-destructive" />
          Eliminar
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirmConfig?.title ?? ''}
        description={confirmConfig?.description ?? ''}
        confirmLabel={confirmConfig?.confirmLabel ?? 'Confirmar'}
        variant={confirmConfig?.destructive ? 'destructive' : 'default'}
        loading={pending !== null}
        onConfirm={() => {
          if (!confirming) return
          const transition = confirming
          setConfirming(null)
          onTransition(transition)
        }}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Eliminar la votacion?"
        description={
          <>
            Se eliminaran tambien su cartelera y{' '}
            <strong>todos los votos emitidos ({poll.totalVotes ?? 0})</strong>. Esta accion no se
            puede deshacer. Si solo quieres sacarla de la vista, archivala.
          </>
        }
        confirmLabel="Eliminar definitivamente"
        variant="destructive"
        loading={pending === 'delete'}
        onConfirm={() => {
          setDeleting(false)
          onDelete()
        }}
      />

      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        slug={poll.slug}
        title={poll.title}
      />
    </>
  )
}
