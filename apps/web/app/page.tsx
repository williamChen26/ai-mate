import { CanvasShell } from "@/components/canvas-shell";

/**
 * Next.js 应用路由的页面边界。这里有意直接渲染可工作的画布外壳，
 * 让产品打开后就是工具工作台，而不是营销型落地页。
 */
export default function HomePage() {
  return <CanvasShell />;
}
