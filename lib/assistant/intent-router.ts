import type {
  AssistantAction,
  AssistantFunctionName,
  AssistantIntent,
  AssistantMode,
} from '@/app/dashboard/assistant/assistant-types'

interface RouteAssistantIntentInput {
  message: string
  selectedMode: AssistantMode
  overrideFunctionName?: AssistantFunctionName | 'brand-images'
}

const IMAGE_WORDS = /\b(image|photo|picture|visual|graphic|thumbnail|cover)\b/i
const CAROUSEL_WORDS = /\b(carousel|slides?|slide deck)\b/i
const IDEA_WORDS = /\b(ideas?|topics?|hooks?|angles?)\b/i
const IMPROVE_WORDS = /\b(rewrite|improve|shorten|expand|tone|cta|hook|refine|better)\b/i
const ANALYZE_WORDS = /\b(analy[sz]e|analytics|performance|best posts?|views?|likes?|comments?|followers?|hashtags?|time)\b/i
const AUTOMATION_WORDS = /\b(automation|automations|workflow|trigger|dm reply|comment reply|active automations?)\b/i
const POST_WORDS = /\b(drafts?|scheduled posts?|schedule|post now|calendar)\b/i

function fallbackActionForMode(mode: AssistantMode): AssistantAction {
  switch (mode) {
    case 'create':
      return 'generate_caption'
    case 'improve':
      return 'improve_text'
    case 'analyze':
      return 'analyze_workspace'
    case 'operate':
      return 'general_chat'
    case 'ask':
    default:
      return 'general_chat'
  }
}

function functionForAction(action: AssistantAction): AssistantFunctionName {
  switch (action) {
    case 'generate_ideas':
      return 'generate-ideas'
    case 'generate_image':
      return 'generate-image'
    case 'generate_carousel':
      return 'generate-carousel'
    default:
      return 'chat-assistant'
  }
}

export function routeAssistantIntent(input: RouteAssistantIntentInput): AssistantIntent {
  const message = input.message.trim()
  const selectedMode = input.selectedMode || 'ask'

  if (input.overrideFunctionName === 'generate-image') {
    return {
      mode: 'create',
      action: 'generate_image',
      functionName: 'generate-image',
      confidence: 'high',
      needsClarification: false,
    }
  }

  if (input.overrideFunctionName === 'generate-carousel') {
    return {
      mode: 'create',
      action: 'generate_carousel',
      functionName: 'generate-carousel',
      confidence: 'high',
      needsClarification: false,
    }
  }

  if (input.overrideFunctionName === 'generate-ideas') {
    return {
      mode: 'create',
      action: 'generate_ideas',
      functionName: 'generate-ideas',
      confidence: 'high',
      needsClarification: false,
    }
  }

  if (CAROUSEL_WORDS.test(message)) {
    return { mode: 'create', action: 'generate_carousel', functionName: 'generate-carousel', confidence: 'high', needsClarification: false }
  }

  if (IMAGE_WORDS.test(message) && /\b(create|generate|make|design)\b/i.test(message)) {
    return { mode: 'create', action: 'generate_image', functionName: 'generate-image', confidence: 'high', needsClarification: false }
  }

  if (IDEA_WORDS.test(message) && /\b(generate|give|suggest|need|content)\b/i.test(message)) {
    return { mode: 'create', action: 'generate_ideas', functionName: 'generate-ideas', confidence: 'high', needsClarification: false }
  }

  if (IMPROVE_WORDS.test(message)) {
    return { mode: 'improve', action: 'improve_text', functionName: 'chat-assistant', confidence: 'high', needsClarification: false }
  }

  if (ANALYZE_WORDS.test(message)) {
    return { mode: 'analyze', action: 'analyze_workspace', functionName: 'chat-assistant', confidence: 'high', needsClarification: false }
  }

  if (AUTOMATION_WORDS.test(message)) {
    return { mode: 'operate', action: 'inspect_automations', functionName: 'chat-assistant', confidence: 'high', needsClarification: false }
  }

  if (POST_WORDS.test(message)) {
    return { mode: 'operate', action: 'inspect_posts', functionName: 'chat-assistant', confidence: 'medium', needsClarification: false }
  }

  const action = fallbackActionForMode(selectedMode)
  return {
    mode: selectedMode,
    action,
    functionName: functionForAction(action),
    confidence: message.length < 18 ? 'low' : 'medium',
    needsClarification: message.length < 18 && selectedMode !== 'ask',
  }
}
