import {Effect} from 'effect'
import type {ToolContext} from '@opencode-ai/plugin/tool'

import type {SessionExtractResult} from './session-extract.service.js'
import {createNewSession, formatSystemPrompt, injectContextAsMessage, navigateToSession} from './session.service.js'

class HandoffError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'HandoffError'
    }
}

class SessionCreateError extends HandoffError {
    constructor(message: string) {
        super(`创建新会话失败: ${message}`)
    }
}

class ContextInjectError extends HandoffError {
    constructor(message: string) {
        super(`注入上下文失败: ${message}`)
    }
}

function generateHandoffTitle(extractResult: SessionExtractResult): string {
    // 优先级：核心结论 > 待办事项 > 已做决策 > 项目上下文
    let content = extractResult.coreConclusions.trim()
        || extractResult.todoItems.trim()
        || extractResult.decisionsMade.trim()
        || extractResult.projectContext.trim()

    // 压缩内容，去掉换行和多余空格，取前15字
    const compressed = content.replace(/\s+/g, ' ').slice(0, 15).trim()
    if (compressed) {
        return `交接：${compressed}${compressed.length >= 15 ? '...' : ''}`
    }
    // 兜底使用日期
    return `交接会话: ${new Date().toLocaleString('zh-CN')}`
}

function createSessionWithFallback(
    sessionTitle: string,
    extractResult: SessionExtractResult,
    client: any
): Effect.Effect<{ id: string; url: string; fallback: boolean }, SessionCreateError | ContextInjectError> {
    const systemPrompt = formatSystemPrompt(extractResult)

    return Effect.tryPromise(async () => {
        const session = await Effect.runPromise(createNewSession(client, {title: sessionTitle}))

        try {
            await client.session.prompt({
                path: {id: session.id},
                body: {
                    noReply: true,
                    system: systemPrompt,
                    parts: [{type: 'text', text: systemPrompt}],
                },
            })
        } catch (_e: any) {
            await Effect.runPromise(injectContextAsMessage(client, session.id, extractResult))
        }

        // 导航 TUI 到新会话窗口
        try {
            await Effect.runPromise(navigateToSession(client, session.id))
        } catch (_e: any) {
            // TUI 导航失败不影响交接结果，用户可手动切换
        }

        return {id: session.id, url: session.url, fallback: false}
    }).pipe(Effect.mapError(e => {
        if (e.message.includes('创建新会话')) return new SessionCreateError(e.message)
        return new ContextInjectError(e.message)
    }))
}

export interface HandoffResult {
    success: boolean
    sessionId?: string
    sessionUrl?: string
    fallbackMode?: boolean
    navigated?: boolean
    extractedSummary: {
        coreConclusions: string
        decisionsMade: string
        todoItems: string
        projectContext: string
        techStack: string
        riskNotes: string
        dependencies: string
        references: string
        assignees: string
        deadlines: string
        debugInfo: string
        truncated?: boolean
    }
    error?: string
}


export function executeHandoff(
    context: ToolContext,
    client: any,
    extractResult: SessionExtractResult
): Effect.Effect<HandoffResult, Error> {
    return Effect.tryPromise(async () => {
        try {
            const sessionResult = await Effect.runPromise(createSessionWithFallback(
                generateHandoffTitle(extractResult),
                extractResult,
                client
            ))

            return {
                success: true,
                sessionId: sessionResult.id,
                sessionUrl: sessionResult.url,
                fallbackMode: sessionResult.fallback,
                navigated: true,
                extractedSummary: {
                    coreConclusions: extractResult.coreConclusions,
                    decisionsMade: extractResult.decisionsMade,
                    todoItems: extractResult.todoItems,
                    projectContext: extractResult.projectContext,
                    techStack: extractResult.techStack,
                    riskNotes: extractResult.riskNotes,
                    dependencies: extractResult.dependencies,
                    references: extractResult.references,
                    assignees: extractResult.assignees,
                    deadlines: extractResult.deadlines,
                    debugInfo: extractResult.debugInfo,
                    truncated: !!extractResult.truncatedWarning
                }
            }
        } catch (e: any) {
            return {
                success: false,
                error: e.message,
                extractedSummary: {
                    coreConclusions: '',
                    decisionsMade: '',
                    todoItems: '',
                    projectContext: '',
                    techStack: '',
                    riskNotes: '',
                    dependencies: '',
                    references: '',
                    assignees: '',
                    deadlines: '',
                    debugInfo: ''
                }
            }
        }
    })
}
