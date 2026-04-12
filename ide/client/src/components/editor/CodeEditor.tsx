import MonacoEditor, { type OnMount, type Monaco } from "@monaco-editor/react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorTabBar } from "./EditorTabBar";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { useCallback, useRef } from "react";
import { FileCode, Keyboard } from "lucide-react";

interface Props {
  workspaceId: string;
}

export function CodeEditor({ workspaceId }: Props) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const saveTab = useEditorStore((s) => s.saveTab);
  const setCursor = useEditorStore((s) => s.setCursor);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const handleMount: OnMount = useCallback(
    (editor, monaco: Monaco) => {
      editorRef.current = editor;

      // Save on Ctrl/Cmd+S
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (activeTabId) saveTab(workspaceId, activeTabId);
      });

      editor.onDidChangeCursorPosition((e) => {
        if (activeTabId) {
          setCursor(
            activeTabId,
            e.position.lineNumber,
            e.position.column,
          );
        }
      });
    },
    [activeTabId, workspaceId, saveTab, setCursor],
  );

  if (!activeTab) {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EditorTabBar workspaceId={workspaceId} />
        <div className="flex-1 flex items-center justify-center select-none p-6">
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] rounded-2xl p-10 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-500/20 to-cyan-500/20 flex items-center justify-center mb-6 shadow-inner border border-white/5">
              <FileCode className="text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Editor</h3>
            <p className="text-zinc-400 text-sm mb-8">
              Open a file from the explorer to start coding.
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500 bg-black/20 px-3 py-1.5 rounded-full border border-white/[0.05]">
              <Keyboard size={14} className="text-zinc-400" />
              <span>Cmd+S or Ctrl+S to save</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      <EditorTabBar workspaceId={workspaceId} />
      <EditorBreadcrumb path={activeTab.path} />
      <div className="flex-1 monaco-host bg-[#0a0a0c]">
        <MonacoEditor
          key={activeTab.id}
          language={activeTab.language}
          value={activeTab.content}
          theme="vs-dark"
          onMount={handleMount}
          onChange={(value) => {
            if (activeTabId && value !== undefined) {
              updateTabContent(activeTabId, value);
            }
          }}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontLigatures: true,
            lineHeight: 20,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: "off",
            tabSize: 2,
            insertSpaces: true,
            smoothScrolling: true,
            cursorBlinking: "phase",
            automaticLayout: true,
            padding: { top: 12 },
          }}
        />
      </div>
    </div>
  );
}