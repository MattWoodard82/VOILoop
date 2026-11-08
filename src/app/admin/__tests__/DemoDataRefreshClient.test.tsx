import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DemoDataRefreshClient } from '../DemoDataRefreshClient'

let mockState: unknown[] = []
let mockIndex = 0
const mockBusy = { current: false }
const mockRefresh = jest.fn()
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: () => mockBusy,
  useState: (initial: unknown) => {
    const index = mockIndex++
    if (mockState[index] === undefined) mockState[index] = initial
    return [mockState[index], (value: unknown) => { mockState[index] = value }]
  },
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

type ElementProps = { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }

function render() {
  mockIndex = 0
  return DemoDataRefreshClient()
}
function buttons(node: React.ReactNode): React.ReactElement<ElementProps>[] {
  if (!React.isValidElement<ElementProps>(node)) return []
  if (node.type === 'button') return [node]
  return React.Children.toArray(node.props.children).flatMap(buttons)
}
async function flush() { await new Promise(resolve => setImmediate(resolve)) }

describe('Admin demo refresh control', () => {
  const savedFetch = global.fetch
  beforeEach(() => {
    mockState = []
    mockIndex = 0
    mockBusy.current = false
    mockRefresh.mockClear()
    global.fetch = jest.fn()
  })
  afterAll(() => { global.fetch = savedFetch })

  test('confirms scope before writing and cancellation sends no request', () => {
    let tree = render()
    expect(renderToStaticMarkup(tree)).toContain('Refresh demo data')
    buttons(tree)[0].props.onClick!()
    tree = render()
    expect(renderToStaticMarkup(tree)).toContain('Replace synthetic pulse history')
    buttons(tree)[1].props.onClick!()
    expect(renderToStaticMarkup(render())).not.toContain('Confirm refresh')
    expect(fetch).not.toHaveBeenCalled()
  })

  test('blocks duplicates while pending and displays committed success', async () => {
    let complete!: (response: Response) => void
    jest.mocked(fetch).mockReturnValue(new Promise(resolve => { complete = resolve }))
    buttons(render())[0].props.onClick!()
    const confirm = buttons(render())[0]
    confirm.props.onClick!()
    confirm.props.onClick!()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(buttons(render()).every(button => button.props.disabled)).toBe(true)
    expect(renderToStaticMarkup(render())).toContain('Refreshing demo data...')
    complete(new Response(JSON.stringify({ anchor: '2026-11-04', pulse_count: 400, recovery_count: 3000 })))
    await flush()
    expect(renderToStaticMarkup(render())).toContain('role="status"')
    expect(renderToStaticMarkup(render())).toContain('Refreshed to 2026-11-04')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  test.each(['server', 'network', 'invalid'])('shows an actionable %s error without success', async kind => {
    if (kind === 'network') jest.mocked(fetch).mockRejectedValue(new Error('Network unavailable'))
    else jest.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify(kind === 'server' ? { error: 'Demo cohort mismatch' } : {}),
      { status: kind === 'server' ? 500 : 200 },
    ))
    buttons(render())[0].props.onClick!()
    buttons(render())[0].props.onClick!()
    await flush()
    const markup = renderToStaticMarkup(render())
    expect(markup).toContain('role="alert"')
    expect(markup).not.toContain('role="status"')
    expect(buttons(render())[0].props.disabled).toBe(false)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
