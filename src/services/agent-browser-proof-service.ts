import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { AgentBrowserProofSchema, type AgentBrowserProof } from '../schemas/agent-browser-proof-schema.js'

const PROOF_DIR = 'ae'
const PROOF_FILENAME = 'agent-browser-proof.json'

const REQUIRED_VALIDATION_COMMANDS = [
  'agent-browser --version',
  'agent-browser --help',
  'agent-browser skills get core --full',
] as const

export type AgentBrowserVersionReader = () => string

export interface AgentBrowserValidationCommandResult {
  command: string
  exitCode: number
  output: string
  executedAt: string
}

function proofPath(worktree: string): string {
  return join(worktree, PROOF_DIR, PROOF_FILENAME)
}

export function hashAgentBrowserOutput(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function getRequiredAgentBrowserValidationCommands(): readonly string[] {
  return REQUIRED_VALIDATION_COMMANDS
}

function hasRequiredValidationResults(proof: AgentBrowserProof): boolean {
  const successfulCommands = new Set(
    proof.validationResults
      .filter((result) => result.exitCode === 0 && result.outputHash.trim().length > 0)
      .map((result) => result.command.trim()),
  )
  return REQUIRED_VALIDATION_COMMANDS.every((command) => successfulCommands.has(command))
}

export function writeAgentBrowserProof(worktree: string, proof: AgentBrowserProof): void {
  const dir = join(worktree, PROOF_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(proofPath(worktree), JSON.stringify(proof, null, 2), 'utf8')
}

export function readAgentBrowserProof(worktree: string): AgentBrowserProof | null {
  const path = proofPath(worktree)
  try {
    const raw = readFileSync(path, 'utf8')
    const result = AgentBrowserProofSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function readAgentBrowserVersion(): string {
  return execFileSync('agent-browser', ['--version'], { encoding: 'utf8' }).trim()
}

export function runAgentBrowserValidationCommands(): AgentBrowserValidationCommandResult[] {
  return REQUIRED_VALIDATION_COMMANDS.map((command) => {
    const args = command === 'agent-browser skills get core --full' ? ['skills', 'get', 'core', '--full'] : [command.replace('agent-browser ', '')]
    const executedAt = new Date().toISOString()
    try {
      return {
        command,
        exitCode: 0,
        output: execFileSync('agent-browser', args, { encoding: 'utf8', timeout: 10_000 }).trim(),
        executedAt,
      }
    } catch (error) {
      const failure = error as { status?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown }
      const status = typeof failure.status === 'number' ? failure.status : 1
      const output = [failure.stdout, failure.stderr, failure.message].filter((item): item is string => typeof item === 'string' && item.length > 0).join('\n').trim()
      return { command, exitCode: status, output, executedAt }
    }
  })
}

export function isAgentBrowserProofCompleted(
  worktree: string,
  versionReader: AgentBrowserVersionReader = readAgentBrowserVersion,
  worktreeFingerprint?: string,
): boolean {
  const proof = readAgentBrowserProof(worktree)
  if (!proof) {
    return false
  }

  if (worktreeFingerprint && proof.worktreeFingerprint !== worktreeFingerprint) {
    return false
  }

  if (!hasRequiredValidationResults(proof)) {
    return false
  }

  try {
    return versionReader().trim() === proof.agentBrowserVersion.trim()
  } catch {
    return false
  }
}
