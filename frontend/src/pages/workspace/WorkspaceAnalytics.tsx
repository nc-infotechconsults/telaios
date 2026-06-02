export default function WorkspaceAnalytics() {
  return (
    <div className="main-scroll">
      <h1 className="h-page">Analytics</h1>
      <p className="sub-page">Org-wide task health and project status</p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 40 }}>📊</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: "var(--fg-1)" }}>Coming Soon</span>
        <span style={{ fontSize: 13, color: "var(--fg-3)", maxWidth: 320 }}>
          Advanced analytics and reporting are under development. Check back soon.
        </span>
      </div>
    </div>
  );
}
