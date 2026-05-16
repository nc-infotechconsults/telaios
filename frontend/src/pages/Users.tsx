import { useEffect, useState, useMemo } from "react";
import {
  Button,
  Card,
  CardBody,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import * as api from "../lib/api";
import { toast } from "../lib/toast";
import type { User } from "../types";
import ConfirmModal from "../components/common/ConfirmModal";
import ViewModeBar, { type ViewMode, type PageSize } from "../components/common/ViewModeBar";

interface CreateUserForm {
  email: string;
  display_name: string;
  password: string;
}

const EMPTY_FORM: CreateUserForm = { email: "", display_name: "", password: "" };

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type PatchData = Partial<Pick<User, "display_name" | "system_role" | "is_active">>;

interface UserControlProps {
  u: User;
  patching: string | null;
  currentUserId: string | undefined;
  onPatch: (id: string, data: PatchData) => void;
  onDelete: (u: User) => void;
}

function RoleSelect({ u, patching, currentUserId, onPatch }: UserControlProps) {
  return (
    <select
      value={u.system_role}
      disabled={patching === u.id || u.id === currentUserId}
      onChange={(e) => onPatch(u.id, { system_role: e.target.value as User["system_role"] })}
      className="text-xs rounded-lg border border-divider bg-background px-2 py-1 text-foreground disabled:opacity-50 cursor-pointer"
      aria-label={`Role for ${u.display_name}`}
    >
      <option value="admin">admin</option>
      <option value="member">member</option>
    </select>
  );
}

function ActiveToggle({ u, patching, currentUserId, onPatch }: UserControlProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={u.is_active}
      aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.display_name}`}
      disabled={patching === u.id || u.id === currentUserId}
      onClick={() => onPatch(u.id, { is_active: !u.is_active })}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        u.is_active ? "bg-success" : "bg-default-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          u.is_active ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Create user modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_FORM);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Inline edit tracking
  const [patching, setPatching] = useState<string | null>(null);

  // View mode + pagination
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  useEffect(() => {
    if (currentUser?.system_role !== "admin") return;
    setLoadingUsers(true);
    api.listUsers()
      .then(setUsers)
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoadingUsers(false));
  }, [currentUser]);

  const pagedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, page, pageSize]);

  if (currentUser?.system_role !== "admin") {
    return (
      <div className="py-16 text-center text-default-400">
        <p className="text-4xl mb-4" aria-hidden="true">🔒</p>
        <p className="text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }

  async function handlePatch(id: string, data: PatchData) {
    setPatching(id);
    try {
      const updated = await api.patchUser(id, data);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if ("is_active" in data) {
        toast.success(data.is_active ? "User activated" : "User deactivated");
      } else if ("system_role" in data) {
        toast.success("Role updated", `Role changed to ${data.system_role}`);
      }
    } catch {
      toast.error("Failed to update user");
    } finally {
      setPatching(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success("User deleted", `"${deleteTarget.display_name}" has been removed`);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateLoading(true);
    try {
      const { user } = await api.createUser(createForm);
      setUsers((prev) => [...prev, user]);
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      toast.success("User created", `${user.display_name} can now log in`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCreateError(msg ?? "Failed to create user.");
      toast.error("Failed to create user", msg);
    } finally {
      setCreateLoading(false);
    }
  }

  const controlProps: UserControlProps = {
    u: users[0], // placeholder; overridden per row
    patching,
    currentUserId: currentUser?.id,
    onPatch: handlePatch,
    onDelete: setDeleteTarget,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-default-400 text-sm mt-1">Manage platform users and their roles.</p>
        </div>
        <Button
          color="primary"
          size="md"
          onPress={() => { setShowCreate(true); setCreateError(""); setCreateForm(EMPTY_FORM); }}
        >
          + Add User
        </Button>
      </div>

      {loadingUsers && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading users…" />
        </div>
      )}

      {!loadingUsers && users.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="text-6xl">👥</div>
          <div>
            <p className="text-xl font-semibold">No users found</p>
            <p className="text-default-400 text-sm mt-1 max-w-xs">
              Add the first user to get started.
            </p>
          </div>
          <Button
            color="primary"
            onPress={() => { setShowCreate(true); setCreateError(""); setCreateForm(EMPTY_FORM); }}
          >
            Add User
          </Button>
        </div>
      )}

      {!loadingUsers && users.length > 0 && (
        <>
          <ViewModeBar
            mode={viewMode}
            onModeChange={setViewMode}
            page={page}
            pageSize={pageSize}
            total={users.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />

          {/* ── Grid ── */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedUsers.map((u) => (
                <Card key={u.id} className="apple-card transition-shadow">
                  <CardBody className="p-5 space-y-4">
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className="w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-bold select-none">
                        {getInitials(u.display_name)}
                      </div>
                      <div>
                        <div className="font-semibold text-base leading-tight">
                          {u.display_name}
                          {u.id === currentUser?.id && (
                            <span className="ml-1.5 text-xs text-default-400 font-normal">(you)</span>
                          )}
                        </div>
                        <div className="text-sm text-default-400 truncate max-w-[200px]">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-divider">
                      <RoleSelect {...controlProps} u={u} />
                      <ActiveToggle {...controlProps} u={u} />
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        isDisabled={u.id === currentUser?.id}
                        onPress={() => setDeleteTarget(u)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {/* ── List ── */}
          {viewMode === "list" && (
            <div className="apple-card overflow-hidden flex flex-col divide-y divide-default-100/60">
              {pagedUsers.map((u) => (
                <div key={u.id} className="apple-list-item flex items-center gap-4 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0 select-none">
                    {getInitials(u.display_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{u.display_name}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-xs text-default-400 shrink-0">(you)</span>
                      )}
                    </div>
                    <span className="text-xs text-default-400 truncate block">{u.email}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <RoleSelect {...controlProps} u={u} />
                    <ActiveToggle {...controlProps} u={u} />
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      isDisabled={u.id === currentUser?.id}
                      onPress={() => setDeleteTarget(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Table ── */}
          {viewMode === "table" && (
            <div className="apple-card overflow-hidden">
            <Table
              aria-label="Users table"
              removeWrapper
              classNames={{ th: "apple-table-th", tr: "apple-list-item border-b border-divider last:border-b-0" }}
            >
              <TableHeader>
                <TableColumn>USER</TableColumn>
                <TableColumn>EMAIL</TableColumn>
                <TableColumn>ROLE</TableColumn>
                <TableColumn>ACTIVE</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {pagedUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0 select-none">
                          {getInitials(u.display_name)}
                        </div>
                        <span className="font-medium text-sm">
                          {u.display_name}
                          {u.id === currentUser?.id && (
                            <span className="ml-1 text-xs text-default-400">(you)</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-default-500">{u.email}</span>
                    </TableCell>
                    <TableCell>
                      <RoleSelect {...controlProps} u={u} />
                    </TableCell>
                    <TableCell>
                      <ActiveToggle {...controlProps} u={u} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        isDisabled={u.id === currentUser?.id}
                        onPress={() => setDeleteTarget(u)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </>
      )}

      {/* ── Add User Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Add user">
          <div className="bg-content1 border border-divider rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-base font-semibold text-foreground mb-5">Add User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="new-display-name" className="block text-sm font-medium text-default-600">Display Name</label>
                <input
                  id="new-display-name"
                  type="text"
                  required
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-divider bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="new-email" className="block text-sm font-medium text-default-600">Email</label>
                <input
                  id="new-email"
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-divider bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="new-password" className="block text-sm font-medium text-default-600">Temporary Password</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-divider bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Min. 8 characters"
                />
              </div>
              {createError && (
                <p role="alert" className="text-sm text-danger">{createError}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-xl border border-divider text-sm font-medium text-default-600 hover:bg-default-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createLoading ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete User"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.display_name}"? This action cannot be undone.` : ""}
        confirmLabel="Delete"
        isLoading={deleteLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
}
