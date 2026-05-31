import { useState, useRef, useEffect } from "react";
import { queryKnowledge } from "../../lib/api";

type SpecialistKey = "qa" | "explorer" | "reverse" | "planner" | "coder" | "designer" | "reviewer";

interface Specialist {
  name: string;
  color: string;
  icon: string;
  tagline: string;
}

const SPECIALISTS: Record<SpecialistKey, Specialist> = {
  qa:       { name: "Q&A",       color: "#0a84ff", icon: "?",   tagline: "Grounded answers from indexed sources" },
  explorer: { name: "Explorer",  color: "#64d2ff", icon: "⌖",  tagline: "Find code, files, and patterns" },
  reverse:  { name: "Reverse",   color: "#bf5af2", icon: "◈",  tagline: "Trace and map system flows" },
  planner:  { name: "Planner",   color: "#30d158", icon: "⎇",  tagline: "Cross-repo implementation plans" },
  coder:    { name: "Coder",     color: "#5e5ce6", icon: "</>", tagline: "Implement, refactor, and fix" },
  designer: { name: "Designer",  color: "#ff9f0a", icon: "✦",  tagline: "Design UIs from your brand kit" },
  reviewer: { name: "Reviewer",  color: "#ff375f", icon: "⊘",  tagline: "Review PRs and audit code" },
};

function detectSpecialist(text: string): SpecialistKey {
  const t = " " + text.toLowerCase() + " ";
  if (/\b(design|mock|wireframe|ui|ux|interface|layout|redesign)\b/.test(t)) return "designer";
  if (/\b(plan|roadmap|rollout|migration|architect|feature|spec|phases)\b/.test(t)) return "planner";
  if (/\b(review|critique|risks?|feedback|pr |diff|audit)\b/.test(t)) return "reviewer";
  if (/\b(refactor|implement|write code|fix the bug|stub|patch)\b/.test(t)) return "coder";
  if (/\b(reverse.engineer|sequence diagram|how does|trace|map the flow)\b/.test(t)) return "reverse";
  if (/\b(find|locate|where|search|grep|navigate)\b/.test(t)) return "explorer";
  return "qa";
}

/* ─── Tool / artifact types ─────────────────────────────────────────────── */
interface ToolCall {
  kind: "read" | "edit" | "search" | "run" | "cite";
  label: string;
}

interface PlanStep {
  id: number;
  title: string;
  s: "done" | "active" | "pending";
  eta: string;
  sub?: string[];
  risk?: boolean;
}

interface CodeToken {
  t: "k" | "s" | "n" | "c" | "f" | "ty" | "v" | "p" | "newline";
  s?: string;
  added?: boolean;
}

interface CodeFile {
  path: string;
  lang: string;
  action: "new" | "edit";
  lines: CodeToken[];
}

interface Passage {
  heading: string;
  text: string;
}

interface Artifact {
  type: "plan" | "code" | "citation" | "design";
  title: string;
  // Plan
  steps?: PlanStep[];
  // Code
  files?: CodeFile[];
  tests?: { passed: number; failed: number; time: string };
  // Citation
  source?: string;
  passages?: Passage[];
  // Design
  screen?: string;
  accent?: string;
  versions?: Array<{ id: string; label: string; summary: string }>;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "teammate";
  type?: "handover";
  to?: SpecialistKey;
  reason?: string;
  text?: string;
  specialist?: SpecialistKey;
  tools?: ToolCall[];
  artifact?: Artifact;
  who?: string;
  initial?: string;
  avatarColor?: string;
  timestamp?: Date;
}

interface Session {
  id: string;
  title: string;
  time: string;
  visibility: "private" | "team" | "shared";
  specialists: SpecialistKey[];
  participants: Array<{ name: string; initial: string; color: string; online: boolean }>;
  messages: Message[];
}

