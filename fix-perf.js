const fs = require('fs');
const path = require('path');

function replaceAll(str, find, replace) {
  return str.split(find).join(replace);
}

// 1. Fix agentStore.ts
const storePath = 'ide/client/src/plugins/agent/agentStore.ts';
let store = fs.readFileSync(storePath, 'utf8');

// Add buffering and remove duration timer
store = replaceAll(store, 
`let _eventSource: EventSource | null = null;
let _sessionStartTime: number = Date.now();
// Interval for updating the elapsed sessionDuration counter
let _durationInterval: ReturnType<typeof setInterval> | null = null;`, 
`let _eventSource: EventSource | null = null;
let _sessionStartTime: number = Date.now();

const _partBuffer = new Map<string, import("./agentStore").AgentPart>();
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function _flushPartBuffer() {
  _flushTimer = null;
  if (_partBuffer.size === 0) return;

  const grouped = new Map<string, import("./agentStore").AgentPart[]>();
  for (const [key, part] of _partBuffer.entries()) {
    const msgId = key.split(":")[0];
    let arr = grouped.get(msgId);
    if (!arr) {
      arr = [];
      grouped.set(msgId, arr);
    }
    arr.push(part);
  }
  _partBuffer.clear();

  useAgentStore.setState((s) => {
    let messages = [...s.messages];
    for (const [msgId, parts] of grouped.entries()) {
      const msgIdx = messages.findIndex((m) => m.id === msgId);
      if (msgIdx < 0) {
        messages.push({
          id: msgId,
          role: "assistant",
          parts,
          timestamp: Date.now(),
        });
      } else {
        const msg = messages[msgIdx];
        let nextParts = [...msg.parts];
        for (const part of parts) {
          const pIdx = nextParts.findIndex((p) => p.id === part.id);
          if (pIdx >= 0) nextParts[pIdx] = part;
          else nextParts.push(part);
        }
        messages[msgIdx] = { ...msg, parts: nextParts };
      }
    }
    return { messages, isStreaming: true };
  });
}`);

// Remove timer functions
store = replaceAll(store, 
`function startDurationTick() {
  if (_durationInterval) clearInterval(_durationInterval);
  _durationInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
    useAgentStore.setState((s) => ({
      metrics: { ...s.metrics, sessionDuration: elapsed },
    }));
  }, 1000);
}

function stopDurationTick() {
  if (_durationInterval) {
    clearInterval(_durationInterval);
    _durationInterval = null;
  }
}`,
`function startDurationTick() {
  useAgentStore.setState({ streamingStartTime: Date.now() });
}
function stopDurationTick() {
  useAgentStore.setState({ streamingStartTime: null });
}`);

store = replaceAll(store,
`  messages: AgentMessage[];
  isStreaming: boolean;
  metrics: AgentMetrics;`,
`  messages: AgentMessage[];
  isStreaming: boolean;
  streamingStartTime: number | null;
  metrics: AgentMetrics;`);

store = replaceAll(store,
`  isStreaming: false,
  metrics: DEFAULT_METRICS,`,
`  isStreaming: false,
  streamingStartTime: null,
  metrics: DEFAULT_METRICS,`);

// Buffer in _addOrUpdatePart
store = replaceAll(store,
`      _addOrUpdatePart(messageId, part) {
        set((s) => {
          // Find the message; if missing, create a placeholder
          const msgIdx = s.messages.findIndex((m) => m.id === messageId);
          if (msgIdx < 0) {
            const newMsg: AgentMessage = {
              id: messageId,
              role: "assistant",
              parts: [part],
              timestamp: Date.now(),
            };
            return {
              messages: [...s.messages, newMsg],
              isStreaming: true,
            };
          }
          const msg = s.messages[msgIdx];
          const partIdx = msg.parts.findIndex((p) => p.id === part.id);
          const nextParts =
            partIdx >= 0
              ? msg.parts.map((p, i) => (i === partIdx ? part : p))
              : [...msg.parts, part];
          const nextMsg = { ...msg, parts: nextParts };
          return {
            messages: s.messages.map((m, i) => (i === msgIdx ? nextMsg : m)),
            isStreaming: true,
          };
        });
      },`,
`      _addOrUpdatePart(messageId, part) {
        _partBuffer.set(\`\${messageId}:\${part.id}\`, part);
        if (!_flushTimer) _flushTimer = setTimeout(_flushPartBuffer, 80);
      },`);

