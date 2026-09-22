import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { authQueryKey, useAuth } from '@/client/hooks/use-auth'
import { errorMessage } from '@/client/lib/api'
import { surveyKeys, surveysApi } from '@/client/lib/queries'

/**
 * Aviso de que no se puede participar, con la salida a mano.
 *
 * Participar es un permiso aparte del rol, asi que un administrador puede
 * crear una encuesta y encontrarse con que el sistema no le deja
 * responderla. Es coherente, pero desde su sitio parece un error: no hay
 * nadie mas a quien pedirselo. Por eso aqui se lo puede dar el mismo, de un
 * clic y quedando registrado en la auditoria como cualquier otro cambio de
 * permiso. A quien no es administrador se le dice a quien acudir.
 */
export function SinPermisoParaParticipar({ className }: { className?: string }) {
  const { user, isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const darsePermiso = useMutation({
    mutationFn: () => surveysApi.setPermission(true, user ? [user.id] : []),
    onSuccess: async () => {
      toast.success('Ya puedes participar', { description: 'Tambien en las proximas encuestas.' })
      await queryClient.invalidateQueries({ queryKey: authQueryKey })
      await queryClient.invalidateQueries({ queryKey: surveyKeys.mine })
      await queryClient.invalidateQueries({ queryKey: surveyKeys.abiertas })
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido activar el permiso')),
  })

  return (
    <Card className={className ?? 'border-warning/40 bg-warning/5'}>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No puedes participar en encuestas</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {isAdmin
                ? 'Participar es un permiso aparte de administrar: crear encuestas no implica responderlas. Puedes activartelo tu mismo.'
                : 'Participar en encuestas es un permiso que concede el administrador. Puedes ver las que haya, pero no responderlas hasta que te lo active.'}
            </p>
          </div>
        </div>

        {isAdmin ? (
          <Button
            variant="outline"
            className="shrink-0"
            disabled={darsePermiso.isPending}
            onClick={() => darsePermiso.mutate()}
          >
            {darsePermiso.isPending ? <Loader2 className="animate-spin" /> : null}
            Activarmelo
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
