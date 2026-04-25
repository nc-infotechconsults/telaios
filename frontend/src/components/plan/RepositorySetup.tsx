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
import type { Repository, RepositoryProviderType, RepositoryTestResult } from "../../types";
import ConfirmModal from "../common/ConfirmModal";

interface Props {
  projectId: string;
  repositories: Repository[];
  onChange: (repos: Repository[]) => void;
}

type FormState = {
  name: string;
  provider_type: RepositoryProviderType;
  // git fields
  remote_url: string;
  branch: string;
  auth_type: "none" | "token" | "ssh";
  // s3 fields
  bucket_name: string;
  region: string;
  endpoint: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  provider_type: "github",
  remote_url: "",
  branch: "main",
  auth_type: "none",
  bucket_name: "",
  region: "us-east-1",
  endpoint: "",
};

const GIT_PROVIDERS: RepositoryProviderType[] = ["github", "gitlab", "bitbucket", "git"];

const PROVIDER_LABELS: Record<RepositoryProviderType, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  git: "Generic Git",
  s3: "Amazon S3",
};

const PROVIDER_URL_PLACEHOLDER: Record<string, string> = {
  github: "https://github.com/org/repo.git",
  gitlab: "https://gitlab.com/org/repo.git",
  bitbucket: "https://bitbucket.org/org/repo.git",
  git: "https://git.example.com/org/repo.git",
};

const COMMON_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-northeast-1", "ap-south-1",
  "sa-east-1", "ca-central-1",
];

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

// Inline SVG icons for each provider
function ProviderIcon({ type, size = 16 }: { type: RepositoryProviderType; size?: number }) {
  if (type === "github") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
          0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52
          -.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2
          -3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64
          -.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
          .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93
          -.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }
  if (type === "gitlab") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M15.97 9.058L14.89 5.86 12.74.46a.327.327 0 00-.62 0L9.97 5.86H6.03L3.88.46a
          .327.327 0 00-.62 0L1.11 5.86.03 9.058a.647.647 0 00.234.724L8 15.5l7.736-5.718a.647.647
          0 00.234-.724z" />
      </svg>
    );
  }
  if (type === "bitbucket") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M.778 1.03C.35 1.03 0 1.38 0 1.808c0 .048.007.095.016.142l2.188 13.338a.28.28
          0 00.276.234h11.04a.21.21 0 00.207-.176L15.984 1.95a.28.28 0 00-.277-.32l-.929-.001
          L.778 1.03zm9.06 9.3H6.15L5.34 6.3h5.32l-.82 4.03z" />
      </svg>
    );
  }
  if (type === "s3") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1L1 4v8l7 3 7-3V4L8 1zm0 1.5l5 2.14V12.5l-5 2.14-5-2.14V4.64L8 2.5z"/>
        <path d="M3 5.5v5l5 2 5-2v-5L8 7.5 3 5.5z" opacity=".4"/>
      </svg>
    );
  }
  // generic git
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M15.698 7.287L8.712.302a1.03 1.03 0 00-1.457 0L5.699 1.86l1.843 1.843a1.223
        1.223 0 011.55 1.56l1.775 1.776a1.224 1.224 0 011.267 2.025 1.226 1.226 0 01-1.898-1.442L8.46
        5.946v4.72a1.226 1.226 0 11-1.007-.12V5.888a1.226 1.226 0 01-.666-1.608L4.95 2.44l-4.648 4.648a
        1.03 1.03 0 000 1.457l6.986 6.986a1.03 1.03 0 001.457 0l6.953-6.953a1.031 1.031 0 000-1.291z" />
    </svg>
  );
}

