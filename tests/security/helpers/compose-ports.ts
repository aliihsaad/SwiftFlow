/**
 * Minimal Compose port-mapping reader for security assertions.
 *
 * The staging stack is allowed exactly one host binding - the ingress on
 * loopback, reached only by the host's reverse proxy. Any mapping without an
 * explicit 127.0.0.1 host address would publish a service on a routable
 * interface, so these helpers exist to make that impossible to introduce
 * unnoticed.
 */

/** Every entry under a `ports:` key, with quotes stripped. */
export function composePortMappings(compose: string): string[] {
  const mappings: string[] = []
  let portsIndent: number | null = null

  for (const line of compose.split("\n")) {
    const portsKey = line.match(/^(\s*)ports:\s*$/)
    if (portsKey) {
      portsIndent = portsKey[1]!.length
      continue
    }

    if (portsIndent === null) continue

    const entry = line.match(/^(\s*)-\s*(.+?)\s*$/)
    if (entry && entry[1]!.length > portsIndent) {
      mappings.push(entry[2]!.replace(/^["']|["']$/g, ""))
      continue
    }

    if (line.trim() !== "") portsIndent = null
  }

  return mappings
}

/** A mapping is safe only when it binds an explicit loopback host address. */
export function isLoopbackMapping(mapping: string): boolean {
  return mapping.startsWith("127.0.0.1:") || mapping.startsWith("[::1]:")
}

/** The body of a single service block, used to assert per-service invariants. */
export function composeServiceBlock(compose: string, service: string): string {
  const lines = compose.split("\n")
  const startIndex = lines.findIndex((line) => new RegExp(`^(\\s*)${service}:\\s*$`).test(line))
  if (startIndex === -1) return ""

  const indent = lines[startIndex]!.match(/^(\s*)/)![1]!.length
  const rest = lines.slice(startIndex + 1)
  const endOffset = rest.findIndex((line) => {
    if (line.trim() === "") return false
    return (line.match(/^(\s*)/)![1]!.length) <= indent
  })

  return (endOffset === -1 ? rest : rest.slice(0, endOffset)).join("\n")
}
