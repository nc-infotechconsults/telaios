import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
} from "../ui";
import { patchWorkspace } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { Workspace, WorkspaceConfig } from "../../types";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace | null;
  onUpdate: (ws: Workspace) => void;
}

interface EnvVar {
  key: string;
  value: string;
}

export default function WorkspaceEditModal({
  isOpen,
  onOpenChange,
  workspace,
  onUpdate,
}: Props) {
  const [name, setName] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [image, setImage] = useState("");
  const [postCreateCommand, setPostCreateCommand] = useState("");
  const [extensions, setExtensions] = useState("");
  const [defaultOpenFiles, setDefaultOpenFiles] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate from workspace when opened
  useEffect(() => {
    if (workspace && isOpen) {
      setName(workspace.name);
      const cfg = workspace.config;
      setEnvVars(
        Object.entries(cfg.env_vars ?? {}).map(([key, value]) => ({ key, value })),
      );
      setImage(cfg.devcontainer_overrides?.image ?? "");
      setPostCreateCommand(cfg.devcontainer_overrides?.postCreateCommand ?? "");
      setExtensions(cfg.devcontainer_overrides?.extensions?.join(", ") ?? "");
      setDefaultOpenFiles(cfg.default_open_files?.join(", ") ?? "");
    }
  }, [workspace, isOpen]);

  const isFormValid = name.trim().length > 0;

  function addEnvVar() {
    setEnvVars((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeEnvVar(index: number) {
    setEnvVars((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEnvVar(index: number, field: "key" | "value", val: string) {
    setEnvVars((prev) => prev.map((ev, i) => (i === index ? { ...ev, [field]: val } : ev)));
  }

  async function handleSave() {
    if (!workspace || !isFormValid) return;
    setSaving(true);
    try {
      const config: WorkspaceConfig = { ...workspace.config };

      // Env vars
      const envMap: Record<string, string> = {};
      for (const ev of envVars) {
        if (ev.key.trim()) envMap[ev.key.trim()] = ev.value;
      }
      config.env_vars = Object.keys(envMap).length > 0 ? envMap : undefined;

      // Devcontainer overrides
      if (image.trim() || postCreateCommand.trim() || extensions.trim()) {
        config.devcontainer_overrides = {
          ...(image.trim() ? { image: image.trim() } : {}),
          ...(postCreateCommand.trim() ? { postCreateCommand: postCreateCommand.trim() } : {}),
          ...(extensions.trim()
            ? {
                extensions: extensions
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : {}),
        };
      } else {
        config.devcontainer_overrides = undefined;
      }

      // Default open files
      config.default_open_files = defaultOpenFiles.trim()
        ? defaultOpenFiles
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      const updated = await patchWorkspace(workspace.id, {
        name: name.trim(),
        config,
      } as Partial<Workspace>);
      toast.success("Workspace updated", updated.name);
      onUpdate(updated);
      onOpenChange(false);
    } catch {
      toast.error("Failed to update workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Edit Workspace</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              <Input
                label="Workspace name"
                value={name}
                onValueChange={setName}
                isRequired
                autoFocus
              />

              {/* Details */}
              {workspace && (
                <div className="text-xs text-default-400 space-y-1">
                  <p>Status: <span className="font-medium text-default-600">{workspace.status}</span></p>
                  {workspace.container_id && <p>Container: <span className="font-mono">{workspace.container_id.slice(0, 12)}</span></p>}
                  {workspace.container_image && <p>Image: <span className="font-mono">{workspace.container_image}</span></p>}
                  {workspace.ide_url && <p>IDE: <a href={workspace.ide_url} target="_blank" rel="noreferrer" className="text-primary underline">{workspace.ide_url}</a></p>}
                </div>
              )}

              {/* Environment variables */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Environment Variables</p>
                  <Button size="sm" variant="flat" onPress={addEnvVar}>
                    + Add
                  </Button>
                </div>
                {envVars.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {envVars.map((ev, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          size="sm"
                          placeholder="KEY"
                          value={ev.key}
                          onValueChange={(v) => updateEnvVar(i, "key", v)}
                          className="flex-1"
                        />
                        <Input
                          size="sm"
                          placeholder="value"
                          value={ev.value}
                          onValueChange={(v) => updateEnvVar(i, "value", v)}
                          className="flex-1"
                        />
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={() => removeEnvVar(i)}
                          aria-label="Remove variable"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Devcontainer overrides */}
              <div>
                <p className="text-sm font-medium mb-2">Devcontainer Overrides</p>
                <div className="flex flex-col gap-3">
                  <Input
                    size="sm"
                    label="Custom image"
                    placeholder="mcr.microsoft.com/devcontainers/base:ubuntu"
                    value={image}
                    onValueChange={setImage}
                  />
                  <Textarea
                    size="sm"
                    label="Post-create command"
                    placeholder="npm install"
                    value={postCreateCommand}
                    onValueChange={setPostCreateCommand}
                    minRows={1}
                  />
                  <Input
                    size="sm"
                    label="VS Code extensions (comma-separated)"
                    placeholder="ms-python.python, esbenp.prettier-vscode"
                    value={extensions}
                    onValueChange={setExtensions}
                  />
                </div>
              </div>

              <Input
                size="sm"
                label="Default open files (comma-separated)"
                placeholder="README.md, src/index.ts"
                value={defaultOpenFiles}
                onValueChange={setDefaultOpenFiles}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={saving}>
                Cancel
              </Button>
              <Button
                color="primary"
                isLoading={saving}
                isDisabled={!isFormValid}
                onPress={handleSave}
              >
                Save Changes
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
