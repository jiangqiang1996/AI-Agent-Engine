import type { GraphParserResult } from './graph-schema.js'

export interface GraphParser {
  readonly name: string
  readonly language: string
  readonly extensions: readonly string[]
  canParse(filePath: string): boolean
  parse(filePath: string, content: string, worktree: string): GraphParserResult
}

export class ParserRegistry {
  private parsers: GraphParser[] = []

  register(parser: GraphParser): void {
    this.parsers.push(parser)
  }

  findParser(filePath: string): GraphParser | undefined {
    return this.parsers.find((parser) => parser.canParse(filePath))
  }

  getAllParsers(): readonly GraphParser[] {
    return this.parsers
  }
}
