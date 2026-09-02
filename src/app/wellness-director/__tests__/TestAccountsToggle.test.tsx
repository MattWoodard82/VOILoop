import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mockPush = jest.fn()
const mockUsePathname = jest.fn()
const mockUseSearchParams = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}))

// TestAccountsToggle's onChange handler is a plain closure created each render,
// so it's invoked directly by calling the component function ourselves and
// walking the returned element tree for the `input` node — no DOM/testing-library
// needed given this project's testEnvironment: 'node' Jest setup (matches the
// pattern used by EventsNudgeCard.test.tsx and similar tests in this repo).
function findInput(node: unknown): { props: { checked: boolean; onChange: (e: unknown) => void } } | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findInput(child)
      if (found) return found
    }
    return null
  }
  const element = node as { type?: unknown; props?: { children?: unknown } }
  if (element.type === 'input') {
    return element as unknown as { props: { checked: boolean; onChange: (e: unknown) => void } }
  }
  if (element.props) {
    return findInput(element.props.children)
  }
  return null
}

describe('TestAccountsToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePathname.mockReturnValue('/wellness-director')
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
  })

  test('defaults to checked (excluded) when includeTestAccounts is not set', async () => {
    const { TestAccountsToggle } = await import('../TestAccountsToggle')
    const markup = renderToStaticMarkup(React.createElement(TestAccountsToggle))
    expect(markup).toContain('checked=""')
    expect(markup).toContain('Exclude test &amp; pilot accounts')
  })

  test('is unchecked when includeTestAccounts=1 is already set', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('includeTestAccounts=1'))
    const { TestAccountsToggle } = await import('../TestAccountsToggle')
    const markup = renderToStaticMarkup(React.createElement(TestAccountsToggle))
    expect(markup).not.toContain('checked=""')
  })

  test('unchecking navigates to the same path with includeTestAccounts=1', async () => {
    const { TestAccountsToggle } = await import('../TestAccountsToggle')
    const element = TestAccountsToggle() as unknown
    const input = findInput(element)
    expect(input).not.toBeNull()

    input!.props.onChange({ target: { checked: false } })

    expect(mockPush).toHaveBeenCalledWith('/wellness-director?includeTestAccounts=1')
  })

  test('re-checking removes includeTestAccounts from the URL', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('includeTestAccounts=1'))
    const { TestAccountsToggle } = await import('../TestAccountsToggle')
    const element = TestAccountsToggle() as unknown
    const input = findInput(element)
    expect(input).not.toBeNull()

    input!.props.onChange({ target: { checked: true } })

    expect(mockPush).toHaveBeenCalledWith('/wellness-director')
  })
})
