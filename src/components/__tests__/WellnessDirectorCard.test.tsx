import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

describe('WellnessDirectorCard', () => {
  test('renders the current nudge message when one is provided', async () => {
    const { WellnessDirectorCard } = await import('../WellnessDirectorCard')

    const markup = renderToStaticMarkup(
      React.createElement(WellnessDirectorCard, {
        name: 'Heather',
        nudge: {
          id: 'nudge-1',
          message: 'Hydrate before your afternoon workout.',
          author: 'Coach Heather',
          week_of: '2099-08-04',
        },
      }),
    )

    expect(markup).toContain('Heather')
    expect(markup).toContain('This week&#x27;s focus')
    expect(markup).toContain('Hydrate before your afternoon workout.')
  })

  test('falls back to the name-only display when no nudge is available', async () => {
    const { WellnessDirectorCard } = await import('../WellnessDirectorCard')

    const markup = renderToStaticMarkup(
      React.createElement(WellnessDirectorCard, {
        name: 'Heather',
        nudge: null,
      }),
    )

    expect(markup).toContain('Heather')
    expect(markup).not.toContain('This week&#x27;s focus')
    expect(markup).not.toContain('Hydrate before your afternoon workout.')
  })
})
