import type { RecentCanvasChangeSummaryInput } from "./canvas-context";

/**
 * 这个模块是一个很小的本地会话观察器，不是协同系统，也不是审计系统。
 * 它使用基于闭包的状态持有模式，让 React shell 可以记录 tldraw store 事件，
 * 同时让上下文抽取器读取可序列化摘要，而不共享可变数组。
 */
export type CanvasChangeSource = "user" | "remote";

export type RecentCanvasChangeTracker = {
  recordChangeIds: (
    recordIds: string[],
    source?: CanvasChangeSource
  ) => RecentCanvasChangeSummaryInput;
  getSummary: () => RecentCanvasChangeSummaryInput;
};

/**
 * 创建一个有上限的内存 tracker，用来记录画布外壳挂载后受影响的 records。
 * 追踪器刻意统计存储事件，而不是语义化用户意图，因为 AI 解释和真实协同
 * 历史都不属于当前 MVP 范围。
 */
export function createRecentCanvasChangeTracker(
  maxTrackedIds = 50
): RecentCanvasChangeTracker {
  let observedChangeCount = 0;
  let affectedRecordIds: string[] = [];
  let affectedShapeIds: string[] = [];
  let lastChangeSource: CanvasChangeSource | undefined;

  return {
    /**
     * 记录一次观察到的存储事件，并返回最新的 JSON 安全摘要。
     * 空事件批次会被忽略，避免 tldraw 没有产生记录 id 时误把上下文标记为已变化。
     */
    recordChangeIds(recordIds, source) {
      const uniqueRecordIds = uniqueStrings(recordIds);

      if (uniqueRecordIds.length > 0) {
        observedChangeCount += 1;
        affectedRecordIds = limitStrings(
          [...affectedRecordIds, ...uniqueRecordIds],
          maxTrackedIds
        );
        affectedShapeIds = limitStrings(
          [
            ...affectedShapeIds,
            ...uniqueRecordIds.filter((id) => id.startsWith("shape:"))
          ],
          maxTrackedIds
        );
        lastChangeSource = source;
      }

      return this.getSummary();
    },
    /**
     * 以新数组副本的形式读取当前摘要，防止消费者修改 tracker 的内部闭包状态。
     */
    getSummary() {
      return {
        scope: "local-session",
        observedChangeCount,
        affectedRecordIds: [...affectedRecordIds],
        affectedShapeIds: [...affectedShapeIds],
        ...(lastChangeSource ? { lastChangeSource } : {})
      };
    }
  };
}

/**
 * 去重 id，同时保留首次观察到的顺序并丢弃空字符串。
 * 这样追踪器的记账行为对测试来说是确定的。
 */
function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

/**
 * 只保留配置上限内最新的唯一 id，避免长时间编辑会话让上下文载荷无限制增长。
 */
function limitStrings(values: string[], max: number): string[] {
  return uniqueStrings(values).slice(-max);
}
