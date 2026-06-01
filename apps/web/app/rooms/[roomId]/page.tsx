import { CanvasShell } from "@/components/canvas-shell";
import { decideRoomRoute } from "@/lib/room-route";

type RoomPageProps = {
  params: Promise<{
    roomId?: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const decision = decideRoomRoute({ roomId });

  if (decision.kind === "invalid") {
    return (
      <main className="canvas-shell" data-testid="canvas-shell">
        <header className="canvas-shell__bar" aria-label="Canvas workspace">
          <div className="canvas-shell__brand">
            <div className="canvas-shell__mark" aria-hidden="true">
              PS
            </div>
            <div className="canvas-shell__title">
              <strong>Production Spec Graph</strong>
              <span>AI coworker canvas</span>
            </div>
          </div>
          <div className="canvas-shell__status" aria-label="Canvas direction">
            <span>Source tldraw</span>
            <span data-testid="sync-status" data-state="error">
              Invalid room
            </span>
          </div>
        </header>
        <section
          className="canvas-shell__workspace canvas-shell__workspace--message"
          aria-label="Invalid room"
        >
          <div className="canvas-shell__error" role="alert">
            <strong>Room link is not valid.</strong>
            <span>{decision.reason}</span>
          </div>
        </section>
      </main>
    );
  }

  return <CanvasShell roomId={decision.roomId} />;
}