/* ─── Seeded sessions ────────────────────────────────────────────────────── */
const SEEDED_SESSIONS: Session[] = [
  {
    id: "s-conv",
    title: "Ship SSO via Okta — end-to-end",
    time: "now",
    visibility: "team",
    participants: [
      { name: "You", initial: "ME", color: "#0a84ff", online: true },
      { name: "Sam Okafor", initial: "SO", color: "#30d158", online: true },
      { name: "Lina Park", initial: "LP", color: "#ff9f0a", online: false },
    ],
    specialists: ["explorer", "planner", "designer", "coder", "qa"],
    messages: [
      {
        id: "u1",
        role: "user",
        text: "Help me end-to-end: plan adding SSO via Okta, design the new sign-in screen, and stub the auth changes in atlas-api.",
        timestamp: new Date(),
      },
      { id: "ho1", role: "system", type: "handover", to: "explorer", reason: "Mapping auth-touching modules across repos first." },
      {
        id: "a1",
        role: "assistant",
        specialist: "explorer",
        text: "Scanned the workspace — auth lives in three places. atlas-api/src/auth.ts handles JWT verification, atlas-web has a session middleware, atlas-edge caches refresh tokens at the edge. RFC-014 §4.2 describes the cold-start budget the change needs to respect.",
        tools: [
          { kind: "read",   label: "atlas-api/src/auth.ts" },
          { kind: "read",   label: "atlas-web/middleware/session.ts" },
          { kind: "search", label: "JWT verification in atlas-edge" },
          { kind: "cite",   label: "RFC-014 §4.2" },
        ],
        artifact: {
          type: "citation",
          title: "RFC-014 — Edge Tier Cold-Start Budget",
          source: "Documents · Architecture",
          passages: [
            { heading: "§4.2 Verification path", text: "Edge workers verify JWT signatures locally with the cached JWKS. A miss falls back to atlas-api/verify, which adds 38–62ms p99 in-region. The 250ms cold-start budget must not be exceeded by changes to the auth pipeline." },
            { heading: "§4.3 Refresh tokens", text: "Refresh tokens are stored in the edge KV with TTL of 24h. A rotation must invalidate caches in batch with a soft cutover; en-masse invalidation creates a 40-second blip." },
          ],
        },
        timestamp: new Date(),
      },
      { id: "u2", role: "user", text: "Good. Draft the migration plan.", timestamp: new Date() },
      { id: "ho2", role: "system", type: "handover", to: "planner", reason: "Composing a structured rollout plan." },
      {
        id: "a2",
        role: "assistant",
        specialist: "planner",
        text: "Five-phase rollout. The riskiest step is phase 3 — JWT verification migration during the soft-cutover window. I've added rollback points after each phase.",
        artifact: {
          type: "plan",
          title: "SSO via Okta — rollout plan",
          steps: [
            { id: 1, title: "Provision Okta tenant",          s: "done",    eta: "2h",  sub: ["Create Acme tenant in Okta admin", "Configure OIDC application", "Map workspace groups to claims"] },
            { id: 2, title: "Add OIDC adapter to atlas-api",  s: "active",  eta: "1d",  sub: ["Add openid-client dep", "Write /oauth/callback handler", "Wire to existing verifyJwt path"] },
            { id: 3, title: "Migrate JWT verification",       s: "pending", eta: "3d",  sub: ["Add JWKS cache w/ 24h TTL", "Soft-cutover behind FF_OKTA", "Edge tier reads new JWKS endpoint"], risk: true },
            { id: 4, title: "Feature-flag rollout",           s: "pending", eta: "1w",  sub: ["Per-workspace flag", "Audit log new sign-ins", "Canary 5% → 25% → 100%"] },
            { id: 5, title: "Deprecate legacy sessions",      s: "pending", eta: "2w",  sub: ["Burn-down legacy refresh tokens", "Remove session middleware", "Delete unused tables"] },
          ],
        },
        timestamp: new Date(),
      },
      { id: "tm1", role: "teammate", who: "Sam Okafor", initial: "SO", avatarColor: "#30d158", text: "Soft-cutover window during US off-hours? I'd add 03:00–05:00 UTC.", timestamp: new Date() },
      { id: "u3", role: "user", text: "Yes. Now design the new sign-in screen.", timestamp: new Date() },
      { id: "ho3", role: "system", type: "handover", to: "designer", reason: "Drafting the sign-in screen using the brand kit." },
      {
        id: "a3",
        role: "assistant",
        specialist: "designer",
        text: "Composed a sign-in screen that puts SSO front-and-center with email/password collapsed below. Used the Acme brand kit — primary blue, 12px radii, the linked AuthCard component.",
        tools: [
          { kind: "read", label: "Brand & UI Guidelines (Figma)" },
          { kind: "read", label: "atlas-web/src/components/AuthCard" },
        ],
        artifact: {
          type: "design",
          title: "Sign-in — Okta SSO",
          screen: "login",
          accent: "#0a84ff",
          versions: [
            { id: "v1", label: "v1", summary: "SSO above email/password" },
            { id: "v2", label: "v2", summary: "Larger SSO button, tighter card" },
          ],
        },
        timestamp: new Date(),
      },
      { id: "u4", role: "user", text: "Now stub the changes in atlas-api. Just the adapter scaffold.", timestamp: new Date() },
      { id: "ho4", role: "system", type: "handover", to: "coder", reason: "Drafting the OIDC adapter." },
      {
        id: "a4",
        role: "assistant",
        specialist: "coder",
        text: "Added a new module src/api/oidc.ts with the callback handler, a refactored requireAuth that detects Okta tokens vs legacy JWTs, and one test file. Diff is in the canvas — nothing's committed yet.",
        tools: [
          { kind: "edit", label: "src/api/oidc.ts (new)" },
          { kind: "edit", label: "src/api/auth.ts" },
          { kind: "run",  label: "pnpm test src/api" },
        ],
        artifact: {
          type: "code",
          title: "atlas-api · OIDC adapter scaffold",
          files: [
            {
              path: "src/api/oidc.ts",
              lang: "TypeScript",
              action: "new",
              lines: [
                { t: "k", s: "import" }, { t: "p", s: " { Issuer, Client } " }, { t: "k", s: "from" }, { t: "s", s: " 'openid-client'" }, { t: "p", s: ";" },
                { t: "newline" },
                { t: "k", s: "let" }, { t: "p", s: " client: Client | " }, { t: "k", s: "null" }, { t: "p", s: " = " }, { t: "k", s: "null" }, { t: "p", s: ";" },
                { t: "newline" },
                { t: "k", s: "export async function" }, { t: "p", s: " " }, { t: "f", s: "getOktaClient" }, { t: "p", s: "() {" },
                { t: "p", s: "  " }, { t: "k", s: "if" }, { t: "p", s: " (client) " }, { t: "k", s: "return" }, { t: "p", s: " client;" },
                { t: "p", s: "  " }, { t: "k", s: "const" }, { t: "p", s: " issuer = " }, { t: "k", s: "await" }, { t: "p", s: " " }, { t: "ty", s: "Issuer" }, { t: "p", s: ".discover(process.env." }, { t: "v", s: "OKTA_ISSUER" }, { t: "p", s: "!);" },
                { t: "p", s: "  client = " }, { t: "k", s: "new" }, { t: "p", s: " issuer." }, { t: "f", s: "Client" }, { t: "p", s: "({ client_id: process.env." }, { t: "v", s: "OKTA_CLIENT_ID" }, { t: "p", s: "! });" },
                { t: "p", s: "  " }, { t: "k", s: "return" }, { t: "p", s: " client;" },
                { t: "p", s: "}" },
                { t: "newline" },
                { t: "k", s: "export async function" }, { t: "p", s: " " }, { t: "f", s: "handleCallback" }, { t: "p", s: "(code: " }, { t: "ty", s: "string" }, { t: "p", s: ") {" },
                { t: "p", s: "  " }, { t: "k", s: "const" }, { t: "p", s: " c = " }, { t: "k", s: "await" }, { t: "p", s: " " }, { t: "f", s: "getOktaClient" }, { t: "p", s: "();" },
                { t: "p", s: "  " }, { t: "k", s: "const" }, { t: "p", s: " tokenSet = " }, { t: "k", s: "await" }, { t: "p", s: " c." }, { t: "f", s: "callback" }, { t: "p", s: "(redirectUri, { code });" },
                { t: "p", s: "  " }, { t: "k", s: "return" }, { t: "p", s: " { jwt: tokenSet.id_token, claims: tokenSet." }, { t: "f", s: "claims" }, { t: "p", s: "() };" },
                { t: "p", s: "}" },
              ],
            },
            {
              path: "src/api/auth.ts",
              lang: "TypeScript",
              action: "edit",
              lines: [
                { t: "c", s: "// add Okta path before legacy JWT verification" },
                { t: "newline" },
                { t: "k", s: "if", added: true }, { t: "p", s: " (claims.iss?.", added: true }, { t: "f", s: "startsWith", added: true }, { t: "p", s: "('https://acme.okta.com')) {", added: true },
                { t: "newline" },
                { t: "p", s: "  ", added: true }, { t: "k", s: "return", added: true }, { t: "p", s: " ", added: true }, { t: "f", s: "verifyOktaToken", added: true }, { t: "p", s: "(token);", added: true },
                { t: "newline" },
                { t: "p", s: "}", added: true },
              ],
            },
          ],
          tests: { passed: 8, failed: 0, time: "1.4s" },
        },
        timestamp: new Date(),
      },
    ],
  },
  {
    id: "s-billing",
    title: "Redesign the billing dashboard",
    time: "1h ago",
    visibility: "team",
    participants: [
      { name: "You", initial: "ME", color: "#0a84ff", online: true },
      { name: "Mei Tanaka", initial: "MT", color: "#bf5af2", online: true },
    ],
    specialists: ["explorer", "designer"],
    messages: [
      { id: "bu1", role: "user", text: "Can you redesign the billing dashboard? It feels cluttered.", timestamp: new Date() },
      { id: "bho1", role: "system", type: "handover", to: "explorer", reason: "Pulling the current screens and components." },
      { id: "ba1", role: "assistant", specialist: "explorer", text: "Found BillingDashboard.tsx in atlas-web with 11 child components and 4 KPI cards. Brand tokens linked from the Figma kit.", timestamp: new Date() },
      { id: "bho2", role: "system", type: "handover", to: "designer", reason: "Switching to design mode to draft variations." },
      { id: "ba2", role: "assistant", specialist: "designer", text: "Three directions: density-first (tabular), narrative (scrollytelling), and ops-control (single-screen with KPIs up top).", timestamp: new Date() },
      { id: "btm1", role: "teammate", who: "Mei Tanaka", initial: "MT", avatarColor: "#bf5af2", text: "Ops-control direction looks closest to what we discussed last week.", timestamp: new Date() },
    ],
  },
  {
    id: "s-auth",
    title: "How does our refresh-token flow work?",
    time: "2 days ago",
    visibility: "private",
    participants: [
      { name: "You", initial: "ME", color: "#0a84ff", online: true },
    ],
    specialists: ["qa"],
    messages: [
      { id: "qu1", role: "user", text: "How does our refresh-token flow work across the edge tier?", timestamp: new Date() },
      { id: "qa1", role: "assistant", specialist: "qa", text: "Edge tier verifies JWTs locally and falls back to atlas-api for refresh. RFC-014 §4.2 covers the cold-start budget.", timestamp: new Date() },
    ],
  },
];

