import { useEffect, useMemo, useState } from "react";
import { ListBox, Modal, SearchField } from "@heroui/react";

interface Command {
  id: string;
  label: string;
  view?: string;
  icon: string;
  category: string;
}

const COMMANDS: Command[] = [
  { id: "dashboard",    label: "Go to Dashboard",   view: "dashboard",    icon: "fa-table-cells-large", category: "Navigation" },
  { id: "conversation", label: "Open Conversation", view: "conversation", icon: "fa-comments",          category: "Navigation" },
  { id: "repositories", label: "Repositories",      view: "repositories", icon: "fa-code-branch",       category: "Navigation" },
  { id: "documents",    label: "Documents",         view: "documents",    icon: "fa-file-lines",        category: "Navigation" },
  { id: "designs",      label: "Designs",           view: "designs",      icon: "fa-pen-ruler",         category: "Navigation" },
  { id: "agents",       label: "Agents",            view: "agents",       icon: "fa-robot",             category: "Navigation" },
  { id: "inbox",        label: "Inbox",             view: "inbox",        icon: "fa-inbox",             category: "Navigation" },
  { id: "members",      label: "Members",           view: "members",      icon: "fa-users",             category: "Navigation" },
  { id: "settings",     label: "Settings",          view: "settings",     icon: "fa-gear",              category: "Navigation" },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string) => void;
  projectName: string;
}

export function CommandPalette({ isOpen, onOpenChange, onNavigate, projectName }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const filtered = useMemo(
    () => COMMANDS.filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="top">
          <Modal.Dialog className="sm:max-w-[560px]">
            <Modal.Header className="border-b border-separator px-4 py-3">
              <SearchField
                value={query}
                onChange={setQuery}
                autoFocus
                aria-label={`Search or ask TEOS about ${projectName}`}
                className="w-full"
              />
            </Modal.Header>
            <Modal.Body className="p-1">
              {filtered.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted">No commands found</p>
              ) : (
                <ListBox
                  aria-label="Commands"
                  selectionMode="single"
                  onAction={(key) => {
                    const cmd = COMMANDS.find((c) => c.id === key);
                    if (cmd?.view) onNavigate(cmd.view);
                    onOpenChange(false);
                  }}
                  className="max-h-[50vh] overflow-y-auto"
                >
                  {filtered.map((cmd) => (
                    <ListBox.Item key={cmd.id} id={cmd.id} textValue={cmd.label}>
                      <i className={`fa-solid ${cmd.icon} w-5 shrink-0 text-center text-muted`} aria-hidden />
                      <span className="flex-1">{cmd.label}</span>
                      <span className="ms-auto text-[11px] text-muted">{cmd.category}</span>
                    </ListBox.Item>
                  ))}
                </ListBox>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
