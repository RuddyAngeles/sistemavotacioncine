import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MoviePoster } from '@/client/components/polls/movie-poster'
import { Button } from '@/client/components/ui/button'
import { errorMessage } from '@/client/lib/api'
import { pollsApi } from '@/client/lib/queries'
import { cn } from '@/client/lib/utils'
import { ALLOWED_IMAGE_MIME_TYPES, DEFAULT_MAX_UPLOAD_BYTES } from '@/shared/constants'

interface ImageUploaderProps {
  value: string | null
  previewUrl: string | null
  onChange: (posterKey: string | null, previewUrl: string | null) => void
  disabled?: boolean
  className?: string
}

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',')

/**
 * Subida de la cartelera a R2.
 *
 * La validacion visible aqui es por comodidad; el Worker vuelve a comprobar
 * tamano, extension y bytes de cabecera antes de guardar nada.
 */
export function ImageUploader({
  value,
  previewUrl,
  onChange,
  disabled = false,
  className,
}: ImageUploaderProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const upload = async (file: File) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      toast.error('Formato no admitido. Usa JPG, PNG o WEBP.')
      return
    }
    if (file.size > DEFAULT_MAX_UPLOAD_BYTES) {
      toast.error('La imagen supera los 5 MB.')
      return
    }

    setUploading(true)
    try {
      const result = await pollsApi.uploadPoster(file)
      onChange(result.key, result.url)
      toast.success('Cartelera subida')
    } catch (error) {
      toast.error(errorMessage(error, 'No se ha podido subir la imagen'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {previewUrl ? (
        <div className="flex items-start gap-3">
          <MoviePoster
            src={previewUrl}
            alt="Vista previa de la cartelera"
            className="w-24 shrink-0 rounded-lg border border-border"
          />
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Cartelera cargada</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => inputRef.current?.click()}
              >
                Reemplazar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => onChange(null, null)}
              >
                <Trash2 />
                Quitar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (disabled) return
            const file = event.dataTransfer.files[0]
            if (file) void upload(file)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30',
            (disabled || uploading) && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <ImageUp className="size-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {uploading ? 'Subiendo…' : 'Arrastra la cartelera o haz clic'}
          </span>
          <span className="text-xs text-muted-foreground">JPG, PNG o WEBP · maximo 5 MB</span>
        </label>
      )}

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />

      {value ? <input type="hidden" value={value} readOnly /> : null}
    </div>
  )
}