/* ─── Artifact renderers ─────────────────────────────────────────────────── */

function PlanArtifact({ artifact }: { artifact: Artifact }) {
  const steps = artifact.steps ?? [];
  const totalDone = steps.filter((s) => s.s === "done").length;
  const totalActive = steps.filter((s) => s.s === "active").length;
  const pct = steps.length ? ((totalDone + 0.5 * totalActive) / steps.length) * 100 : 0;

  return (
    <div style={{ padding: "16px", overflow: "auto", height: "100%" }}>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)" }}>
        {[
          { l: "Phases", v: steps.length },
          { l: "Done", v: totalDone },
          { l: "In flight", v: totalActive },
        ].map((s) => (
          <div key={s.l} style={{ textAlign: "center", minWidth: 40 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>{s.v}</div>
            <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
        <div style={{ flex: 1, alignSelf: "center" }}>
          <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginBottom: 4 }}>Progress</div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--fill-secondary)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #30d158, #0a84ff)", borderRadius: 2, transition: "width 0.5s" }} />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step) => (
          <div key={step.id} style={{
            borderRadius: 12,
            border: `0.5px solid ${step.s === "active" ? "rgba(48,209,88,0.4)" : "var(--hairline)"}`,
            background: step.s === "active" ? "rgba(48,209,88,0.06)" : "var(--fill-quaternary)",
            overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
              {/* Step number / status */}
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: step.s === "done" ? 13 : 12, fontWeight: 600,
                background: step.s === "done" ? "#30d158" : step.s === "active" ? "rgba(48,209,88,0.2)" : "var(--fill-secondary)",
                color: step.s === "done" ? "#fff" : step.s === "active" ? "#30d158" : "var(--label-tertiary)",
                border: step.s === "active" ? "1.5px solid #30d158" : "none",
                animation: step.s === "active" ? "teosOrbPulse 2s ease-in-out infinite" : undefined,
              }}>
                {step.s === "done" ? "✓" : step.id}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>{step.title}</span>
                  {step.risk && (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: "rgba(255,159,10,0.18)", color: "#b66e02", fontWeight: 600 }}>⚠ riskiest</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 1 }}>ETA · {step.eta}</div>
              </div>
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 9999, fontWeight: 500,
                background: step.s === "done" ? "rgba(48,209,88,0.12)" : step.s === "active" ? "rgba(48,209,88,0.12)" : "var(--fill-secondary)",
                color: step.s === "done" ? "#30d158" : step.s === "active" ? "#30d158" : "var(--label-tertiary)",
              }}>
                {step.s}
              </span>
            </div>
            {step.sub && (
              <div style={{ padding: "0 12px 10px 48px", display: "flex", flexDirection: "column", gap: 4 }}>
                {step.sub.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--label-secondary)" }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: step.s === "done" || (step.s === "active" && i < 1) ? "#30d158" : "var(--fill-primary)",
                    }} />
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeArtifact({ artifact }: { artifact: Artifact }) {
  const [fileIdx, setFileIdx] = useState(0);
  const files = artifact.files ?? [];
  const file = files[fileIdx];
  if (!file) return null;

  // Group tokens into rows by splitting on "newline"
  const rows: CodeToken[][] = [[]];
  file.lines.forEach((tok) => {
    if (tok.t === "newline") rows.push([]);
    else rows[rows.length - 1].push(tok);
  });
  const contentRows = rows.filter((r) => r.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* File tabs */}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0, overflowX: "auto" }}>
        {files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => setFileIdx(i)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
              background: i === fileIdx ? "var(--fill-tertiary)" : "none",
              border: "none", borderBottom: i === fileIdx ? "1.5px solid #5e5ce6" : "1.5px solid transparent",
              cursor: "pointer", fontSize: 12, color: i === fileIdx ? "var(--label-primary)" : "var(--label-tertiary)",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 10 }}>📄</span>
            <span>{f.path.split("/").pop()}</span>
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 9999, fontWeight: 600,
              background: f.action === "new" ? "rgba(48,209,88,0.15)" : "rgba(94,92,230,0.15)",
              color: f.action === "new" ? "#30d158" : "#5e5ce6",
            }}>{f.action}</span>
          </button>
        ))}
      </div>

      {/* Path bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--fill-quaternary)", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "var(--label-tertiary)", fontFamily: "var(--font-sf-mono)" }}>{file.path}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--label-quaternary)", background: "var(--fill-secondary)", padding: "1px 6px", borderRadius: 4 }}>{file.lang}</span>
      </div>

      {/* Code */}
      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
        {/* Gutter */}
        <div style={{ padding: "8px 0", minWidth: 36, textAlign: "right", paddingRight: 10, paddingLeft: 8, flexShrink: 0, borderRight: "0.5px solid var(--hairline)", background: "var(--fill-quaternary)" }}>
          {contentRows.map((_, i) => (
            <div key={i} style={{ height: 20, fontSize: 11, lineHeight: "20px", color: "var(--label-quaternary)", fontFamily: "var(--font-sf-mono)" }}>{i + 1}</div>
          ))}
        </div>
        {/* Lines */}
        <pre style={{ flex: 1, margin: 0, padding: "8px 12px", overflow: "hidden", fontSize: 12, lineHeight: "20px", fontFamily: "var(--font-sf-mono)" }}>
          {contentRows.map((row, i) => {
            const isAdded = row.some((t) => t.added);
            return (
              <div key={i} style={{
                height: 20,
                background: isAdded ? "rgba(48,209,88,0.12)" : "transparent",
                borderLeft: isAdded ? "2px solid #30d158" : "2px solid transparent",
                paddingLeft: isAdded ? 6 : 8,
                marginLeft: -14,
                paddingRight: 4,
              }}>
                {row.map((tok, j) => {
                  const colorMap: Record<string, string> = {
                    k:  "#bf5af2", // keyword
                    s:  "#ff9f0a", // string
                    n:  "#5e5ce6", // number
                    c:  "#8e8e93", // comment
                    f:  "#0a84ff", // function
                    ty: "#30d158", // type
                    v:  "#ff375f", // variable
                    p:  "var(--label-primary)", // punctuation
                  };
                  return (
                    <span key={j} style={{ color: colorMap[tok.t] ?? "var(--label-primary)" }}>{tok.s ?? ""}</span>
                  );
                })}
              </div>
            );
          })}
        </pre>
      </div>

      {/* Test results */}
      {artifact.tests && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0, background: "var(--fill-quaternary)" }}>
          <span style={{ fontSize: 13, color: "#30d158" }}>✓</span>
          <span style={{ fontSize: 12, color: "var(--label-secondary)" }}>
            <b>{artifact.tests.passed}</b> tests passing
            {artifact.tests.failed > 0 && <span style={{ color: "#ff453a" }}> · {artifact.tests.failed} failed</span>}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--label-tertiary)" }}>{artifact.tests.time}</span>
          <button style={{ padding: "3px 10px", borderRadius: 8, background: "var(--fill-secondary)", border: "0.5px solid var(--hairline)", fontSize: 11, cursor: "pointer", color: "var(--label-secondary)" }}>
            ▶ Re-run
          </button>
        </div>
      )}
    </div>
  );
}

