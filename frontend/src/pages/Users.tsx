import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../lib/api";
import { toast } from "../lib/toast";
import type { User } from "../types";
import ConfirmModal from "../components/common/ConfirmModal";

interface CreateUserForm {
  email: string;
  display_name: string;
  password: string;
}

const EMPTY_FORM: CreateUserForm = { email: "", display_name: "", password: "" };

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

  useEffect(() => {
    if (currentUser?.system_role !== "admin") return;
    setLoadingUsers(true);
    api.listUsers()
      .then(setUsers)
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoadingUsers(false));
  }, [currentUser]);

  if (currentUser?.system_role !== "admin") {
    return (
      <div className="py-16 text-center text-default-400">
        <p className="text-4xl mb-4" aria-hidden="true">🔒</p>
        <p className="text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }

  async function handlePatch(id: string, data: Partial<Pick<User, "display_name" | "system_role" | "is_active">>) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-default-500 mt-0.5">Manage platform users and their roles.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setCreateError(""); setCreateForm(EMPTY_FORM); }}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Add User
        </button>
      </div>

      {loadingUsers ? (
        <p className="text-sm text-default-400 animate-pulse">Loading…</p>
      ) : (
        <div className="bg-content1 border border-divider rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider text-left">
                <th className="px-5 py-3 font-medium text-default-500">Name</th>
                <th className="px-5 py-3 font-medium text-default-500">Email</th>
                <th className="px-5 py-3 font-medium text-default-500">Role</th>
                <th className="px-5 py-3 font-medium text-default-500">Active</th>
                <th className="px-5 py-3 font-medium text-default-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-default-400">No users found.</td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-divider last:border-0 hover:bg-default-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-foreground">
                    {u.display_name}
                    {u.id === currentUser?.id && (
                      <span className="ml-2 text-xs text-default-400">(you)</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-default-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <select
                      value={u.system_role}
                      disabled={patching === u.id || u.id === currentUser?.id}
                      onChange={(e) => handlePatch(u.id, { system_role: e.target.value as User["system_role"] })}
                      className="text-xs rounded-lg border border-divider bg-background px-2 py-1 text-foreground disabled:opacity-50 cursor-pointer"
                      aria-label={`Role for ${u.display_name}`}
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={u.is_active}
                      aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.display_name}`}
                      disabled={patching === u.id || u.id === currentUser?.id}
                      onClick={() => handlePatch(u.id, { is_active: !u.is_active })}
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
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      disabled={u.id === currentUser?.id}
                      onClick={() => setDeleteTarget(u)}
                      className="text-xs text-danger hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
