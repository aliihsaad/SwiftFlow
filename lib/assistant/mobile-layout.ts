export const ASSISTANT_MOBILE_BREAKPOINT = 768
export const ASSISTANT_MOBILE_SHELL_CLASS = "h-[calc(100dvh-7.5rem)] max-w-none border-0"

export function isAssistantMobileWidth(width: number): boolean {
  return width < ASSISTANT_MOBILE_BREAKPOINT
}