function CitationArtifact({ artifact }: { artifact: Artifact }) {
  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginBottom: 12 }}>
        {artifact.source}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(artifact.passages ?? []).map((p, i) => (
          <div key={i} style={{
            borderLeft: "2px solid #0a84ff",
            paddingLeft: 12,
            paddingTop: 4,
            paddingBottom: 4,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#0a84ff", marginBottom: 4 }}>{p.heading}</div>
            <p style={{ fontSize: 13, color: "var(--label-primary)", lineHeight: 1.65, margin: 0 }}>{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignArtifactRenderer({ artifact }: { artifact: Artifact }) {
  const [activeV, setActiveV] = useState(artifact.versions?.[artifact.versions.length - 1]?.id ?? "v1");
  const versions = artifact.versions ?? [];
  const accent = artifact.accent ?? "#0a84ff";

  // Simple schematic SVG per screen type
  const renderSchematic = () => {
    const a = accent;
    if (artifact.screen === "login") {
      return (
        <svg viewBox="0 0 280 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="60" y="20" width="160" height="140" rx="12" fill={a} fillOpacity="0.08" stroke={a} strokeOpacity="0.2" strokeWidth="0.5" />
          <rect x="80" y="36" width="120" height="16" rx="4" fill={a} fillOpacity="0.5" />
          <rect x="96" y="58" width="88" height="32" rx="8" fill={a} fillOpacity="0.3" />
          <rect x="96" y="96" width="88" height="10" rx="3" fill={a} fillOpacity="0.18" />
          <rect x="96" y="112" width="88" height="10" rx="3" fill={a} fillOpacity="0.18" />
          <rect x="96" y="130" width="88" height="20" rx="6" fill={a} fillOpacity="0.4" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 280 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="260" height="20" rx="4" fill={a} fillOpacity="0.4" />
        <rect x="10" y="38" width="80" height="132" rx="6" fill={a} fillOpacity="0.14" />
        <rect x="98" y="38" width="80" height="60" rx="6" fill={a} fillOpacity="0.22" />
        <rect x="186" y="38" width="84" height="60" rx="6" fill={a} fillOpacity="0.22" />
        <rect x="98" y="106" width="172" height="64" rx="6" fill={a} fillOpacity="0.14" />
        <rect x="108" y="116" width="80" height="8" rx="2" fill={a} fillOpacity="0.4" />
        <rect x="108" y="130" width="152" height="6" rx="2" fill={a} fillOpacity="0.25" />
        <rect x="108" y="142" width="120" height="6" rx="2" fill={a} fillOpacity="0.25" />
      </svg>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Version strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveV(v.id)}
            style={{
              padding: "3px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
              background: activeV === v.id ? accent + "20" : "var(--fill-tertiary)",
              color: activeV === v.id ? accent : "var(--label-secondary)",
              border: activeV === v.id ? `0.5px solid ${accent}60` : "0.5px solid var(--hairline)",
              cursor: "pointer",
            }}
          >
            {v.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>
          {versions.find((v) => v.id === activeV)?.summary}
        </span>
      </div>

      {/* Preview stage */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "var(--fill-quaternary)" }}>
        <div style={{
          width: "100%", maxWidth: 320, aspectRatio: "16/10",
          background: "var(--bg-primary)",
          borderRadius: 12,
          border: "0.5px solid var(--hairline)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          padding: 0,
        }}>
          {renderSchematic()}
        </div>
      </div>
    </div>
  );
}

/* ─── Tool trail ─────────────────────────────────────────────────────────── */
function ToolTrail({ tools }: { tools: ToolCall[] }) {
  const icons: Record<string, string> = { read: "📄", edit: "✏️", search: "🔍", run: "▶", cite: "📖" };
  const bg: Record<string, string> = {
    read:   "rgba(10,132,255,0.1)",
    edit:   "rgba(94,92,230,0.1)",
    search: "rgba(100,210,255,0.1)",
    run:    "rgba(48,209,88,0.1)",
    cite:   "rgba(255,159,10,0.1)",
  };
  const color: Record<string, string> = {
    read:   "#0a84ff",
    edit:   "#5e5ce6",
    search: "#64d2ff",
    run:    "#30d158",
    cite:   "#ff9f0a",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
      {tools.map((t, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 7px", borderRadius: 6, fontSize: 11,
          background: bg[t.kind] ?? "var(--fill-tertiary)",
          color: color[t.kind] ?? "var(--label-secondary)",
          border: `0.5px solid ${color[t.kind] ?? "var(--hairline)"}30`,
        }}>
          <span style={{ fontSize: 10 }}>{icons[t.kind]}</span>
          {t.label}
        </span>
      ))}
    </div>
  );
}

/* ─── Artifact canvas ────────────────────────────────────────────────────── */
const ARTIFACT_ICONS: Record<string, string> = { plan: "⎇", code: "</>", citation: "📖", design: "✦" };
const ARTIFACT_LABELS: Record<string, string> = { plan: "Plan", code: "Code change", citation: "Citation", design: "Design" };
const ARTIFACT_COLORS: Record<string, string> = { plan: "#30d158", code: "#5e5ce6", citation: "#0a84ff", design: "#ff9f0a" };

function ArtifactCanvas({ artifact, allArtifacts, currentIdx, onPick }: {
  artifact: Artifact;
  specialist?: Specialist;
  allArtifacts: Array<{ m: Message; i: number }>;
  currentIdx: number | null;
  onPick: (i: number) => void;
}) {
  const color = ARTIFACT_COLORS[artifact.type] ?? "#0a84ff";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: color + "20", color,
          fontSize: 13,
        }}>
          {ARTIFACT_ICONS[artifact.type]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color }}>
            {ARTIFACT_LABELS[artifact.type]}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {artifact.title}
          </div>
        </div>
        {/* Artifact trail pips */}
        {allArtifacts.length > 1 && (
          <div style={{ display: "flex", gap: 4 }}>
            {allArtifacts.map((a, i) => (
              <button
                key={i}
                onClick={() => onPick(a.i)}
                title={ARTIFACT_LABELS[a.m.artifact!.type]}
                style={{
                  width: 22, height: 22, borderRadius: 6, border: "none",
                  background: a.i === currentIdx ? ARTIFACT_COLORS[a.m.artifact!.type] + "30" : "var(--fill-tertiary)",
                  color: a.i === currentIdx ? ARTIFACT_COLORS[a.m.artifact!.type] : "var(--label-quaternary)",
                  cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {ARTIFACT_ICONS[a.m.artifact!.type]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {artifact.type === "plan"     && <PlanArtifact artifact={artifact} />}
        {artifact.type === "code"     && <CodeArtifact artifact={artifact} />}
        {artifact.type === "citation" && <CitationArtifact artifact={artifact} />}
        {artifact.type === "design"   && <DesignArtifactRenderer artifact={artifact} />}
      </div>
    </div>
  );
}

/* ─── Handover divider ───────────────────────────────────────────────────── */
function HandoverDivider({ msg }: { msg: Message }) {
  const spec = msg.to ? SPECIALISTS[msg.to] : null;
  if (!spec) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", flexShrink: 0 }}>
      <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
      <span style={{ fontSize: 11, color: spec.color, display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
        <span>→</span>
        <span>{spec.icon}</span>
        <b>{spec.name}</b>
        {msg.reason && <span style={{ opacity: 0.7 }}>· {msg.reason}</span>}
      </span>
      <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function ProjectConversation({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<Session[]>(SEEDED_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState("s-conv");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pinnedArtifactIdx, setPinnedArtifactIdx] = useState<number | null>(null);

  const session = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages, isTyping]);

  // Collect artifact messages
  const artifactMessages = session.messages
    .map((m, i) => (m.artifact ? { m, i } : null))
    .filter(Boolean) as Array<{ m: Message; i: number }>;

  const activeArtifactIdx = pinnedArtifactIdx != null && session.messages[pinnedArtifactIdx]?.artifact
    ? pinnedArtifactIdx
    : artifactMessages.length ? artifactMessages[artifactMessages.length - 1].i : null;

  const activeArtifact = activeArtifactIdx != null ? session.messages[activeArtifactIdx]?.artifact : null;
  const activeArtifactSpecialist = activeArtifactIdx != null && session.messages[activeArtifactIdx]?.specialist
    ? SPECIALISTS[session.messages[activeArtifactIdx].specialist!]
    : undefined;

  const lastSpecialist = (() => {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m.role === "assistant" && m.specialist) return SPECIALISTS[m.specialist];
    }
    return SPECIALISTS.qa;
  })();

  const newSession = () => {
    const id = `s-${Date.now()}`;
    setSessions((all) => [
      ...all,
      {
        id,
        title: "New conversation",
        time: "now",
        visibility: "private",
        specialists: [],
        participants: [{ name: "You", initial: "ME", color: "#0a84ff", online: true }],
        messages: [],
      },
    ]);
    setActiveSessionId(id);
    setPinnedArtifactIdx(null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const detected = detectSpecialist(text);
    const prevSpec = lastSpecialist;
    const changed = prevSpec !== SPECIALISTS[detected];

    const newMessages: Message[] = [...session.messages];
    if (changed && session.messages.length > 0) {
      newMessages.push({ id: `ho-${Date.now()}`, role: "system", type: "handover", to: detected, reason: `Routing to ${SPECIALISTS[detected].name}.` });
    }
    newMessages.push({ id: `u-${Date.now()}`, role: "user", text, timestamp: new Date() });

    setSessions((all) => all.map((s) => s.id === activeSessionId ? {
      ...s,
      messages: newMessages,
      specialists: [...new Set([...s.specialists, detected])],
      title: s.messages.length === 0 ? text.slice(0, 56) : s.title,
    } : s));

    setInput("");
    setIsTyping(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const result = await queryKnowledge(projectId, text).catch(() => null);
      const answer = result?.answer ?? `I've analyzed this with the ${SPECIALISTS[detected].name} specialist. Connect the knowledge base for grounded answers.`;
      setSessions((all) => all.map((s) => s.id === activeSessionId ? {
        ...s,
        messages: [...s.messages, {
          id: `a-${Date.now()}`,
          role: "assistant",
          specialist: detected,
          text: answer,
          timestamp: new Date(),
        }],
      } : s));
    } catch {
      setSessions((all) => all.map((s) => s.id === activeSessionId ? {
        ...s,
        messages: [...s.messages, {
          id: `err-${Date.now()}`,
          role: "assistant",
          specialist: detected,
          text: "An error occurred. Please check the backend connection.",
          timestamp: new Date(),
        }],
      } : s));
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Sessions strip ── */}
      <div style={{ width: 200, borderRight: "0.5px solid var(--hairline)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px 8px", borderBottom: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)", flex: 1 }}>Sessions</span>
          <button
            onClick={newSession}
            title="New conversation"
            style={{ width: 22, height: 22, borderRadius: 6, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--label-tertiary)", fontSize: 15 }}
          >+</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {sessions.map((s) => {
            const last = [...s.messages].reverse().find((m) => m.role !== "system");
            const preview = last
              ? (last.role === "user" ? "You: " : last.role === "teammate" ? (last.who?.split(" ")[0] ?? "") + ": " : "TEOS: ") + (last.text ?? "").slice(0, 60)
              : "—";
            return (
              <button
                key={s.id}
                onClick={() => { setActiveSessionId(s.id); setPinnedArtifactIdx(null); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                  background: s.id === activeSessionId ? "var(--hover-glass)" : "none",
                  borderLeft: s.id === activeSessionId ? "2px solid #0a84ff" : "2px solid transparent",
                  border: "none", marginBottom: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: s.id === activeSessionId ? 600 : 400, color: s.id === activeSessionId ? "var(--label-primary)" : "var(--label-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--label-quaternary)", flexShrink: 0 }}>{s.time}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: "var(--label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>
                {s.specialists.length > 0 && (
                  <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                    {s.specialists.slice(0, 4).map((id) => {
                      const sp = SPECIALISTS[id];
                      return (
                        <span key={id} style={{ fontSize: 9, color: sp.color, fontWeight: 500 }}>{sp.icon}</span>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ padding: 8, borderTop: "0.5px solid var(--hairline)" }}>
          <button
            onClick={newSession}
            style={{
              width: "100%", padding: "6px", borderRadius: 8,
              background: "linear-gradient(135deg, rgba(10,132,255,0.12), rgba(191,90,242,0.12))",
              border: "0.5px solid rgba(10,132,255,0.25)", color: "#0a84ff",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            + New Session
          </button>
        </div>
      </div>

      {/* ── Chat thread ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "linear-gradient(135deg, #0a84ff, #bf5af2)", animation: "teosOrbPulse 2s ease-in-out infinite", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.title}</span>
              <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 9999, background: lastSpecialist.color + "20", color: lastSpecialist.color, border: `0.5px solid ${lastSpecialist.color}40`, whiteSpace: "nowrap", flexShrink: 0 }}>
                {lastSpecialist.icon} {lastSpecialist.name}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 1 }}>
              {session.specialists.length > 0
                ? `Routed via ${session.specialists.map((id) => SPECIALISTS[id]?.name).filter(Boolean).join(" → ")}`
                : "Always-on assistant"}
            </div>
          </div>
          {/* Participants */}
          {session.participants.length > 0 && (
            <div style={{ display: "flex" }}>
              {session.participants.slice(0, 4).map((p, i) => (
                <div
                  key={i}
                  title={p.name}
                  style={{
                    width: 22, height: 22, borderRadius: "50%", background: p.color,
                    color: "#fff", fontSize: 9, fontWeight: 600, display: "flex",
                    alignItems: "center", justifyContent: "center", marginLeft: i > 0 ? -6 : 0,
                    border: "1.5px solid var(--bg-primary)", zIndex: 10 - i, position: "relative",
                  }}
                >
                  {p.initial}
                </div>
              ))}
            </div>
          )}
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 9999,
            background: "var(--fill-tertiary)", color: "var(--label-tertiary)",
            border: "0.5px solid var(--hairline)",
          }}>
            {session.visibility === "team" ? "👥 Team" : session.visibility === "shared" ? "🔗 Shared" : "🔒 Private"}
          </span>
        </div>

        {/* Messages */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}
          role="log"
          aria-live="polite"
        >
          {session.messages.map((msg, idx) => {
            if (msg.role === "system" && msg.type === "handover") {
              return <HandoverDivider key={msg.id} msg={msg} />;
            }

            if (msg.role === "teammate") {
              return (
                <div key={msg.id} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", background: msg.avatarColor ?? "#8e8e93",
                    color: "#fff", fontSize: 9, fontWeight: 600, display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{msg.initial}</div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginBottom: 3 }}>{msg.who}</div>
                    <div style={{
                      padding: "9px 12px", borderRadius: "16px 16px 16px 4px",
                      background: "var(--fill-tertiary)", border: "0.5px dashed var(--separator)",
                      fontSize: 13, color: "var(--label-primary)", lineHeight: 1.5, maxWidth: "78%",
                    }}>{msg.text}</div>
                  </div>
                </div>
              );
            }

            const isUser = msg.role === "user";
            const spec = msg.specialist ? SPECIALISTS[msg.specialist] : null;
            const hasArtifact = !!msg.artifact;
            const isActive = idx === activeArtifactIdx;

            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                {!isUser && (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #0a84ff, #bf5af2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", marginBottom: 2 }}>T</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", maxWidth: "78%", gap: 4 }}>
                  {!isUser && spec && (
                    <span style={{ fontSize: 10, color: spec.color, fontWeight: 500 }}>TEOS · {spec.icon} {spec.name}</span>
                  )}
                  {!isUser && msg.tools && msg.tools.length > 0 && <ToolTrail tools={msg.tools} />}
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontSize: 13, lineHeight: 1.55,
                    ...(isUser
                      ? { background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", color: "#fff" }
                      : { background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)" }),
                  }}>
                    {msg.text}
                  </div>
                  {/* Artifact card */}
                  {hasArtifact && (
                    <button
                      onClick={() => setPinnedArtifactIdx(idx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", borderRadius: 10,
                        background: isActive ? (ARTIFACT_COLORS[msg.artifact!.type] + "15") : "var(--fill-quaternary)",
                        border: `0.5px solid ${isActive ? ARTIFACT_COLORS[msg.artifact!.type] + "50" : "var(--hairline)"}`,
                        cursor: "pointer", width: "100%", textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 13, color: ARTIFACT_COLORS[msg.artifact!.type] }}>
                        {ARTIFACT_ICONS[msg.artifact!.type]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: ARTIFACT_COLORS[msg.artifact!.type], fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {ARTIFACT_LABELS[msg.artifact!.type]}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {msg.artifact!.title}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>→</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #0a84ff, #bf5af2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>T</div>
              <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0,1,2].map((i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: lastSpecialist.color, animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 16px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "var(--fill-tertiary)", borderRadius: 16, padding: "10px 12px", border: "0.5px solid var(--glass-edge)" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message TEOS… (Enter to send)"
              rows={1}
              style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 14, lineHeight: 1.5, color: "var(--label-primary)", fontFamily: "inherit", overflow: "hidden" }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || isTyping}
              style={{
                width: 34, height: 34, borderRadius: "50%",
                background: input.trim() && !isTyping ? "linear-gradient(135deg, #0a84ff, #5e5ce6)" : "var(--fill-secondary)",
                border: "none", cursor: input.trim() && !isTyping ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: input.trim() && !isTyping ? "#fff" : "var(--label-tertiary)", flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Artifact canvas ── */}
      <div style={{
        width: activeArtifact ? 380 : 0,
        borderLeft: activeArtifact ? "0.5px solid var(--hairline)" : "none",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.25s ease",
      }}>
        {activeArtifact && (
          <ArtifactCanvas
            artifact={activeArtifact}
            specialist={activeArtifactSpecialist}
            allArtifacts={artifactMessages}
            currentIdx={activeArtifactIdx}
            onPick={(i) => setPinnedArtifactIdx(i)}
          />
        )}
        {!activeArtifact && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--label-quaternary)", padding: 20 }}>
            <span style={{ fontSize: 32 }}>⎕</span>
            <p style={{ fontSize: 13, margin: 0, textAlign: "center" }}>Artifacts will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
