import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, ImageOff, Pencil, Trash2 } from 'lucide-react'
import { MoviePoster } from '@/client/components/polls/movie-poster'
import { Button } from '@/client/components/ui/button'
import { formatDuration } from '@/client/lib/format'
import { cn } from '@/client/lib/utils'
import type { PollOptionDTO } from '@/shared/types'

interface SortableOptionsProps {
  options: PollOptionDTO[]
  disabled?: boolean
  onReorder: (orderedIds: string[]) => void
  onEdit: (option: PollOptionDTO) => void
  onDelete: (option: PollOptionDTO) => void
}

interface RowProps {
  option: PollOptionDTO
  position: number
  total: number
  disabled: boolean
  onEdit: (option: PollOptionDTO) => void
  onDelete: (option: PollOptionDTO) => void
  onMove: (option: PollOptionDTO, direction: -1 | 1) => void
}

function OptionRow({ option, position, total, disabled, onEdit, onDelete, onMove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled,
  })

  const meta = [option.genre, option.year ? String(option.year) : null, formatDuration(option.durationMinutes)]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
        isDragging && 'z-10 shadow-raised',
      )}
    >
      <button
        type="button"
        className={cn(
          'cursor-grab touch-none rounded-md p-1.5 text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'pointer-events-none opacity-40',
        )}
        aria-label={'Reordenar ' + option.title}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
        {position + 1}
      </span>

      {/* Miniatura siempre visible: es la forma rapida de comprobar que
          todas las peliculas tienen su cartelera antes de publicar. */}
      <MoviePoster
        src={option.posterUrl}
        alt=""
        className="w-10 shrink-0 rounded-md border border-border"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{option.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[meta, option.showtime].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
        </p>
        {!option.posterUrl ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-warning">
            <ImageOff className="size-3" aria-hidden="true" />
            Sin cartelera
          </p>
        ) : null}
      </div>

      {/* Alternativa accesible al arrastrar, utilizable con teclado o en movil. */}
      <div className="hidden shrink-0 sm:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || position === 0}
          aria-label={'Subir ' + option.title}
          onClick={() => onMove(option, -1)}
        >
          <ChevronUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || position === total - 1}
          aria-label={'Bajar ' + option.title}
          onClick={() => onMove(option, 1)}
        >
          <ChevronDown />
        </Button>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={'Editar ' + option.title}
          onClick={() => onEdit(option)}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={'Eliminar ' + option.title}
          onClick={() => onDelete(option)}
        >
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </li>
  )
}

/**
 * Cartelera reordenable.
 *
 * Se puede arrastrar, pero tambien mover con los botones de subir/bajar y
 * con el teclado, para que no dependa de un gesto concreto. El orden se
 * guarda en la base de datos al soltar.
 */
export function SortableOptions({
  options,
  disabled = false,
  onReorder,
  onEdit,
  onDelete,
}: SortableOptionsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = options.findIndex((option) => option.id === active.id)
    const to = options.findIndex((option) => option.id === over.id)
    if (from === -1 || to === -1) return

    onReorder(arrayMove(options, from, to).map((option) => option.id))
  }

  const handleMove = (option: PollOptionDTO, direction: -1 | 1) => {
    const from = options.findIndex((item) => item.id === option.id)
    const to = from + direction
    if (from === -1 || to < 0 || to >= options.length) return
    onReorder(arrayMove(options, from, to).map((item) => item.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={options.map((option) => option.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {options.map((option, index) => (
            <OptionRow
              key={option.id}
              option={option}
              position={index}
              total={options.length}
              disabled={disabled}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={handleMove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
