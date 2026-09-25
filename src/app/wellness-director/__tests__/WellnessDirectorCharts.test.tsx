import React from 'react'
import { ParticipantAxisTick } from '../WellnessDirectorCharts'

const data = [
  { id: 'P1', name: 'Alex Able', value: 68, color: '#69BE28' },
]

describe('ParticipantAxisTick', () => {
  test('selects the participant when their name is clicked', () => {
    const onSelect = jest.fn()
    const tick = ParticipantAxisTick({
      x: 100,
      y: 20,
      index: 0,
      payload: { value: 'Alex Able' },
      data,
      onSelect,
    })

    tick.props.onClick()

    expect(onSelect).toHaveBeenCalledWith('P1')
    expect(tick.props.role).toBe('button')
    expect(tick.props['aria-label']).toBe('Select Alex Able')
  })

  test.each(['Enter', ' '])('selects the participant with the %p key', (key) => {
    const onSelect = jest.fn()
    const preventDefault = jest.fn()
    const tick = ParticipantAxisTick({
      x: 100,
      y: 20,
      index: 0,
      payload: { value: 'Alex Able' },
      data,
      onSelect,
    })

    tick.props.onKeyDown({ key, preventDefault })

    expect(preventDefault).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('P1')
  })
})
