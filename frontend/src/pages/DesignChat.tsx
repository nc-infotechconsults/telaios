import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, CardBody, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Spinner, Textarea, useDisclosure } from "@heroui/react";
import ChatInput from "../components/chat/ChatInput";
import MessageBubble from "../components/chat/MessageBubble";
import { createDesignSession, getDesignArtifacts, getDesignMessages, getDesignSession, listLibraryAgents, patchDesignSession } from "../lib/api";
import { useDesignSSE } from "../lib/sse";
import { toast } from "../lib/toast";
import type { DesignArtifact, DesignMessage, DesignSession, DesignWsEvent, LibraryAgent, Message } from "../types";

function toMessage(m: DesignMessage): Message {
  return {
    id: m.id,
    project_id: "",
    role: m.role,
    content: m.content,
    created_at: m.created_at,
  };
}

function buildPreviewDoc(artifact: DesignArtifact): string {
  const css = artifact.css_content ?? "";
  const js = artifact.js_content ?? "";
  return `<!doctype html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><style>${css}</style></head><body>${artifact.html_content}<script>${js}</script></body></html>`;
}

export default function DesignChat() {
  const { projectId, designSessionId } = useParams<{ projectId: string; designSessionId?: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<DesignSession | null>(null);
  const [messages, setMessages] = useState<DesignMessage[]>([]);
  const [artifacts, setArtifacts] = useState<DesignArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);

  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [designerAgents, setDesignerAgents] = useState<LibraryAgent[]>([]);
  const [selectedDesignerAgentId, setSelectedDesignerAgentId] = useState<string>("");
  const [sessionDesignerAgentId, setSessionDesignerAgentId] = useState<string>("");
  const [swappingAgent, setSwappingAgent] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    listLibraryAgents({ role: "designer", limit: 100 })
      .then((agents) => {
        setDesignerAgents(agents);
        const defaultAgent = agents.find((a) => a.role === "designer" && a.agent_type === "system");
        if (defaultAgent) {
          setSelectedDesignerAgentId(defaultAgent.id);
        } else if (agents.length > 0) {
          setSelectedDesignerAgentId(agents[0].id);
        } else {
          setSelectedDesignerAgentId("");
        }
      })
      .catch(() => {
        setDesignerAgents([]);
        setSelectedDesignerAgentId("");
      });
  }, [isOpen]);

  useEffect(() => {
    if (!projectId) return;
    if (!designSessionId) {
      setLoading(false);
      onOpen();
      return;
    }

    setLoading(true);
    Promise.all([
      getDesignSession(designSessionId),
      getDesignMessages(designSessionId),
      getDesignArtifacts(designSessionId),
      listLibraryAgents({ role: "designer", limit: 100 }),
    ])
      .then(([s, msg, arts, agents]) => {
        setSession(s);
        setMessages(msg);
        setArtifacts(arts);
        setDesignerAgents(agents);
        const currentAgentId = s.designer_agent_id ?? "";
        setSessionDesignerAgentId(currentAgentId);
        if (arts.length > 0) setActiveArtifactId(arts[arts.length - 1].id);
      })
      .catch(() => toast.error("Failed to load design session"))
      .finally(() => setLoading(false));
  }, [projectId, designSessionId, onOpen]);

  const activeSessionId = designSessionId;
  const { sendMessage } = useDesignSSE(activeSessionId, (event: DesignWsEvent) => {
    if (event.type === "design_chat_thinking") {
      setIsStreaming(true);
      setStreamingText("");
      return;
    }
    if (event.type === "design_chat_token") {
      setIsStreaming(true);
      setStreamingText((prev) => prev + event.content);
      return;
    }
    if (event.type === "design_message") {
      setMessages((prev) => [...prev, event.data]);
      return;
    }
    if (event.type === "design_artifact") {
      setArtifacts((prev) => [...prev, event.artifact]);
      setActiveArtifactId(event.artifact.id);
      return;
    }
    if (event.type === "design_chat_end") {
      setIsStreaming(false);
      setStreamingText("");
      return;
    }
    if (event.type === "error") {
      setIsStreaming(false);
      toast.error("Design chat error", event.message);
    }
  });

  const handleCreateSession = async () => {
    if (!projectId) return;
    setCreating(true);
    try {
      const created = await createDesignSession(
        projectId,
        newTitle.trim() || undefined,
        selectedDesignerAgentId || undefined,
      );
      onOpenChange();
      setNewTitle("");
      setSelectedDesignerAgentId("");
      navigate(`/projects/${projectId}/design/${created.id}`);
    } catch {
      toast.error("Failed to create design session");
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (content: string) => {
    if (!activeSessionId) return;
    setIsStreaming(true);
    try {
      await sendMessage(content);
    } catch {
      setIsStreaming(false);
      toast.error("Failed to send prompt");
    }
  };

  const activeArtifact = useMemo(() => {
    if (artifacts.length === 0) return null;
    return artifacts.find((a) => a.id === activeArtifactId) ?? artifacts[artifacts.length - 1];
  }, [artifacts, activeArtifactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" label="Loading design studio..." />
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-full lg:w-[42%] border-r border-divider flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-divider flex items-center gap-2">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            aria-label="Back to project"
            className="text-default-400 hover:text-foreground transition-colors text-sm"
          >
            ←
          </button>
          <span className="text-default-300" aria-hidden="true">/</span>
          <h1 className="font-semibold truncate text-sm sm:text-base">
            {session?.title ?? "Design Studio"}
          </h1>
          {session && (
            <>
              <Select
                size="sm"
                aria-label="Designer agent"
                className="ml-auto w-40"
                selectedKeys={sessionDesignerAgentId ? new Set([sessionDesignerAgentId]) : new Set()}
                onSelectionChange={async (keys) => {
                  const key = Array.from(keys)[0] as string | undefined;
                  if (!key || key === sessionDesignerAgentId || !designSessionId) return;
                  setSwappingAgent(true);
                  try {
                    const updated = await patchDesignSession(designSessionId, key);
                    setSession(updated);
                    setSessionDesignerAgentId(key);
                    toast.success("Designer agent updated");
                  } catch {
                    toast.error("Failed to update designer agent");
                  } finally {
                    setSwappingAgent(false);
                  }
                }}
                isDisabled={swappingAgent || isStreaming}
              >
                {designerAgents.map((agent) => (
                  <SelectItem key={agent.id} textValue={agent.name}>
                    {agent.name}
                  </SelectItem>
                ))}
              </Select>
              <Chip size="sm" variant="flat" color="primary">
                {session.status}
              </Chip>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {messages.length === 0 && !isStreaming && (
            <div className="h-52 flex items-center justify-center text-sm text-default-500 text-center px-6">
              Start by describing the interface you want to design.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={toMessage(m)} />
          ))}
          {streamingText && (
            <div className="flex justify-start mb-3">
              <div className="max-w-[80%] flex flex-col gap-1 items-start">
                <span className="text-xs text-default-400 px-1" aria-hidden="true">Design Agent</span>
                <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm bg-default-100 leading-relaxed whitespace-pre-wrap">
                  {streamingText}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-divider px-3 py-3">
          <ChatInput
            onSend={handleSend}
            disabled={!activeSessionId || isStreaming}
            placeholder="Describe the UI to generate or revise..."
          />
        </div>
      </div>

      <div className="hidden lg:flex flex-1 min-w-0 flex-col bg-default-50">
        <div className="px-4 py-3 border-b border-divider flex items-center gap-2">
          <span className="text-sm font-semibold">Preview</span>
          {activeArtifact && (
            <Chip size="sm" variant="flat" color="warning">
              Revision {activeArtifact.revision}
            </Chip>
          )}
          <div className="ml-auto flex items-center gap-2 overflow-x-auto">
            {artifacts.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant={a.id === activeArtifact?.id ? "solid" : "bordered"}
                color={a.id === activeArtifact?.id ? "primary" : "default"}
                onPress={() => setActiveArtifactId(a.id)}
              >
                r{a.revision}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {activeArtifact ? (
            <Card className="h-full">
              <CardBody className="p-0 overflow-hidden">
                <iframe
                  key={activeArtifact.id}
                  srcDoc={buildPreviewDoc(activeArtifact)}
                  title={`Design preview revision ${activeArtifact.revision}`}
                  sandbox="allow-scripts"
                  className="w-full h-full border-0"
                />
              </CardBody>
            </Card>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-default-500">
              No design artifacts yet. Send a prompt to generate the first revision.
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm" isDismissable={false} hideCloseButton>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Create Design Session</ModalHeader>
              <ModalBody className="gap-4">
                <Textarea
                  autoFocus
                  label="Session title"
                  placeholder="e.g. Marketing landing redesign"
                  minRows={2}
                  value={newTitle}
                  onValueChange={setNewTitle}
                />
                <Select
                  label="Designer agent"
                  placeholder="Select a designer agent"
                  selectedKeys={selectedDesignerAgentId ? new Set([selectedDesignerAgentId]) : new Set()}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0] as string | undefined;
                    setSelectedDesignerAgentId(key ?? "");
                  }}
                >
                  {designerAgents.map((agent) => (
                    <SelectItem key={agent.id} textValue={agent.name}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => navigate(`/projects/${projectId}`)}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleCreateSession} isLoading={creating}>
                  Create
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
