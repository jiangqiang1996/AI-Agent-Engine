const SENSITIVE_HEADER_PATTERN = /^\s*(?:[-*]\s*)?(?:[^:：]*\b(?:authorization|token|api[_-]?key|apikey|secret|password|set-cookie|cookie)\b[^:：]*[:：]|.*\bbearer\s+)/i
const URL_SECRET_PATTERN = /([?&][^=]*(?:token|api[_-]?key|apikey|secret|password|authorization)[^=]*=)[^&#\s)]+/gi
const URL_USERINFO_PATTERN = /(https?:\/\/)([^@/\s'"]+)@/gi

export function redactSwaggerOutput(output: string): string {
  return output
    .replace(URL_USERINFO_PATTERN, '$1[已脱敏]@')
    .replace(URL_SECRET_PATTERN, '$1[已脱敏]')
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('#') || !SENSITIVE_HEADER_PATTERN.test(line)) {
        return line
      }

      const redacted = line.replace(/([:：]\s*)([^']*)('?)$/, '$1[已脱敏]$3')
      return redacted === line ? '[已脱敏]' : redacted
    })
    .join('\n')
}
