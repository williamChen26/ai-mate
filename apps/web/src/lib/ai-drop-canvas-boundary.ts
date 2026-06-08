import { toRichText, type Editor } from "tldraw";

import type {
  ActiveAiDropProposal,
  AiDropApplyResult
} from "./ai-drop-proposal";

/**
 * AI Drop 唯一允许写入 tldraw 的受控边界。上层状态机已经校验 proposal 是否新鲜、
 * 是否匹配 selection；这里只把候选翻译成最小可见画布变更。
 */
export function applyAiDropProposalToEditor(
  editor: Editor,
  active: ActiveAiDropProposal
): AiDropApplyResult {
  try {
    const preview = active.preview;
    const text =
      preview.kind === "flow-continuation"
        ? preview.nodes.map((node) => node.text).join("\n")
        : preview.text;

    editor.createShape({
      type: "text",
      x: preview.bounds.x,
      y: preview.bounds.y,
      props: {
        richText: toRichText(text)
      }
    });

    return {
      ok: true,
      appliedShapeIds: [`ai-drop:${active.proposalId}`]
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
