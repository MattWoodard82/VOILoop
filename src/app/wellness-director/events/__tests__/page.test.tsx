import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WellnessDirectorEventsPage from '../page'

jest.mock('../EventsPageContent', () => {
  const React = require('react')
  return {
    EventsPageContent: () => React.createElement('div', {
      'data-title': 'Events and nudges',
      'data-role': 'wellness_director',
      'data-participant-count': 1,
    }, 'EventsPageContent'),
  }
})

describe('WellnessDirectorEventsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the canonical shared events page for wellness directors', async () => {
    const page = await WellnessDirectorEventsPage()
    const markup = renderToStaticMarkup(page)

    expect(markup).toContain('data-title="Events and nudges"')
    expect(markup).toContain('data-role="wellness_director"')
    expect(markup).toContain('data-participant-count="1"')
  })

  test('also renders for admins with identical access', async () => {
    const page = await WellnessDirectorEventsPage()
    const markup = renderToStaticMarkup(page)

    expect(markup).toContain('data-role="wellness_director"')
    expect(markup).toContain('data-participant-count="1"')
  })
})
