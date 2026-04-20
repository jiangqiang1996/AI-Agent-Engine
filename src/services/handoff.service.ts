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
    // 优先级：目标 > 已完成工作 > 待办任务 > 重要决策
    let content = extractResult.goal.trim()
        || extractResult.workCompleted.trim()
        || extractResult.pendingTasks.trim()
        || extractResult.importantDecisions.trim()

    // 压缩内容，去掉换行和多余空格，取前15字
    const compressed = content.replace(/\s+/g, ' ').slice(0, 15).trim()
    if (compressed) {
        return `交接：${compressed}${compressed.length >= 15 ? '...' : ''}`
    }
    // 兜底使用日期
    return `交接会话：${new Date().toLocaleString('zh-CN')}`
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
        userRequests: string
        goal: string
        workCompleted: string
        currentState: string
        pendingTasks: string
        keyFiles: string
        importantDecisions: string
        explicitConstraints: string
        contextForContinuation: string
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
                    userRequests: extractResult.userRequests,
                    goal: extractResult.goal,
                    workCompleted: extractResult.workCompleted,
                    currentState: extractResult.currentState,
                    pendingTasks: extractResult.pendingTasks,
                    keyFiles: extractResult.keyFiles,
                    importantDecisions: extractResult.importantDecisions,
                    explicitConstraints: extractResult.explicitConstraints,
                    contextForContinuation: extractResult.contextForContinuation,
                    truncated: !!extractResult.truncatedWarning
                }
            }
        } catch (e: any) {
            return {
                success: false,
                error: e.message,
                extractedSummary: {
                    userRequests: "None",
                    goal: "None",
                    workCompleted: "None",
                    currentState: "None",
                    pendingTasks: "None",
                    keyFiles: "None",
                    importantDecisions: "None",
                    explicitConstraints: "None",
                    contextForContinuation: "None"
                }
            }
        }
    })
}