export default function RepositorySetup({ projectId, repositories, onChange }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [credential, setCredential] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<RepositoryTestResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Repository | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  const isGit = GIT_PROVIDERS.includes(form.provider_type);

  const isFormValid = form.name.trim() && (
    isGit
      ? !!form.remote_url.trim()
      : !!form.bucket_name.trim() && !!(s3AccessKey.trim() || editingId)
  );

  function openAdd() {
    setForm(EMPTY_FORM);
    setCredential("");
    setS3AccessKey("");
    setS3SecretKey("");
    setEditingId(null);
    setTestResult(null);
    setShowForm(true);
  }

  function openEdit(repo: Repository) {
    setForm({
      name: repo.name,
      provider_type: repo.provider_type,
      remote_url: repo.remote_url ?? "",
      branch: repo.branch ?? "main",
      auth_type: repo.auth_type,
      bucket_name: repo.bucket_name ?? "",
      region: repo.region ?? "us-east-1",
      endpoint: repo.endpoint ?? "",
    });
    setCredential("");
    setS3AccessKey("");
    setS3SecretKey("");
    setEditingId(repo.id);
    setTestResult(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setCredential("");
    setS3AccessKey("");
    setS3SecretKey("");
    setEditingId(null);
    setTestResult(null);
  }

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (isGit) {
        const result = await testRepository(projectId, {
          provider_type: form.provider_type,
          remote_url: form.remote_url || undefined,
          branch: form.branch || undefined,
          auth_type: form.auth_type,
          credentials: credential || undefined,
        });
        setTestResult(result);
      } else {
        const creds = s3AccessKey
          ? JSON.stringify({ access_key_id: s3AccessKey, secret_access_key: s3SecretKey })
          : undefined;
        const result = await testRepository(projectId, {
          provider_type: "s3",
          auth_type: "none",
          bucket_name: form.bucket_name || undefined,
          region: form.region || undefined,
          endpoint: form.endpoint || undefined,
          credentials: creds,
        });
        setTestResult(result);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      const base: Partial<Repository> & { credentials?: string } = {
        name: form.name,
        provider_type: form.provider_type,
      };

      const payload = isGit
        ? {
            ...base,
            remote_url: form.remote_url,
            branch: form.branch,
            auth_type: form.auth_type,
            ...(credential ? { credentials: credential } : {}),
          }
        : {
            ...base,
            auth_type: "none" as const,
            bucket_name: form.bucket_name,
            region: form.region,
            endpoint: form.endpoint || undefined,
            ...(s3AccessKey
              ? { credentials: JSON.stringify({ access_key_id: s3AccessKey, secret_access_key: s3SecretKey }) }
              : {}),
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
          Link Git repositories or S3 buckets that agents will work with.
        </p>
      </div>

      {/* Empty state */}
      {repositories.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-10 gap-3 border border-dashed border-divider rounded-xl text-center">
          <div className="text-4xl">📁</div>
          <div>
            <p className="text-sm font-medium">No repositories linked</p>
            <p className="text-xs text-default-400 mt-0.5">
              Connect a GitHub, GitLab, Bitbucket, Git, or S3 source.
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
            const isS3 = r.provider_type === "s3";
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
                        <span className="font-medium text-sm">📁 {r.name}</span>
                        <Chip
                          size="sm"
                          variant="bordered"
                          className="text-[10px] gap-1"
                          startContent={<ProviderIcon type={r.provider_type} size={10} />}
                        >
                          {PROVIDER_LABELS[r.provider_type]}
                        </Chip>
                        <Chip size="sm" color={STATUS_COLOR[r.status]} variant="flat">
                          {STATUS_LABEL[r.status]}
                        </Chip>
                        {!isS3 && r.branch && (
                          <Chip size="sm" variant="bordered" className="font-mono text-xs">
                            {r.branch}
                          </Chip>
                        )}
                      </div>

                      {isS3 ? (
                        <p className="text-xs text-default-400 truncate mt-1 font-mono">
                          s3://{r.bucket_name}{r.region ? ` · ${r.region}` : ""}{r.endpoint ? ` · ${r.endpoint}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-default-400 truncate mt-1">{r.remote_url}</p>
                      )}

                      {!isS3 && r.auth_type !== "none" && (
                        <p className="text-xs text-default-300 mt-0.5">
                          Auth: {r.auth_type === "token" ? "🔑 Token" : "🔐 SSH Key"}
                          {r.has_credentials && (
                            <span className="text-success ml-1">✓ credentials stored</span>
                          )}
                        </p>
                      )}

                      {isS3 && r.has_credentials && (
                        <p className="text-xs text-default-300 mt-0.5">
                          🔑 <span className="text-success">credentials stored</span>
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

            {/* Provider type selector */}
            <div>
              <p className="text-xs text-default-500 mb-2">Provider</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {(["github", "gitlab", "bitbucket", "git", "s3"] as RepositoryProviderType[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={form.provider_type === p}
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        provider_type: p,
                        auth_type: p === "s3" ? "none" : f.auth_type,
                      }));
                      setTestResult(null);
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                      form.provider_type === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-divider text-default-500 hover:border-default-300 hover:text-foreground"
                    }`}
                  >
                    <ProviderIcon type={p} size={18} />
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
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

            {/* Git fields */}
            {isGit && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Git URL"
                    placeholder={PROVIDER_URL_PLACEHOLDER[form.provider_type] ?? "https://git.example.com/org/repo.git"}
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
                    description={editingId ? "Leave blank to keep the existing credential" : "Stored encrypted"}
                  />
                )}
              </>
            )}

            {/* S3 fields */}
            {!isGit && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Bucket Name"
                    placeholder="my-bucket"
                    size="sm"
                    value={form.bucket_name}
                    onValueChange={(v) => { setForm((f) => ({ ...f, bucket_name: v })); setTestResult(null); }}
                    isRequired
                    className="col-span-2"
                  />
                  <Select
                    label="Region"
                    size="sm"
                    selectedKeys={form.region ? [form.region] : []}
                    onSelectionChange={(keys) => {
                      setForm((f) => ({ ...f, region: (Array.from(keys)[0] as string) ?? "us-east-1" }));
                      setTestResult(null);
                    }}
                  >
                    {COMMON_REGIONS.map((r) => (
                      <SelectItem key={r}>{r}</SelectItem>
                    ))}
                  </Select>
                  <Input
                    label="Endpoint URL"
                    placeholder="https://s3.amazonaws.com"
                    size="sm"
                    value={form.endpoint}
                    onValueChange={(v) => { setForm((f) => ({ ...f, endpoint: v })); setTestResult(null); }}
                    description="Optional — for MinIO, R2, or other S3-compatible storage"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Access Key ID"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    size="sm"
                    value={s3AccessKey}
                    onValueChange={(v) => { setS3AccessKey(v); setTestResult(null); }}
                    description={editingId ? "Leave blank to keep existing credentials" : "Stored encrypted"}
                    isRequired={!editingId}
                    classNames={{ input: "font-mono" }}
                  />
                  <Input
                    label="Secret Access Key"
                    type="password"
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    size="sm"
                    value={s3SecretKey}
                    onValueChange={(v) => { setS3SecretKey(v); setTestResult(null); }}
                    description={editingId ? "Leave blank to keep existing credentials" : "Stored encrypted"}
                    isRequired={!editingId}
                  />
                </div>
              </>
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

