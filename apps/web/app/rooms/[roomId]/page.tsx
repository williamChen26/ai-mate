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
          <div className="canvas-shell__toolbar" aria-label="Canvas status">
            <span className="canvas-shell__pill">Source tldraw</span>
            <span
              className="canvas-shell__pill"
              data-testid="sync-status"
              data-state="error"
            >
              Sync raw error
            </span>
          </div>
        </header>
        <section
          className="canvas-shell__workspace canvas-shell__workspace--message"
          aria-label="Invalid room"
        >
          <div className="canvas-shell__error" role="alert">
            <strong>Room link is not valid.</strong>
            <pre className="canvas-shell__mate-raw">
              {JSON.stringify(
                {
                  code: "INVALID_ROOM_ID",
                  message: decision.reason
                },
                null,
                2
              )}
            </pre>
          </div>
        </section>
      </main>
    );
  }

  return <CanvasShell roomId={decision.roomId} />;
}
