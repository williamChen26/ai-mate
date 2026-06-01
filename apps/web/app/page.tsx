import { redirect } from "next/navigation";

import { decideRoomRoute } from "@/lib/room-route";

/**
 * 根入口只负责创建一个可分享的 canonical room URL。
 * 协同 store 只在 `/rooms/:roomId` 页面里初始化，避免先连到临时房间。
 */
export default function HomePage() {
  const decision = decideRoomRoute({});
  if (decision.kind !== "create") {
    throw new Error("Root room entry must create a room route.");
  }

  redirect(decision.path);
}
