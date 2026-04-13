// ─── IDEShell ──────────────────────────────────────────────────────────────────
//
// Top-level IDE component. Orchestrates:
//   - WebSocket connection lifecycle
//   - Workspace heartbeat
//   - Core tool window & command bootstrap
//   - Responsive layout: MobileShell on phone, ToolWindowManager on desktop
//
// THE CUTOVER (Task 9):
//   Replaced PanelLayout with ToolWindowManager + HeaderToolbar.
//   Wired file commands to editorStore actions.
//
// Task 12 — Mobile:
//   Added useBreakpoint hook to conditionally render MobileShell on phone/tablet.
//   Desktop continues using ToolWindowManager + HeaderToolbar.
// ──────────────────────────────────────────────────────────────────────────────

import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { ws } from "@/lib/ws";
import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "@/types";
import { ToolWindowManager } from "./ToolWindowManager";
import { HeaderToolbar } from "./HeaderToolbar";
import { MobileShell } from "./MobileShell";
import { EditorArea } from "@/components/editor/EditorArea";
import {
  bootstrapCoreToolWindows,
  WorkspaceIdProvider,
} from "@/core/bootstrap";
import { loadBundledPlugins } from "@/core/bundled-plugins";
import { pluginHost } from "@/core/plugin-host";
import { commandRegistry } from "@/core/commands";
import { api } from "@/lib/api";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { QuickOpen } from "@/components/ui/QuickOpen";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { InputDialog } from "@/components/ui/InputDialog";
import { KeyboardShortcutsDialog } from "@/components/ui/KeyboardShortcutsDialog";
import { AboutDialog } from "@/components/ui/AboutDialog";
import type { Disposable } from "@/types/plugin";

