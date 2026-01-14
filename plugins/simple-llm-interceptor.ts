import { Plugin } from "@opencode-ai/plugin"

export const SimpleLLMInterceptorPlugin: Plugin = async (ctx) => {
  const logDir = "/tmp/opencode-logs"
  const logFile = `${logDir}/intercepted-prompts.jsonl`

  await Bun.write(logFile, "")

  const log = async (data: any) => {
    const entry = {
      timestamp: Date.now(),
      ...data,
    }
    await Bun.write(logFile, JSON.stringify(entry) + "\n", { createPath: true })
    console.log("[SIMPLE-INTERCEPTOR]", JSON.stringify(entry).substring(0, 200))
  }

  return {
    "experimental.chat.system.transform": async (input, output) => {
      console.log("\n=== SYSTEM PROMPT ===")
      console.log(output.system.join("\n"))
      console.log("===================\n")
    },

    "experimental.chat.messages.transform": async (input, output) => {
      console.log("\n=== FULL PROMPT ===")
      console.log(`Messages: ${output.messages.length}`)

      for (const msg of output.messages) {
        console.log(`\n[${msg.info.role}]`)
        for (const part of msg.parts) {
          if (part.text) {
            console.log(part.text.substring(0, 500))
            if (part.text.length > 500) console.log("... (truncated)")
          } else if (part.type === "tool-call") {
            console.log(`Tool: ${part.toolName}`, JSON.stringify(part.input))
          } else if (part.type === "tool-result") {
            console.log(`Tool Result:`, part.output?.substring(0, 200))
          }
        }
      }
      console.log("\n==================\n")

      await log({
        type: "prompt",
        messageCount: output.messages.length,
        messages: output.messages.map(m => ({
          role: m.info.role,
          parts: m.parts.map(p => ({
            type: p.type,
            text: p.text || p.output || p.input,
          })),
        })),
      })
    },

    "experimental.text.complete": async (input, output) => {
      console.log("\n=== LLM RESPONSE ===")
      console.log(output.text)
      console.log("===================\n")

      await log({
        type: "response",
        text: output.text,
        length: output.text.length,
      })
    },

    "tool.execute.before": async (input, output) => {
      console.log(`[TOOL CALL] ${input.tool}:`, JSON.stringify(output.args))
    },

    "tool.execute.after": async (input, output) => {
      console.log(`[TOOL RESULT] ${input.tool}:`, output.output.substring(0, 200))
    },
  }
}
