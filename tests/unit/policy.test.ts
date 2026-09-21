import { describe, expect, it } from 'vitest'
import {
  areOptionsEditable,
  availableTransitions,
  canTransition,
  canViewAttendanceDetail,
  canViewResults,
  evaluateVoting,
  getScheduleState,
  isPollEditable,
  isVisibleToVoters,
  percentage,
  resolveEffectiveStatus,
  type PollRuleState,
} from '../../src/shared/policy'

const NOW = new Date('2026-09-21T12:00:00.000Z')

function poll(overrides: Partial<PollRuleState> = {}): PollRuleState {
  return {
    status: 'ACTIVE',
    allowVoteChange: true,
    showLiveResults: false,
    showResultsAfterClose: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  }
}

describe('getScheduleState', () => {
  it('sin fechas, la ventana siempre esta abierta', () => {
    expect(getScheduleState(poll(), NOW)).toBe('OPEN')
  })

  it('detecta que aun no ha comenzado', () => {
    expect(getScheduleState(poll({ startsAt: '2026-09-21T18:00:00.000Z' }), NOW)).toBe('NOT_STARTED')
  })

  it('detecta que el plazo ha terminado', () => {
    expect(getScheduleState(poll({ endsAt: '2026-09-21T10:00:00.000Z' }), NOW)).toBe('ENDED')
  })

  it('ignora fechas corruptas en lugar de bloquear la votacion', () => {
    expect(getScheduleState(poll({ startsAt: 'no-es-una-fecha' }), NOW)).toBe('OPEN')
  })
})

describe('resolveEffectiveStatus', () => {
  it('abre una votacion programada cuando llega su hora', () => {
    const state = poll({ status: 'SCHEDULED', startsAt: '2026-09-21T10:00:00.000Z' })
    expect(resolveEffectiveStatus(state, NOW)).toBe('ACTIVE')
  })

  it('mantiene programada la que todavia no ha llegado', () => {
    const state = poll({ status: 'SCHEDULED', startsAt: '2026-09-21T18:00:00.000Z' })
    expect(resolveEffectiveStatus(state, NOW)).toBe('SCHEDULED')
  })

  it('cierra la activa cuyo plazo ha vencido', () => {
    const state = poll({ status: 'ACTIVE', endsAt: '2026-09-21T11:00:00.000Z' })
    expect(resolveEffectiveStatus(state, NOW)).toBe('CLOSED')
  })

  it('nunca abre un borrador, aunque tenga fecha de inicio pasada', () => {
    const state = poll({ status: 'DRAFT', startsAt: '2026-09-20T10:00:00.000Z' })
    expect(resolveEffectiveStatus(state, NOW)).toBe('DRAFT')
  })
})

describe('evaluateVoting', () => {
  const voter = { role: 'VOTER', userStatus: 'ACTIVE', hasVoted: false } as const

  it('permite votar en una votacion abierta sin voto previo', () => {
    const result = evaluateVoting(poll(), voter, NOW)
    expect(result).toEqual({ canVote: true, canChangeVote: false, blockReason: null })
  })

  it('permite cambiar el voto cuando la configuracion lo admite', () => {
    const result = evaluateVoting(poll({ allowVoteChange: true }), { ...voter, hasVoted: true }, NOW)
    expect(result.canVote).toBe(false)
    expect(result.canChangeVote).toBe(true)
    expect(result.blockReason).toBeNull()
  })

  it('bloquea el cambio cuando la votacion no lo permite', () => {
    const result = evaluateVoting(
      poll({ allowVoteChange: false }),
      { ...voter, hasVoted: true },
      NOW,
    )
    expect(result.canChangeVote).toBe(false)
    expect(result.blockReason).toBe('ALREADY_VOTED')
  })

  it('bloquea a los usuarios desactivados', () => {
    const result = evaluateVoting(poll(), { ...voter, userStatus: 'INACTIVE' }, NOW)
    expect(result.blockReason).toBe('USER_INACTIVE')
  })

  it('bloquea antes de la hora de inicio', () => {
    const state = poll({ status: 'SCHEDULED', startsAt: '2026-09-21T18:00:00.000Z' })
    expect(evaluateVoting(state, voter, NOW).blockReason).toBe('NOT_STARTED')
  })

  it('bloquea despues de la hora de finalizacion', () => {
    const state = poll({ status: 'ACTIVE', endsAt: '2026-09-21T11:00:00.000Z' })
    expect(evaluateVoting(state, voter, NOW).blockReason).toBe('CLOSED')
  })

  it('bloquea mientras la votacion sigue publicada pero no abierta', () => {
    expect(evaluateVoting(poll({ status: 'PUBLISHED' }), voter, NOW).blockReason).toBe('NOT_OPEN')
  })
})

