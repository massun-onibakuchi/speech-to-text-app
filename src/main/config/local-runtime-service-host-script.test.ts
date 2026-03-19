import { describe, expect, it } from 'vitest'
import { buildLocalRuntimeServiceHostScript } from './local-runtime-service-host-script'

describe('buildLocalRuntimeServiceHostScript', () => {
  it('injects auth guards for both http and websocket requests', () => {
    const script = buildLocalRuntimeServiceHostScript()

    expect(script).toContain('DICTA_SERVICE_TOKEN')
    expect(script).toContain('scope_type not in ("http", "websocket")')
    expect(script).toContain('status_code=401')
    expect(script).toContain('"type": "websocket.close"')
  })
})
