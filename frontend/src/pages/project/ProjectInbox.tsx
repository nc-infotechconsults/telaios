import { Icon } from "../../components/Icon";

export default function ProjectInbox({ projectId: _projectId }: { projectId: string }) {
  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h1 className="h-page">Inbox</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            TEOS suggestions, teammate mentions, and system events will appear here.
          </p>
        </div>
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 320,
        gap: 12,
        color: "var(--fg-3)",
      }}>
        <Icon name="inbox" />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-2)" }}>No notifications yet</div>
        <div style={{ fontSize: 13, textAlign: "center", maxWidth: 360 }}>
          When TEOS surfaces a suggestion, a teammate mentions you, or the system has an update,
          it will show up here.
        </div>
      </div>
    </div>
  );
}
