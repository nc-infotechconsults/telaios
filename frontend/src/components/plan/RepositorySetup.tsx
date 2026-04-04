import { useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
  Card,
  CardBody,
  useDisclosure,
} from "@heroui/react";
import { createRepository, deleteRepository } from "../../lib/api";
import type { Repository } from "../../types";
import ConfirmModal from "../common/ConfirmModal";

interface Props {
  projectId: string;
  repositories: Repository[];
  onChange: (repos: Repository[]) => void;
}

const EMPTY_FORM = {
  name: "",
  remote_url: "",
  branch: "main",
  auth_type: "none" as Repository["auth_type"],
};

const STATUS_COLOR: Record<Repository["status"], "default" | "warning" | "success" | "danger"> = {
  unconfigured: "default",
  cloning: "warning",
  ready: "success",
  error: "danger",
};

export default function RepositorySetup({ projectId, repositories, onChange }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [token, setToken] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Repository | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  const isFormValid = form.name.trim() && form.remote_url.trim();

  const handleAdd = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      const created = await createRepository(projectId, {
        ...form,
        ...(token ? { credentials: token } : {}),
      });
      onChange([...repositories, created]);
      setForm(EMPTY_FORM);
      setToken("");
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (repo: Repository) => {
    setDeleteTarget(repo);
    onDeleteOpen();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRepository(projectId, deleteTarget.id);
      onChange(repositories.filter((r) => r.id !== deleteTarget.id));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold">Repositories</h3>
        <p className="text-sm text-default-400 mt-0.5">
          Add the Git repositories that agents will clone and work in.
          You can link multiple repos for multi-service projects.
        </p>
      </div>

      {/* Empty state */}
      {repositories.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-10 gap-3 border border-dashed border-divider rounded-xl text-center">
          <div className="text-4xl">📁</div>
          <div>
            <p className="text-sm font-medium">No repositories linked</p>
            <p className="text-xs text-default-400 mt-0.5">
              Add at least one repository so agents know where to code.
            </p>
          </div>
          <Button size="sm" color="primary" onPress={() => setShowForm(true)}>
            + Add Repository
          </Button>
        </div>
      )}

      {/* Existing repos */}
      {repositories.length > 0 && (
        <div className="space-y-2">
          {repositories.map((r) => (
            <Card key={r.id} className="border border-divider">
              <CardBody className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">📁 {r.name}</span>
                      <Chip size="sm" color={STATUS_COLOR[r.status]} variant="flat">
                        {r.status}
                      </Chip>
                      {r.branch && (
                        <Chip size="sm" variant="bordered" className="font-mono text-xs">
                          {r.branch}
                        </Chip>
                      )}
                    </div>
                    <p className="text-xs text-default-400 truncate mt-1">{r.remote_url}</p>
                    {r.auth_type !== "none" && (
                      <p className="text-xs text-default-300 mt-0.5">
                        Auth: {r.auth_type === "token" ? "🔑 Token" : "🔐 SSH Key"}
                      </p>
                    )}
                    {r.error_message && (
                      <p className="text-xs text-danger mt-1">⚠ {r.error_message}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label={`Remove repository ${r.name}`}
                    onPress={() => handleDelete(r)}
                    className="shrink-0"
                  >
                    Remove
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}

          {!showForm && (
            <Button size="sm" variant="bordered" onPress={() => setShowForm(true)}>
              + Add Another Repository
            </Button>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <Card className="border border-primary/30">
          <CardBody className="space-y-3 p-4">
            <p className="text-sm font-medium">New Repository</p>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                placeholder="api-service"
                size="sm"
                value={form.name}
                onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
                description="Short label used by agents"
                isRequired
              />
              <Input
                label="Branch"
                placeholder="main"
                size="sm"
                value={form.branch}
                onValueChange={(v) => setForm((f) => ({ ...f, branch: v }))}
              />
            </div>

            <Input
              label="Git URL"
              placeholder="https://github.com/org/repo.git"
              size="sm"
              value={form.remote_url}
              onValueChange={(v) => setForm((f) => ({ ...f, remote_url: v }))}
              isRequired
            />

            <Select
              label="Authentication"
              size="sm"
              selectedKeys={[form.auth_type]}
              onSelectionChange={(keys) =>
                setForm((f) => ({
                  ...f,
                  auth_type: (Array.from(keys)[0] as Repository["auth_type"]) ?? "none",
                }))
              }
            >
              <SelectItem key="none">None (public repo)</SelectItem>
              <SelectItem key="token">Personal Access Token</SelectItem>
              <SelectItem key="ssh">SSH Private Key</SelectItem>
            </Select>

            {form.auth_type !== "none" && (
              <Input
                label={form.auth_type === "token" ? "Personal Access Token" : "SSH Private Key"}
                type="password"
                size="sm"
                value={token}
                onValueChange={setToken}
                placeholder={
                  form.auth_type === "token"
                    ? "ghp_..."
                    : "-----BEGIN OPENSSH PRIVATE KEY-----"
                }
                description="Stored encrypted"
              />
            )}

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                color="primary"
                isLoading={saving}
                isDisabled={!isFormValid}
                onPress={handleAdd}
              >
                Add Repository
              </Button>
              <Button
                size="sm"
                variant="light"
                isDisabled={saving}
                onPress={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                  setToken("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <ConfirmModal
        isOpen={isDeleteOpen}
        onOpenChange={onDeleteOpenChange}
        title="Remove Repository"
        message={`Remove "${deleteTarget?.name}" from this project? The remote repository will not be affected.`}
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        isLoading={deleting}
      />
    </div>
  );
}
