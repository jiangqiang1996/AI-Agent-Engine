import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { AgentBrowserProofSchema, type AgentBrowserProof } from '../schemas/agent-browser-proof-schema.js'

const PROOF_DIR = 'ae'
const PROOF_FILENAME = 'agent-browser-proof.json'

export type AgentBrowserVersionReader = () => string

function proofPath(worktree: string): string {
  return join(worktree, PROOF_DIR, PROOF_FILENAME)
}

export function hashAgentBrowserOutput(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
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

  try {
    return versionReader().trim() === proof.agentBrowserVersion.trim()
  } catch {
    return false
  }
}
