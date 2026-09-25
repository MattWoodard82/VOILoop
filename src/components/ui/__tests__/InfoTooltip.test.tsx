import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InfoTooltip } from '../InfoTooltip'

describe('InfoTooltip', () => {
  test('renders an accessible button for a supplied definition', () => {
    const markup = renderToStaticMarkup(
      <InfoTooltip definition={{
        label: 'Average HRV',
        whatItIs: 'Average HRV across contributing nights.',
      }} />,
    )

    expect(markup).toContain('type="button"')
    expect(markup).toContain('aria-label="What is Average HRV?"')
    expect(markup).toContain('aria-expanded="false"')
  })
})
