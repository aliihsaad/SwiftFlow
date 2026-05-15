export const ASSISTANT_MOBILE_BREAKPOINT = 768

export function isAssistantMobileWidth(width: number): boolean {
  return width < ASSISTANT_MOBILE_BREAKPOINT
}
