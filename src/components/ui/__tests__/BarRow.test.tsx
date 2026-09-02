import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarRow } from '../index'

describe('BarRow', () => {
  test('shows the full label text on hover via a title attribute', () => {
    const markup = renderToStaticMarkup(
      <BarRow label="Extremely long engagement component label that gets truncated" value={42} />
    )

    expect(markup).toContain('title="Extremely long engagement component label that gets truncated"')
  })
})
