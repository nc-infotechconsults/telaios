import { useState } from "react";
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
import { createWorkspace } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { Workspace, Repository, WorkspaceConfig } from "../../types";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  repositories: Repository[];
  onCreate: (ws: Workspace) => void;
}

interface EnvVar {
  key: string;
  value: string;
}

const EMPTY_FORM = {
  name: "",
  image: "",
  postCreateCommand: "",
  extensions: "",
  defaultOpenFiles: "",
};

export default function WorkspaceCreateModal({
  isOpen,
  onOpenChange,
  projectId,
  repositories,
  onCreate,
}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Record<string, { branch: string; enabled: boolean }>>({});
  const [saving, setSaving] = useState(false);

  const isFormValid = form.name.trim().length > 0;

  function resetForm() {
    setForm(EMPTY_FORM);
    setEnvVars([]);
    setSelectedRepos({});
  }

  function handleRepoToggle(repo: Repository) {
    setSelectedRepos((prev) => {
      const copy = { ...prev };
      if (copy[repo.name]) {
        delete copy[repo.name];
      } else {
        copy[repo.name] = { branch: repo.branch ?? "main", enabled: true };
      }
      return copy;
    });
  }

  function handleRepoBranchChange(repoName: string, branch: string) {
    setSelectedRepos((prev) => ({
      ...prev,
      [repoName]: { ...prev[repoName], branch },
    }));
  }

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
    if (!isFormValid) return;
    setSaving(true);
    try {
      const config: WorkspaceConfig = {};

      // Repos
      if (Object.keys(selectedRepos).length > 0) {
        config.repositories = selectedRepos;
      }

      // Env vars
      const envMap: Record<string, string> = {};
      for (const ev of envVars) {
        if (ev.key.trim()) envMap[ev.key.trim()] = ev.value;
      }
      if (Object.keys(envMap).length > 0) {
        config.env_vars = envMap;
      }

      // Devcontainer overrides
      if (form.image || form.postCreateCommand || form.extensions) {
        config.devcontainer_overrides = {};
        if (form.image.trim()) config.devcontainer_overrides.image = form.image.trim();
        if (form.postCreateCommand.trim()) config.devcontainer_overrides.postCreateCommand = form.postCreateCommand.trim();
        if (form.extensions.trim()) {
          config.devcontainer_overrides.extensions = form.extensions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

      // Default open files
      if (form.defaultOpenFiles.trim()) {
        config.default_open_files = form.defaultOpenFiles
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const ws = await createWorkspace(projectId, {
        name: form.name.trim(),
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      toast.success("Workspace created", ws.name);
      onCreate(ws);
      resetForm();
      onOpenChange(false);
    } catch {
      toast.error("Failed to create workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Create Workspace</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              {/* Name */}
              <Input
                label="Workspace name"
                placeholder="my-workspace"
                value={form.name}
                onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
                isRequired
                autoFocus
              />

              {/* Repository selection */}
              {repositories.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Repositories</p>
                  <div className="flex flex-col gap-2">
                    {repositories.map((repo) => {
                      const selected = !!selectedRepos[repo.name];
                      return (
                        <div
                          key={repo.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            selected ? "border-primary/50 bg-primary/5" : "border-divider hover:border-default-300"
                          }`}
                          onClick={() => handleRepoToggle(repo)}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            readOnly
                            className="accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{repo.name}</p>
                            {repo.remote_url && (
                              <p className="text-xs text-default-400 truncate">{repo.remote_url}</p>
                            )}
                          </div>
                          {selected && (
                            <Input
                              size="sm"
                              placeholder="branch"
                              value={selectedRepos[repo.name]?.branch ?? ""}
                              onValueChange={(v) => handleRepoBranchChange(repo.name, v)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-32"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                    value={form.image}
                    onValueChange={(v) => setForm((f) => ({ ...f, image: v }))}
                  />
                  <Textarea
                    size="sm"
                    label="Post-create command"
                    placeholder="npm install"
                    value={form.postCreateCommand}
                    onValueChange={(v) => setForm((f) => ({ ...f, postCreateCommand: v }))}
                    minRows={1}
                  />
                  <Input
                    size="sm"
                    label="VS Code extensions (comma-separated)"
                    placeholder="ms-python.python, esbenp.prettier-vscode"
                    value={form.extensions}
                    onValueChange={(v) => setForm((f) => ({ ...f, extensions: v }))}
                  />
                </div>
              </div>

              {/* Default open files */}
              <Input
                size="sm"
                label="Default open files (comma-separated)"
                placeholder="README.md, src/index.ts"
                value={form.defaultOpenFiles}
                onValueChange={(v) => setForm((f) => ({ ...f, defaultOpenFiles: v }))}
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
                Create Workspace
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
