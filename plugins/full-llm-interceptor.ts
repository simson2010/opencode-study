import { Plugin } from "@opencode-ai/plugin"

interface SessionData {
  sessionID: string
  startTime: number
  endTime?: number
  command?: string
  response?: string
  tools: number
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
}

interface SessionLogEntry {
  timestamp: number
  type: "command" | "response" | "tool" | "event"
  data: any
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
   private sessions: Map<string, SessionData>
   private baseLogDir: string
   private fileHandles: Map<string, number>

   constructor(baseLogDir: string = "./logs/sessions") {
     this.sessions = new Map()
     this.fileHandles = new Map()
     this.baseLogDir = baseLogDir
     this.ensureSessionDir()
   }

   private ensureSessionDir() {
     try {
       Bun.mkdir(this.baseLogDir, { recursive: true })
     } catch (e) {
       // Directory already exists or error occurred, continue
     }
   }

   private getLogFile(sessionID: string): string {
     return `${this.baseLogDir}/${sessionID}.jsonl`
   }

   private async log(type: "command" | "response" | "tool" | "event", data: any, sessionID: string) {
     if (!this.sessions.has(sessionID)) {
       this.sessions.set(sessionID, {
         sessionID,
         startTime: Date.now(),
         tools: 0,
       })
     }

     const entry: SessionLogEntry = {
       timestamp: Date.now(),
       type,
       data,
     }

      const logFile = this.getLogFile(sessionID)
      const logLine = JSON.stringify(entry) + "\n"

      await Bun.write(logFile, logLine, { createPath: true, append: true })
   }

  public getSession(sessionID: string): SessionData | undefined {
    return this.sessions.get(sessionID)
  }

  public listSessions(): SessionData[] {
    return Array.from(this.sessions.values())
  }

  private extractUserCommand(messages: Message[]): string {
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
      const sessionID = input.sessionID || "default"
      await interceptor.log("command", {
        hook: "experimental.chat.system.transform",
        system: output.system,
      }, sessionID)
    },

    "chat.params": async (input, output) => {
      const sessionID = input.sessionID || "default"
      await interceptor.log("command", {
        hook: "chat.params",
        temperature: output.temperature,
        topP: output.topP,
        topK: output.topK,
        options: output.options,
        model: input.model?.id,
        provider: input.provider?.info?.id,
      }, sessionID)
    },

    "experimental.chat.messages.transform": async (input, output) => {
      const sessionID = input.sessionID || "default"
      
      const messages = output.messages.map(m => ({
        role: m.info.role,
        parts: m.parts.map(p => ({
          type: p.type,
          text: p.text || p.output || p.input || undefined,
          timestamp: p.time,
        })),
      }))

      const command = interceptor.extractUserCommand(output.messages as any)
      const session = interceptor.getSession(sessionID)
      if (session) {
        session.command = command
        session.tools = 0
      }

      await interceptor.log("command", {
        hook: "experimental.chat.messages.transform",
        type: "command",
        messageCount: messages.length,
        command: command,
        messages: messages,
      }, sessionID)
    },

    "experimental.text.complete": async (input, output) => {
      const sessionID = input.sessionID || "default"
      const session = interceptor.getSession(sessionID)
      
      if (session) {
        session.response = output.text
        session.endTime = Date.now()
      }

      await interceptor.log("response", {
        hook: "experimental.text.complete",
        type: "response",
        text: output.text,
        length: output.text.length,
      }, sessionID)
    },

    "tool.execute.before": async (input, output) => {
      const sessionID = input.sessionID || "default"
      const session = interceptor.getSession(sessionID)
      
      if (session) {
        session.tools++
      }

      await interceptor.log("tool", {
        hook: "tool.execute.before",
        type: "tool",
        tool: input.tool,
        args: output.args,
        callID: input.callID,
      }, sessionID)
    },

    "tool.execute.after": async (input, output) => {
      const sessionID = input.sessionID || "default"
      await interceptor.log("tool", {
        hook: "tool.execute.after",
        type: "tool",
        tool: input.tool,
        result: {
          title: output.title,
          output: output.output,
          metadata: output.metadata,
        },
        callID: input.callID,
      }, sessionID)
    },

    event: async ({ event }) => {
      const sessionID = event.sessionID || "default"
      const payload = event.payload

      if (payload.type === "text-delta") {
        await interceptor.log("event", {
          type: "text-delta",
          text: payload.text,
          messageID: payload.messageID,
          partID: payload.partID,
        }, sessionID)
      } else if (payload.type === "tool-call") {
        await interceptor.log("event", {
          type: "tool-call",
          toolName: payload.toolName,
          input: payload.input,
          messageID: payload.messageID,
          partID: payload.partID,
        }, sessionID)
      } else if (payload.type === "tool-result") {
        await interceptor.log("event", {
          type: "tool-result",
          output: payload.output,
          messageID: payload.messageID,
          partID: payload.partID,
        }, sessionID)
      } else if (payload.type === "step-finish") {
        const session = interceptor.getSession(sessionID)
        if (session) {
          session.tokens = payload.tokens
          if (payload.cost !== undefined) {
            session.cost = (session.cost || 0) + payload.cost
          }
        }

        await interceptor.log("event", {
          type: "step-finish",
          tokens: payload.tokens,
          cost: payload.cost,
          finish: payload.finish,
          messageID: payload.messageID,
        }, sessionID)
      }
    },
  }
}
