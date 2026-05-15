import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..', '..')
const distDir = join(__dirname, '..', 'dist')
const targetDir = join(projectRoot, 'src', 'assets', 'skills', 'ae-graph-build', 'references')

// Data files that should NOT be copied to references
const dataExcludes = ['graph.json', 'version-1']

function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
  }

  for (const entry of readdirSync(src)) {
    if (dataExcludes.includes(entry)) {
      continue
    }

    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    const stat = statSync(srcPath)

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      mkdirSync(dirname(destPath), { recursive: true })
      copyFileSync(srcPath, destPath)
      console.log(`Copied: ${relative(projectRoot, srcPath)} -> ${relative(projectRoot, destPath)}`)
    }
  }
}

console.log('Copying graph preview build to references...')
copyDir(distDir, targetDir)
console.log('Done.')
