import { Plugin } from "@opencode-ai/plugin"

interface TurnData {
  system_prompt: string[][]
  user: string[]
  assistant: string[]
  tools: any[]
  events: any[]
}

interface SessionJSONL {
  sessionID: string
  startTime: number
  endTime: number
  data: TurnData
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
}

interface Message {
  info: { role: string }
  parts: MessagePart[]
}

interface MessagePart {
  type: string
  text?: string
  input?: any
  output?: string
  time?: number
}

class LLMInterceptor {
  private currentSession: SessionJSONL | null = null
  private baseLogDir: string

  constructor(baseLogDir: string = "./logs/sessions") {
    this.baseLogDir = baseLogDir
    this.ensureSessionDir()
  }

  private ensureSessionDir() {
    try {
      Bun.mkdir(this.baseLogDir, { recursive: true })
    } catch (e) {
    }
  }

  private getLogFile(sessionID: string): string {
    return `${this.baseLogDir}/${sessionID}.jsonl`
  }

  public createSession(sessionID?: string): SessionJSONL {
    return {
      sessionID: sessionID || "",
      startTime: Date.now(),
      endTime: Date.now(),
      data: {
        system_prompt: [],
        user: [],
        assistant: [],
        tools: [],
        events: []
      }
    }
  }

  public ensureCurrentSession(sessionID?: string): SessionJSONL {
    // console.log("ensureCurrentSession", sessionID)
    if (!this.currentSession) {
      this.currentSession = this.createSession()
    }
    if (sessionID) {
      this.currentSession.sessionID = sessionID
    }
    // console.log("currentSession", this.currentSession)
    return this.currentSession
  }

  public async writeSessionJSONL() {
    if (!this.currentSession) return
    // console.log("writeSessionJSONL", this.currentSession)
    if (!this.currentSession.sessionID) {
      this.currentSession.sessionID = `ses_${Date.now()}`
    }
    this.currentSession.endTime = Date.now()
    const logLine = JSON.stringify(this.currentSession) + "\n"
    await Bun.write(this.getLogFile(this.currentSession.sessionID), logLine, { createPath: true, append: true })
    // console.log("writeSessionJSONL done", this.currentSession)

    // this.currentSession = null
    // this.currentSession = this.createSession()
    // console.log("writeSessionJSONL done", this.currentSession)
  }

  public extractUserCommand(messages: Message[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].info.role === "user") {
        const textPart = messages[i].parts.find(p => p.type === "text")
        return textPart?.text || ""
      }
    }
    return ""
  }
}

export const FullLLMInterceptorPlugin: Plugin = async (ctx) => {
  const interceptor = new LLMInterceptor()

  return {
    "experimental.chat.system.transform": async (input, output) => {
      const session = interceptor.ensureCurrentSession(input.sessionID)
      session.data.system_prompt.push(output.system)
    },

    "chat.params": async (input, output) => {
      const session = interceptor.ensureCurrentSession(input.sessionID)
      session.data.events.push({
        type: "chat.params",
        temperature: output.temperature,
        topP: output.topP,
        topK: output.topK,
        options: output.options,
        model: input.model?.id,
        provider: input.provider?.info?.id,
      })
    },

    "experimental.chat.messages.transform": async (input, output) => {
      const command = interceptor.extractUserCommand(output.messages as any)
      
      const session = interceptor.ensureCurrentSession(input.sessionID)
      session.data.user.push(command)
      
      session.data.events.push({
        type: "experimental.chat.messages.transform",
        messageCount: output.messages.length,
        command: command,
        messages: output.messages.map(m => ({
          role: m.info.role,
          parts: m.parts.map(p => ({
            type: p.type,
            text: p.text || p.output || p.input || undefined,
            timestamp: p.time,
          })),
        })),
      })
    },

    "experimental.text.complete": async (input, output) => {
      const session = interceptor.ensureCurrentSession(input.sessionID)
      session.data.assistant.push(output.text)
    },

    "tool.execute.before": async (input, output) => {
      const session = interceptor.ensureCurrentSession(input.sessionID)
      session.data.tools.push({
        type: "before",
        tool: input.tool,
        args: output.args,
        callID: input.callID
      })
    },

    "tool.execute.after": async (input, output) => {
      const session = interceptor.ensureCurrentSession(input.sessionID)
      session.data.tools.push({
        type: "after",
        tool: input.tool,
        result: {
          title: output.title,
          output: output.output,
          metadata: output.metadata,
        },
        callID: input.callID
      })
      
    },

    event: async ({ event }) => {
      const payload = event
      const session = interceptor.ensureCurrentSession(event.sessionID)
      
      if (payload.type.startsWith("session")) {
        session.data.events.push(payload)
      }
      if (payload.type === "session.created" || payload.type === "session.deleted") {
        interceptor.ensureCurrentSession(payload.sessionID)
      }
      if (payload.type === "session.updated") {
        if (session.sessionID !== payload.sessionID) {
          await interceptor.writeSessionJSONL()
          interceptor.ensureCurrentSession(payload.sessionID)
        }
      }
      if (payload.type === "session.idle" || payload.type === "session.deleted") {
        await interceptor.writeSessionJSONL()
      }
    },
  }
}