describe('canViewResults', () => {
  it('el administrador siempre ve los resultados', () => {
    const state = poll({ showLiveResults: false, showResultsAfterClose: false })
    expect(canViewResults(state, 'ADMIN', NOW)).toBe(true)
  })

  it('el trabajador ve los resultados en vivo solo si estan activados', () => {
    expect(canViewResults(poll({ showLiveResults: false }), 'VOTER', NOW)).toBe(false)
    expect(canViewResults(poll({ showLiveResults: true }), 'VOTER', NOW)).toBe(true)
  })

  it('al cerrar, manda showResultsAfterClose', () => {
    const visible = poll({ status: 'CLOSED', showLiveResults: false, showResultsAfterClose: true })
    const hidden = poll({ status: 'CLOSED', showLiveResults: true, showResultsAfterClose: false })
    expect(canViewResults(visible, 'VOTER', NOW)).toBe(true)
    expect(canViewResults(hidden, 'VOTER', NOW)).toBe(false)
  })

  it('en borrador no hay resultados que ensenar al trabajador', () => {
    const state = poll({ status: 'DRAFT', showLiveResults: true })
    expect(canViewResults(state, 'VOTER', NOW)).toBe(false)
  })
})

describe('canViewAttendanceDetail', () => {
  it('solo el administrador ve el censo y la asistencia', () => {
    expect(canViewAttendanceDetail('ADMIN')).toBe(true)
    expect(canViewAttendanceDetail('VOTER')).toBe(false)
  })

  it('no depende de la configuracion: ver el reparto no da derecho al censo', () => {
    // Aunque la votacion ensene resultados en vivo y ya este cerrada.
    const abierta = poll({ showLiveResults: true })
    expect(canViewResults(abierta, 'VOTER', NOW)).toBe(true)
    expect(canViewAttendanceDetail('VOTER')).toBe(false)
  })
})

describe('visibilidad y edicion', () => {
  it('el borrador no es visible para los trabajadores', () => {
    expect(isVisibleToVoters(poll({ status: 'DRAFT' }), NOW)).toBe(false)
    expect(isVisibleToVoters(poll({ status: 'PUBLISHED' }), NOW)).toBe(true)
  })

  it('una votacion cerrada o archivada no se puede editar', () => {
    expect(isPollEditable('ACTIVE')).toBe(true)
    expect(isPollEditable('CLOSED')).toBe(false)
    expect(isPollEditable('ARCHIVED')).toBe(false)
  })

  it('la cartelera se bloquea al abrir la votacion', () => {
    expect(areOptionsEditable('DRAFT')).toBe(true)
    expect(areOptionsEditable('PUBLISHED')).toBe(true)
    expect(areOptionsEditable('ACTIVE')).toBe(false)
  })
})

describe('maquina de estados', () => {
  it('solo se publica desde borrador', () => {
    expect(canTransition('DRAFT', 'publish')).toBe(true)
    expect(canTransition('ACTIVE', 'publish')).toBe(false)
  })

  it('se abre desde publicada, programada o cerrada', () => {
    expect(canTransition('PUBLISHED', 'open')).toBe(true)
    expect(canTransition('SCHEDULED', 'open')).toBe(true)
    expect(canTransition('CLOSED', 'open')).toBe(true)
    expect(canTransition('DRAFT', 'open')).toBe(false)
  })

  it('una votacion archivada no admite votos ni se abre directamente', () => {
    expect(canTransition('ARCHIVED', 'open')).toBe(false)
    expect(availableTransitions('ARCHIVED')).toEqual(['reopen'])
  })
})

describe('percentage', () => {
  it('evita la division por cero', () => {
    expect(percentage(0, 0)).toBe(0)
  })

  it('redondea a un decimal', () => {
    expect(percentage(1, 3)).toBe(33.3)
    expect(percentage(18, 40)).toBe(45)
  })
})
