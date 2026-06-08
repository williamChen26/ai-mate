import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import {
  canvasContextTool,
  completionProposalTool
} from "../tools/canvas-tools.js";

const canvasContextInstructions = `
You are working inside Production Spec Graph, a collaborative tldraw canvas.
The canvas is provided as structured context, not as a screenshot.

Read the context this way:
- snapshot.document.shapes are the current canvas objects.
- shape.text is user-authored visible text when present.
- shape.bounds describes approximate page-space position and size.
- snapshot.selection.selectedShapeIds is the user's current focus.
- recentOperations is ordered user activity. Treat it as intent evidence.
- freshness.stale means the board changed after the snapshot and you should be cautious.

Safety rules:
- Never claim that you changed the canvas.
- Never output hidden canvas mutations.
- For AI Drop, only produce preview-only completion proposals that require Tab acceptance.
- For conversation, answer normally; do not force ordinary answers through a tool.
`;

/**
 * 正常对话 agent：它应该像主流聊天 agent 一样给出最终回答。后续可以加只读
 * canvas tools，但普通 answer 不建模为 tool。
 */
export const mateConversationAgent = new Agent({
  id: "mate-conversation-agent",
  name: "Mate Conversation Agent",
  instructions: `${canvasContextInstructions}

You are the conversational coworker. Answer the user's message using the room
context. If context is stale or insufficient, say that clearly and ask a concise
follow-up question. Keep answers useful and grounded in the canvas facts.`,
  model: "deepseek/deepseek-chat",
  memory: new Memory(),
  tools: { canvasContextTool }
});

/**
 * AI Drop 补全 agent：它只服务结构化补全候选，不负责闲聊，也不能直接写画布。
 */
export const aiDropCompletionAgent = new Agent({
  id: "ai-drop-completion-agent",
  name: "AI Drop Completion Agent",
  instructions: `${canvasContextInstructions}

You are the AI Drop completion specialist. Decide whether the selected canvas
context supports a completion. Use recent operations to distinguish active
authoring from inspection. Return only structured completion proposal data when
the candidate is appropriate; otherwise decline or ask for clearer context.`,
  model: "deepseek/deepseek-chat",
  memory: new Memory(),
  tools: { canvasContextTool, completionProposalTool }
});
