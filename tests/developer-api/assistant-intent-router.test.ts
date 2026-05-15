import { describe, expect, it } from 'vitest'

import { routeAssistantIntent } from '@/lib/assistant/intent-router'

describe('routeAssistantIntent', () => {
  it('keeps explicit create image requests on generate-image', () => {
    expect(routeAssistantIntent({
      message: 'create an image for my post',
      selectedMode: 'create',
    })).toMatchObject({
      mode: 'create',
      action: 'generate_image',
      functionName: 'generate-image',
      confidence: 'high',
      needsClarification: false,
    })
  })

  it('routes carousel requests to generate-carousel', () => {
    expect(routeAssistantIntent({
      message: 'make a 5 slide carousel about AI automation',
      selectedMode: 'create',
    })).toMatchObject({
      mode: 'create',
      action: 'generate_carousel',
      functionName: 'generate-carousel',
    })
  })

  it('routes idea requests to generate-ideas', () => {
    expect(routeAssistantIntent({
      message: 'give me ten content ideas',
      selectedMode: 'ask',
    })).toMatchObject({
      mode: 'create',
      action: 'generate_ideas',
      functionName: 'generate-ideas',
    })
  })

  it('keeps improve mode visible for rewrite requests', () => {
    expect(routeAssistantIntent({
      message: 'rewrite this caption to be shorter',
      selectedMode: 'improve',
    })).toMatchObject({
      mode: 'improve',
      action: 'improve_text',
      functionName: 'chat-assistant',
    })
  })

  it('routes analytics questions to analyze mode', () => {
    expect(routeAssistantIntent({
      message: 'analyze my best posts this month',
      selectedMode: 'ask',
    })).toMatchObject({
      mode: 'analyze',
      action: 'analyze_workspace',
      functionName: 'chat-assistant',
    })
  })

  it('routes automation management to operate mode', () => {
    expect(routeAssistantIntent({
      message: 'show my active automations',
      selectedMode: 'ask',
    })).toMatchObject({
      mode: 'operate',
      action: 'inspect_automations',
      functionName: 'chat-assistant',
    })
  })

  it('uses selected mode for ambiguous short input', () => {
    expect(routeAssistantIntent({
      message: 'help me',
      selectedMode: 'operate',
    })).toMatchObject({
      mode: 'operate',
      action: 'general_chat',
      functionName: 'chat-assistant',
      confidence: 'low',
      needsClarification: true,
    })
  })
})