export function IDEShell() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const heartbeat = useWorkspaceStore((s) => s.heartbeat);
  const bootstrapRef = useRef<Disposable | null>(null);
  const { isMobile } = useBreakpoint();

  // ── Input dialog state (replaces window.prompt) ──────────────────────────
  const [inputDialog, setInputDialog] = useState<{
    open: boolean;
    title: string;
    placeholder: string;
    onConfirm: (value: string) => void;
  }>({ open: false, title: "", placeholder: "", onConfirm: () => {} });

  const closeInputDialog = useCallback(
    () => setInputDialog((prev) => ({ ...prev, open: false })),
    []
  );

  // Resolve null when input dialog is cancelled
  const inputDialogCancelRef = useRef<(() => void) | null>(null);
  const handleInputCancel = useCallback(() => {
    closeInputDialog();
    inputDialogCancelRef.current?.();
  }, [closeInputDialog]);

  const promptUserWithCancel = useCallback(
    (title: string, placeholder: string): Promise<string | null> =>
      new Promise((resolve) => {
        inputDialogCancelRef.current = () => resolve(null);
        setInputDialog({
          open: true,
          title,
          placeholder,
          onConfirm: (value) => {
            inputDialogCancelRef.current = null;
            setInputDialog((prev) => ({ ...prev, open: false }));
            resolve(value);
          },
        });
      }),
    []
  );

  // ── Bootstrap core tool windows + bundled plugins (once) ───────────────────
  useEffect(() => {
    bootstrapRef.current = bootstrapCoreToolWindows();
    loadBundledPlugins();
    const eventWatchers = pluginHost.startEventWatchers();
    return () => {
      eventWatchers.dispose();
      bootstrapRef.current?.dispose();
      bootstrapRef.current = null;
    };
  }, []);

  // ── Wire file commands to editorStore ───────────────────────────────────────
  // These commands were registered as stubs in bootstrap. Now we overwrite
  // their handlers with real implementations that reference the workspace.
  useEffect(() => {
    if (!activeWorkspace) return;

    const wid = activeWorkspace.id;
    const disposables: Disposable[] = [];

    disposables.push(
      commandRegistry.register(
        {
          id: "file.save",
          label: "Save",
          category: "File",
          handler: async () => {
            const { activeTabId, saveTab } = useEditorStore.getState();
            if (activeTabId) await saveTab(wid, activeTabId);
          },
        },
        "core"
      )
    );

    disposables.push(
      commandRegistry.register(
        {
          id: "file.saveAll",
          label: "Save All",
          category: "File",
          handler: async () => {
            const { getAllTabs, saveTab } = useEditorStore.getState();
            for (const tab of getAllTabs()) {
              if (tab.isDirty) await saveTab(wid, tab.id);
            }
          },
        },
        "core"
      )
    );

    disposables.push(
      commandRegistry.register(
        {
          id: "file.closeTab",
          label: "Close Tab",
          category: "File",
          handler: () => {
            const { activeTabId, closeTab } = useEditorStore.getState();
            if (activeTabId) closeTab(activeTabId);
          },
        },
        "core"
      )
    );

    /** Derive the directory path from the currently active tab's file path. */
    function activeDirPath(): string {
      const activeTabPath = useEditorStore.getState().activeTabId;
      if (!activeTabPath) return ".";
      const slash = activeTabPath.lastIndexOf("/");
      return slash > 0 ? activeTabPath.slice(0, slash) : ".";
    }

    disposables.push(
      commandRegistry.register(
        {
          id: "file.newFile",
          label: "New File",
          category: "File",
          handler: async () => {
            const filename = await promptUserWithCancel("New File", "filename.ts");
            if (!filename) return;
            const dirPath = activeDirPath();
            await api.workspaces.createFile(wid, dirPath, filename);
            await useFileTreeStore.getState().refreshDir(wid, dirPath);
            const fullPath = dirPath === "." ? filename : `${dirPath}/${filename}`;
            await useEditorStore.getState().openFile(wid, fullPath);
          },
        },
        "core"
      )
    );

    disposables.push(
      commandRegistry.register(
        {
          id: "file.newFolder",
          label: "New Folder",
          category: "File",
          handler: async () => {
            const foldername = await promptUserWithCancel("New Folder", "folder-name");
            if (!foldername) return;
            const dirPath = activeDirPath();
            await api.workspaces.createFolder(wid, dirPath, foldername);
            await useFileTreeStore.getState().refreshDir(wid, dirPath);
          },
        },
        "core"
      )
    );

    return () => disposables.forEach((d) => d.dispose());
  }, [activeWorkspace?.id]);

  // ── Connect WebSocket when workspace becomes active ─────────────────────────
  useEffect(() => {
    if (!activeWorkspace) return;
    ws.connect(activeWorkspace.id);

    const unsub = ws.onMessage((msg: WsMessage) => {
      if (msg.type === "container:status") {
        // handled downstream
      }
    });

    return () => {
      unsub();
      ws.disconnect();
    };
  }, [activeWorkspace?.id]);

  // ── Heartbeat every 30s ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeWorkspace) return;
    const id = setInterval(() => heartbeat(activeWorkspace.id), 30_000);
    return () => clearInterval(id);
  }, [activeWorkspace?.id]);

  if (!activeWorkspace) return null;

  const workspaceId = activeWorkspace.id;
  const editor = <EditorArea />;

  return (
    <WorkspaceIdProvider workspaceId={workspaceId}>
      {isMobile ? (
        <MobileShell workspaceId={workspaceId} editorSlot={editor} />
      ) : (
        <ToolWindowManager
          workspaceId={workspaceId}
          headerSlot={<HeaderToolbar />}
          editorSlot={editor}
        />
      )}
      <CommandPalette />
      <QuickOpen />
      <ThemeSwitcher />
      <KeyboardShortcutsDialog />
      <AboutDialog />
      <InputDialog
        open={inputDialog.open}
        title={inputDialog.title}
        placeholder={inputDialog.placeholder}
        onConfirm={inputDialog.onConfirm}
        onCancel={handleInputCancel}
      />
    </WorkspaceIdProvider>
  );
}
