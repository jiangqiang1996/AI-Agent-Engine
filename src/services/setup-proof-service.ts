import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SetupProofSchema } from '../schemas/setup-proof-schema.js'

export type SetupProof = import('../schemas/setup-proof-schema.js').SetupProof

const PROOF_DIR = '.opencode/ae'
const PROOF_FILENAME = 'setup-proof.json'

function proofPath(worktree: string): string {
  return join(worktree, PROOF_DIR, PROOF_FILENAME)
}

export function writeSetupProof(worktree: string, proof: SetupProof): void {
  const dir = join(worktree, PROOF_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(proofPath(worktree), JSON.stringify(proof, null, 2), 'utf8')
}

export function readSetupProof(worktree: string): SetupProof | null {
  const path = proofPath(worktree)
  try {
    const raw = readFileSync(path, 'utf8')
    const result = SetupProofSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function isSetupCompleted(worktree: string, sessionId: string): boolean {
  const proof = readSetupProof(worktree)
  if (!proof) {
    return false
  }
  return proof.sessionId === sessionId
}