// Remove computeMetrics from _updateMessage
store = replaceAll(store,
`      _updateMessage(msg) {
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === msg.id);
          const next =
            idx >= 0
              ? s.messages.map((m, i) => (i === idx ? msg : m))
              : [...s.messages, msg];
          const elapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
          return {
            messages: next,
            metrics: computeMetrics(next, elapsed),
          };
        });
      },`,
`      _updateMessage(msg) {
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === msg.id);
          const next =
            idx >= 0
              ? s.messages.map((m, i) => (i === idx ? msg : m))
              : [...s.messages, msg];
          return { messages: next };
        });
      },`);

fs.writeFileSync(storePath, store);

// 2. Fix AgentMetrics.tsx (Local timer)
const metricsPath = 'ide/client/src/plugins/agent/AgentMetrics.tsx';
let metrics = fs.readFileSync(metricsPath, 'utf8');

metrics = replaceAll(metrics, 
`import { useState } from "react";`,
`import { useState, useEffect } from "react";`);

metrics = replaceAll(metrics,
`  const metrics = useAgentStore((s) => s.metrics);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const [expanded, setExpanded] = useState(false);`,
`  const metrics = useAgentStore((s) => s.metrics);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const streamingStartTime = useAgentStore((s) => s.streamingStartTime);
  const [expanded, setExpanded] = useState(false);
  const [liveDuration, setLiveDuration] = useState(metrics.sessionDuration);

  useEffect(() => {
    if (!streamingStartTime) {
      setLiveDuration(metrics.sessionDuration);
      return;
    }
    const interval = setInterval(() => {
      setLiveDuration(Math.floor((Date.now() - streamingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [streamingStartTime, metrics.sessionDuration]);`);

metrics = replaceAll(metrics,
`            value={formatDuration(metrics.sessionDuration)}`,
`            value={formatDuration(liveDuration)}`);

fs.writeFileSync(metricsPath, metrics);

// 3. Fix AgentConversation.tsx (memo, remarkPlugins, AnimatePresence)
const convPath = 'ide/client/src/plugins/agent/AgentConversation.tsx';
let conv = fs.readFileSync(convPath, 'utf8');

conv = replaceAll(conv,
`const markdownComponents: Components = {`,
`const REMARK_PLUGINS = [remarkGfm] as const;

const markdownComponents: Components = {`);

conv = replaceAll(conv,
`function MessageContent({ parts }: { parts: AgentPart[] }) {`,
`const MessageContent = React.memo(function MessageContent({ parts }: { parts: AgentPart[] }) {`);

conv = replaceAll(conv,
`            remarkPlugins={[remarkGfm]}`,
`            remarkPlugins={REMARK_PLUGINS}`);

conv = replaceAll(conv,
`  return <div className="flex flex-col gap-2.5">{rendered}</div>;
}`,
`  return <div className="flex flex-col gap-2.5">{rendered}</div>;
});`);

conv = replaceAll(conv,
`      <AnimatePresence initial={false}>
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLastMessage={idx === messages.length - 1}
            isStreaming={isStreaming}
          />
        ))}
      </AnimatePresence>`,
`        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLastMessage={idx === messages.length - 1}
            isStreaming={isStreaming}
          />
        ))}`);

// Auto scroll fix
conv = replaceAll(conv,
`  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming]);`,
`  // Force update scroll during streaming
  const lastMsgPartsCount = messages[messages.length - 1]?.parts.length ?? 0;
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming, lastMsgPartsCount]);

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 500);
    return () => clearInterval(interval);
  }, [isStreaming]);`);

fs.writeFileSync(convPath, conv);

// 4. Fix AgentPanel.tsx
const panelPath = 'ide/client/src/plugins/agent/AgentPanel.tsx';
let panel = fs.readFileSync(panelPath, 'utf8');
panel = replaceAll(panel,
`  const sessions = useAgentStore((s) => s.sessions);`,
`  const hasSessions = useAgentStore((s) => s.sessions.length > 0);`);
panel = replaceAll(panel,
`sessions.length === 0`,
`!hasSessions`);
fs.writeFileSync(panelPath, panel);

// 5. Fix ToolCallCard.tsx
const cardPath = 'ide/client/src/plugins/agent/ToolCallCard.tsx';
let card = fs.readFileSync(cardPath, 'utf8');

