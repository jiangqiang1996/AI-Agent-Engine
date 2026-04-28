const SENSITIVE_PATTERN = /(authorization|token|api[_-]?key|apikey|secret|password|cookie|set-cookie|bearer\s+)/i

export function redactSwaggerOutput(output: string): string {
  return output
    .split('\n')
    .map((line) => {
      if (!SENSITIVE_PATTERN.test(line)) {
        return line
      }

      const redacted = line.replace(/([:：]\s*).+$/, '$1[已脱敏]')
      return redacted === line ? '[已脱敏]' : redacted
    })
    .join('\n')
}
