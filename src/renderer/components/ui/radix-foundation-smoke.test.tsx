/*
 * Where: src/renderer/components/ui/radix-foundation-smoke.test.tsx
 * What: Smoke tests for newly added Radix foundation wrappers.
 * Why: Issue #305 T3 gate — catch export/render regressions before consumers migrate.
 */

// @vitest-environment jsdom

import { createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Checkbox } from './checkbox'
import { Label } from './label'
import { RadioGroup, RadioGroupItem } from './radio-group'
import { Separator } from './separator'
import { Switch } from './switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

describe('radix foundation wrappers', () => {
  it('renders all new primitives with expected data-slot markers', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <div>
        <div className="peer">
          <Checkbox defaultChecked aria-label="checkbox" />
        </div>
        <Label htmlFor="s">Label</Label>
        <Switch id="s" defaultChecked aria-label="switch" />
        <RadioGroup defaultValue="a">
          <RadioGroupItem value="a" aria-label="A" />
        </RadioGroup>
        <Separator />
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
          </TabsList>
          <TabsContent value="one">Panel</TabsContent>
        </Tabs>
      </div>
    )

    await flush()

    expect(host.querySelector('[data-slot="checkbox"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="tabs"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="label"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="switch"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="radio-group"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="radio-group-item"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="separator"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="tabs-list"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="tabs-trigger"]')).not.toBeNull()
    expect(host.querySelector('[data-slot="tabs-content"]')).not.toBeNull()
  })

  it('passes disabled and className props through wrapper roots', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <div>
        <Checkbox className="t-checkbox" disabled aria-label="checkbox" />
        <Switch className="t-switch" disabled aria-label="switch" />
        <RadioGroup>
          <RadioGroupItem className="t-radio-item" value="v" disabled aria-label="radio" />
        </RadioGroup>
        <Label className="t-label" htmlFor="target-id">
          Label
        </Label>
        <Tabs className="t-tabs" defaultValue="one">
          <TabsList className="t-tabs-list">
            <TabsTrigger className="t-tabs-trigger" value="one">
              One
            </TabsTrigger>
          </TabsList>
          <TabsContent className="t-tabs-content" value="one">
            Panel
          </TabsContent>
        </Tabs>
      </div>
    )
    await flush()

    expect(host.querySelector('[data-slot="checkbox"]')?.className).toContain('t-checkbox')
    expect(host.querySelector('[data-slot="checkbox"]')?.hasAttribute('disabled')).toBe(true)
    expect(host.querySelector('[data-slot="switch"]')?.className).toContain('t-switch')
    expect(host.querySelector('[data-slot="switch"]')?.hasAttribute('disabled')).toBe(true)
    expect(host.querySelector('[data-slot="radio-group-item"]')?.className).toContain('t-radio-item')
    expect(host.querySelector('[data-slot="radio-group-item"]')?.hasAttribute('disabled')).toBe(true)
    expect(host.querySelector('[data-slot="label"]')?.className).toContain('t-label')
    expect(host.querySelector('[data-slot="label"]')?.getAttribute('for')).toBe('target-id')
    expect(host.querySelector('[data-slot="tabs"]')?.className).toContain('t-tabs')
    expect(host.querySelector('[data-slot="tabs-list"]')?.className).toContain('t-tabs-list')
    expect(host.querySelector('[data-slot="tabs-trigger"]')?.className).toContain('t-tabs-trigger')
    expect(host.querySelector('[data-slot="tabs-content"]')?.className).toContain('t-tabs-content')
  })

  it('renders vertical separator classes when orientation is vertical', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<Separator orientation="vertical" />)
    await flush()

    const separator = host.querySelector('[data-slot="separator"]')
    expect(separator?.className).toContain('h-full')
    expect(separator?.className).toContain('w-px')
  })

  it('renders horizontal separator classes by default and supports className passthrough', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<Separator className="t-separator" />)
    await flush()

    const separator = host.querySelector('[data-slot="separator"]')
    expect(separator?.className).toContain('h-px')
    expect(separator?.className).toContain('w-full')
    expect(separator?.className).toContain('t-separator')
  })

  it('forwards refs to wrapper root nodes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const checkboxRef = createRef<HTMLButtonElement>()
    const labelRef = createRef<HTMLLabelElement>()
    const radioGroupRef = createRef<HTMLDivElement>()
    const radioItemRef = createRef<HTMLButtonElement>()
    const separatorRef = createRef<HTMLDivElement>()
    const switchRef = createRef<HTMLButtonElement>()
    const tabsRef = createRef<HTMLDivElement>()
    const tabsListRef = createRef<HTMLDivElement>()
    const tabsTriggerRef = createRef<HTMLButtonElement>()
    const tabsContentRef = createRef<HTMLDivElement>()

    root.render(
      <div>
        <Checkbox ref={checkboxRef} aria-label="checkbox" />
        <Label ref={labelRef}>Label</Label>
        <RadioGroup ref={radioGroupRef} defaultValue="a">
          <RadioGroupItem ref={radioItemRef} value="a" aria-label="A" />
        </RadioGroup>
        <Separator ref={separatorRef} />
        <Switch ref={switchRef} aria-label="switch" />
        <Tabs ref={tabsRef} defaultValue="one">
          <TabsList ref={tabsListRef}>
            <TabsTrigger ref={tabsTriggerRef} value="one">
              One
            </TabsTrigger>
          </TabsList>
          <TabsContent ref={tabsContentRef} value="one">
            Panel
          </TabsContent>
        </Tabs>
      </div>
    )

    await flush()

    expect(checkboxRef.current).not.toBeNull()
    expect(labelRef.current).not.toBeNull()
    expect(radioGroupRef.current).not.toBeNull()
    expect(radioItemRef.current).not.toBeNull()
    expect(separatorRef.current).not.toBeNull()
    expect(switchRef.current).not.toBeNull()
    expect(tabsRef.current).not.toBeNull()
    expect(tabsListRef.current).not.toBeNull()
    expect(tabsTriggerRef.current).not.toBeNull()
    expect(tabsContentRef.current).not.toBeNull()
  })
})
