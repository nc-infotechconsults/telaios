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
import { createRepository, updateRepository, deleteRepository, testRepository } from "../../lib/api";
import type { Repository, RepositoryTestResult } from "../../types";
import ConfirmModal from "../common/ConfirmModal";

interface Props {
  projectId: string;
  repositories: Repository[];
  onChange: (repos: Repository[]) => void;
}

type FormState = {
  name: string;
  source_type: Repository["source_type"];
  // remote fields
  remote_url: string;
  branch: string;
  auth_type: Repository["auth_type"];
  // local field
  local_path: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  source_type: "remote",
  remote_url: "",
  branch: "main",
  auth_type: "none",
  local_path: "",
};

const STATUS_COLOR: Record<Repository["status"], "default" | "warning" | "success" | "danger"> = {
  unconfigured: "default",
  cloning: "warning",
  ready: "success",
  error: "danger",
};

const STATUS_LABEL: Record<Repository["status"], string> = {
  unconfigured: "Unconfigured",
  cloning: "Cloning…",
  ready: "Ready",
  error: "Error",
};

export default function RepositorySetup({ projectId, repositories, onChange }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [credential, setCredential] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<RepositoryTestResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Repository | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  const isFormValid =
    form.name.trim() &&
    (form.source_type === "remote" ? !!form.remote_url.trim() : !!form.local_path.trim());

  function openAdd() {
    setForm(EMPTY_FORM);
    setCredential("");
    setEditingId(null);
    setTestResult(null);
    setShowForm(true);
  }

  function openEdit(repo: Repository) {
    setForm({
      name: repo.name,
      source_type: repo.source_type ?? "remote",
      remote_url: repo.remote_url ?? "",
      branch: repo.branch ?? "main",
      auth_type: repo.auth_type,
      local_path: repo.local_path ?? "",
    });
    setCredential("");
    setEditingId(repo.id);
    setTestResult(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setCredential("");
    setEditingId(null);
    setTestResult(null);
  }

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testRepository(projectId, {
        source_type: form.source_type,
        remote_url: form.remote_url || undefined,
        branch: form.branch || undefined,
        auth_type: form.auth_type,
        local_path: form.local_path || undefined,
        credentials: credential || undefined,
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      const payload: Partial<Repository> & { credentials?: string } = {
        name: form.name,
        source_type: form.source_type,
        ...(form.source_type === "remote"
          ? {
              remote_url: form.remote_url,
              branch: form.branch,
              auth_type: form.auth_type,
              ...(credential ? { credentials: credential } : {}),
            }
          : {
              local_path: form.local_path,
              auth_type: "none" as const,
            }),
      };

      if (editingId) {
        const updated = await updateRepository(projectId, editingId, payload);
        onChange(repositories.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await createRepository(projectId, payload);
        onChange([...repositories, created]);
      }
      cancelForm();
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
      setDeleteTarget(null);
      onDeleteOpenChange();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold">Repositories</h3>
        <p className="text-sm text-default-400 mt-0.5">
          Link Git repositories that agents will work in. Choose between a remote repo to clone or
          a local path already on disk.
        </p>
      </div>

      {/* Empty state */}
      {repositories.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-10 gap-3 border border-dashed border-divider rounded-xl text-center">
          <div className="text-4xl">📁</div>
          <div>
            <p className="text-sm font-medium">No repositories linked</p>
            <p className="text-xs text-default-400 mt-0.5">
              Add a remote repo to clone or point to a local path.
            </p>
          </div>
          <Button size="sm" color="primary" onPress={openAdd}>+ Add Repository</Button>
        </div>
      )}

      {/* Existing repos */}
      {repositories.length > 0 && (
        <div className="space-y-2">
          {repositories.map((r) => {
            const isBeingEdited = editingId === r.id;
            const isLocal = (r.source_type ?? "remote") === "local";
            return (
              <Card
                key={r.id}
                className={`border transition-colors ${
                  isBeingEdited ? "border-primary/50 bg-primary/5" : "border-divider"
                }`}
              >
                <CardBody className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {isLocal ? "🗂 " : "📁 "}{r.name}
                        </span>
                        <Chip size="sm" variant="bordered" className="text-[10px]">
                          {isLocal ? "local" : "remote"}
                        </Chip>
                        <Chip size="sm" color={STATUS_COLOR[r.status]} variant="flat">
                          {STATUS_LABEL[r.status]}
                        </Chip>
                        {!isLocal && r.branch && (
                          <Chip size="sm" variant="bordered" className="font-mono text-xs">
                            {r.branch}
                          </Chip>
                        )}
                      </div>

                      {isLocal ? (
                        <p className="text-xs text-default-400 truncate mt-1 font-mono">
                          {r.local_path}
                        </p>
                      ) : (
                        <p className="text-xs text-default-400 truncate mt-1">{r.remote_url}</p>
                      )}

                      {!isLocal && r.auth_type !== "none" && (
                        <p className="text-xs text-default-300 mt-0.5">
                          Auth: {r.auth_type === "token" ? "🔑 Token" : "🔐 SSH Key"}
                          {r.has_credentials && (
                            <span className="text-success ml-1">✓ credentials stored</span>
                          )}
                        </p>
                      )}

                      {r.error_message && (
                        <p className="text-xs text-danger mt-1">⚠ {r.error_message}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="bordered"
                        aria-label={`Edit repository ${r.name}`}
                        isDisabled={showForm && editingId !== r.id}
                        onPress={() => openEdit(r)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        aria-label={`Remove repository ${r.name}`}
                        isDisabled={showForm}
                        onPress={() => handleDelete(r)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}

          {!showForm && (
            <Button size="sm" variant="bordered" onPress={openAdd}>
              + Add Another Repository
            </Button>
          )}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <Card className="border border-primary/30">
          <CardBody className="space-y-4 p-4">
            <p className="text-sm font-semibold">
              {editingId ? `Editing: ${form.name || "repository"}` : "New Repository"}
            </p>

            {/* Source type toggle */}
            <div
              role="group"
              aria-label="Repository source type"
              className="flex rounded-lg border border-divider p-0.5 gap-0.5 bg-content2 w-fit"
            >
              {(["remote", "local"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={form.source_type === type}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      source_type: type,
                      auth_type: type === "local" ? "none" : f.auth_type,
                    }));
                    setTestResult(null);
                  }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    form.source_type === type
                      ? "bg-primary text-primary-foreground"
                      : "text-default-400 hover:text-foreground"
                  }`}
                >
                  {type === "remote" ? "🌐 Remote (clone)" : "🗂 Local (on disk)"}
                </button>
              ))}
            </div>

            {/* Common: name */}
            <Input
              label="Name"
              placeholder="api-service"
              size="sm"
              value={form.name}
              onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
              description="Short label used by agents"
              isRequired
            />

            {/* Remote fields */}
            {form.source_type === "remote" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Git URL"
                    placeholder="https://github.com/org/repo.git"
                    size="sm"
                    value={form.remote_url}
                    onValueChange={(v) => { setForm((f) => ({ ...f, remote_url: v })); setTestResult(null); }}
                    isRequired
                    className="col-span-2"
                  />
                  <Input
                    label="Branch"
                    placeholder="main"
                    size="sm"
                    value={form.branch}
                    onValueChange={(v) => { setForm((f) => ({ ...f, branch: v })); setTestResult(null); }}
                  />
                  <Select
                    label="Authentication"
                    size="sm"
                    selectedKeys={[form.auth_type]}
                    onSelectionChange={(keys) => {
                      setForm((f) => ({
                        ...f,
                        auth_type: (Array.from(keys)[0] as Repository["auth_type"]) ?? "none",
                      }));
                      setTestResult(null);
                    }}
                  >
                    <SelectItem key="none">None (public repo)</SelectItem>
                    <SelectItem key="token">Personal Access Token</SelectItem>
                    <SelectItem key="ssh">SSH Private Key</SelectItem>
                  </Select>
                </div>

                {form.auth_type !== "none" && (
                  <Input
                    label={form.auth_type === "token" ? "Personal Access Token" : "SSH Private Key"}
                    type="password"
                    size="sm"
                    value={credential}
                    onValueChange={(v) => { setCredential(v); setTestResult(null); }}
                    placeholder={
                      form.auth_type === "token"
                        ? "ghp_..."
                        : "-----BEGIN OPENSSH PRIVATE KEY-----"
                    }
                    description={
                      editingId
                        ? "Leave blank to keep the existing credential"
                        : "Stored encrypted"
                    }
                  />
                )}
              </>
            )}

            {/* Local fields */}
            {form.source_type === "local" && (
              <Input
                label="Local path"
                placeholder="/home/user/projects/my-repo"
                size="sm"
                value={form.local_path}
                onValueChange={(v) => { setForm((f) => ({ ...f, local_path: v })); setTestResult(null); }}
                description="Absolute path to the repository on the agent's host machine"
                isRequired
                classNames={{ input: "font-mono" }}
              />
            )}

            {/* Test result feedback */}
            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm border ${
                  testResult.ok
                    ? "bg-success-50 border-success-200 text-success-700"
                    : "bg-danger-50 border-danger-200 text-danger-700"
                }`}
                role="status"
                aria-live="polite"
              >
                {testResult.ok ? (
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                )}
                <span>
                  {testResult.message}
                  {testResult.ok && testResult.default_branch && (
                    <span className="ml-1 opacity-70">
                      (default branch: <span className="font-mono">{testResult.default_branch}</span>)
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-1 flex-wrap">
              <Button
                size="sm"
                color="primary"
                isLoading={saving}
                isDisabled={!isFormValid || testing}
                onPress={handleSave}
              >
                {editingId ? "Save Changes" : "Add Repository"}
              </Button>
              <Button
                size="sm"
                variant="bordered"
                isLoading={testing}
                isDisabled={!isFormValid || saving}
                onPress={handleTest}
              >
                Test Connection
              </Button>
              <Button size="sm" variant="light" isDisabled={saving || testing} onPress={cancelForm}>
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