card = replaceAll(card,
`export function ToolCallCard({ part, resultPart }: Props) {`,
`const motionInitial = { opacity: 0, y: 4 };
const motionAnimate = { opacity: 1, y: 0 };
const bodyInitial = { height: 0 };
const bodyAnimate = { height: "auto" };
const bodyExit = { height: 0 };
const bodyTransition = { duration: 0.15 };

export const ToolCallCard = React.memo(function ToolCallCard({ part, resultPart }: Props) {`);

card = replaceAll(card, 
`import { useState } from "react";`,
`import React, { useState, useMemo } from "react";`);

card = replaceAll(card,
`  // Get a short summary from args
  const argsSummary = (() => {`,
`  // Get a short summary from args
  const argsSummary = useMemo(() => {`);
card = replaceAll(card,
`    return typeof val === "string" ? val : String(val);
  })();`,
`    return typeof val === "string" ? val : String(val);
  }, [part.toolArgs]);`);

card = replaceAll(card,
`    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}`,
`    <motion.div
      initial={motionInitial}
      animate={motionAnimate}`);

card = replaceAll(card,
`          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}`,
`          <motion.div
            initial={bodyInitial}
            animate={bodyAnimate}
            exit={bodyExit}
            transition={bodyTransition}`);

card = replaceAll(card,
`  );
}`,
`  );
});`);

fs.writeFileSync(cardPath, card);

// 6. Fix AgentSessionList.tsx
const listPath = 'ide/client/src/plugins/agent/AgentSessionList.tsx';
let list = fs.readFileSync(listPath, 'utf8');

list = replaceAll(list,
`import { useState, useMemo } from "react";`,
`import React, { useState, useMemo, useCallback } from "react";`);

list = replaceAll(list,
`function SessionTab({`,
`const SessionTab = React.memo(function SessionTab({`);

list = replaceAll(list,
`  );
}`,
`  );
});`);

list = replaceAll(list,
`  function handleContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, sessionId: id });
  }

  function handleDelete(id: string) {
    setMenu(null);
    onDelete(id);
  }`,
`  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, sessionId: id });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setMenu(null);
    onDelete(id);
  }, [onDelete]);`);

fs.writeFileSync(listPath, list);

// 7. Fix index.ts (Dedup statusBar updates)
const indexPath = 'ide/client/src/plugins/agent/index.ts';
let idx = fs.readFileSync(indexPath, 'utf8');

idx = replaceAll(idx,
`  // Keep status bar text updated based on store state
  const unsubscribe = useAgentStore.subscribe((state) => {
    const { connectionStatus, isStreaming, metrics } = state;
    let text = "Agent";

    if (connectionStatus === "connected") {
      if (isStreaming) {
        text = "Agent ●";
      } else if (metrics.tokensIn + metrics.tokensOut > 0) {
        const total = metrics.tokensIn + metrics.tokensOut;
        const k = total >= 1000 ? \`\${(total / 1000).toFixed(1)}k\` : String(total);
        text = \`Agent \${k}t\`;
      }
    } else if (connectionStatus === "connecting") {
      text = "Agent ···";
    } else if (connectionStatus === "error") {
      text = "Agent ✕";
    }

    context.statusBar.updateItem("agentscope.agent.status", { content: text });
  });`,
`  // Keep status bar text updated based on store state
  let lastStatusText = "";
  const unsubscribe = useAgentStore.subscribe((state) => {
    const { connectionStatus, isStreaming, metrics } = state;
    let text = "Agent";

    if (connectionStatus === "connected") {
      if (isStreaming) {
        text = "Agent ●";
      } else if (metrics.tokensIn + metrics.tokensOut > 0) {
        const total = metrics.tokensIn + metrics.tokensOut;
        const k = total >= 1000 ? \`\${(total / 1000).toFixed(1)}k\` : String(total);
        text = \`Agent \${k}t\`;
      }
    } else if (connectionStatus === "connecting") {
      text = "Agent ···";
    } else if (connectionStatus === "error") {
      text = "Agent ✕";
    }

    if (text !== lastStatusText) {
      lastStatusText = text;
      context.statusBar.updateItem("agentscope.agent.status", { content: text });
    }
  });`);

fs.writeFileSync(indexPath, idx);

console.log('Perf fixes applied');
