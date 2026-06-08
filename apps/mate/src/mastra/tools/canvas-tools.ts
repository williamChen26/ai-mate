import { createTool } from "@mastra/core/tools";
import {
  completionProposalOutputSchema,
  type CompletionProposalOutput
} from "@production-spec-graph/shared";
import { z } from "zod";

export const canvasContextToolInputSchema = z.object({
  roomId: z.string().min(1).max(80),
  shapeCount: z.number().int().nonnegative(),
  selectedShapeIds: z.array(z.string().min(1).max(220)).max(20),
  recentOperationCount: z.number().int().nonnegative(),
  freshness: z.object({
    snapshotVersion: z.number().int().nonnegative(),
    eventVersion: z.number().int().nonnegative(),
    changedSinceSnapshot: z.boolean()
  })
});

export const canvasContextToolOutputSchema = canvasContextToolInputSchema.extend({
  readOnly: z.literal(true),
  bounded: z.literal(true)
});

export const completionProposalToolInputSchema = completionProposalOutputSchema;
export const completionProposalToolOutputSchema = completionProposalOutputSchema;

/**
 * 只读画布上下文工具。它让 ReAct agent 可以显式声明“我正在读取哪部分上下文”，
 * 但工具只返回有边界的小事实，不读取 prompt，也不触碰 tldraw store。
 */
export const canvasContextTool = createTool({
  id: "read-canvas-context",
  description:
    "Read bounded, non-mutating canvas context facts such as shape count, selection, freshness, and recent operation count.",
  inputSchema: canvasContextToolInputSchema,
  outputSchema: canvasContextToolOutputSchema,
  execute: async (inputData) => readCanvasContext(inputData)
});

/**
 * AI Drop 补全提案工具。它代表“提出一个可预览候选”这个有意义动作，
 * 但返回的仍是 preview-only 数据，必须等待用户 Tab 接受后才可能改动画布。
 */
export const completionProposalTool = createTool({
  id: "propose-completion",
  description:
    "Return a schema-valid preview-only AI Drop completion proposal. The tool must not mutate the canvas.",
  inputSchema: completionProposalToolInputSchema,
  outputSchema: completionProposalToolOutputSchema,
  execute: async (inputData) => createCompletionProposal(inputData)
});

/**
 * 工具实现的纯函数版本，方便测试和阅读。它只附加 readOnly/bounded 标记，
 * 不访问外部服务或编辑器。
 */
export function readCanvasContext(
  input: z.infer<typeof canvasContextToolInputSchema>
) {
  return canvasContextToolOutputSchema.parse({
    ...input,
    readOnly: true,
    bounded: true
  });
}

/**
 * completion tool 的纯函数版本。复用 shared schema 做最终校验，确保 Mastra tool
 * 和 web/server AI Drop pipeline 使用同一个 `completion-proposal` 协议。
 */
export function createCompletionProposal(
  input: CompletionProposalOutput
): CompletionProposalOutput {
  return completionProposalToolOutputSchema.parse(input);
}
