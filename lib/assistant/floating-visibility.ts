export function shouldHideFloatingAssistant(pathname: string | null): boolean {
  return pathname === "/dashboard/assistant" || Boolean(pathname?.startsWith("/dashboard/assistant/"))
}
