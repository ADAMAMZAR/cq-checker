"use client";

import { useEffect, useState } from "react";
import {
  IconUserPlus,
  IconTrash,
  IconEdit,
  IconX,
  IconCheck,
  IconSearch,
  IconLoader2,
  IconUserCheck,
} from "@tabler/icons-react";
import {
  fetchAdminUsers,
  createAdminUser,
  updateAdminUserRoles,
  deleteAdminUser,
  AdminUserItem,
} from "@/lib/api";

const ALL_ROLES = [
  { name: "admin", label: "Admin", desc: "Full system access" },
  { name: "manager", label: "Manager", desc: "Strategic sourcing oversight" },
  { name: "gpo", label: "GPO", desc: "GPO operations team" },
  { name: "gpo_lead", label: "GPO Lead", desc: "GPO management team" },
  { name: "user", label: "User", desc: "Standard employee access" },
];

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);

  // Add / Edit Form State
  const [newEmail, setNewEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("user");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetchAdminUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      console.error("Failed to load admin users:", err);
      setErrorMsg("Failed to load users from database.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenAdd() {
    setNewEmail("");
    setSelectedRole("user");
    setErrorMsg(null);
    setShowAddModal(true);
  }

  function handleOpenEdit(u: AdminUserItem) {
    setSelectedUser(u);
    setSelectedRole(u.roles[0] || "user");
    setErrorMsg(null);
    setShowEditModal(true);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await createAdminUser(newEmail.trim(), [selectedRole]);
      setSuccessMsg(`Pre-seeded ${newEmail} with role '${selectedRole}'`);
      setShowAddModal(false);
      await loadUsers();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to pre-seed user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateRoles(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateAdminUserRoles(selectedUser.id, [selectedRole]);
      setSuccessMsg(`Updated role for ${selectedUser.email} to '${selectedRole}'`);
      setShowEditModal(false);
      await loadUsers();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update role.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(user: AdminUserItem) {
    if (!confirm(`Are you sure you want to delete user ${user.email}?`)) return;

    try {
      await deleteAdminUser(user.id);
      setSuccessMsg(`Deleted user ${user.email}`);
      await loadUsers();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to delete user: ${err.message}`);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name && u.display_name.toLowerCase().includes(search.toLowerCase())) ||
      u.roles.some((r) => r.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--heading-color)] flex items-center gap-2">
            User & Role Pre-Seeding Management
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Pre-seed employee emails and assign application roles in your database. When users log in via Microsoft SSO, their assigned roles are linked automatically.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-semibold text-xs transition-all shadow-sm cursor-pointer shrink-0"
        >
          <IconUserPlus className="w-4 h-4" />
          <span>Pre-seed User & Roles</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold flex items-center gap-2">
          <IconCheck className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative w-full max-w-md">
        <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="Filter by email, name, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-elevated)] text-xs text-[var(--heading-color)] focus:outline-none focus:border-[var(--accent-primary-border)]"
        />
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-secondary)] font-semibold">
              <th className="py-3 px-4">User</th>
              <th className="py-3 px-4">Assigned Roles</th>
              <th className="py-3 px-4">SSO Status</th>
              <th className="py-3 px-4">Last Login</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--heading-color)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--text-tertiary)]">
                  <div className="inline-flex items-center gap-2">
                    <IconLoader2 className="w-4 h-4 animate-spin text-[var(--accent-primary-text)]" />
                    <span>Loading users from database...</span>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--text-tertiary)]">
                  No users found in database. Click <strong>Pre-seed User & Roles</strong> to add one!
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[var(--bg-elevated-hover)] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-[var(--heading-color)]">{u.email}</span>
                      {u.display_name && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">{u.display_name}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold capitalize ${r === "admin"
                            ? "bg-purple-500/10 text-purple-500 border border-purple-500/30"
                            : r === "manager"
                              ? "bg-blue-500/10 text-blue-500 border border-blue-500/30"
                              : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                            }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {u.sso_subject ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-semibold border border-emerald-500/20">
                        <IconUserCheck className="w-3 h-3" />
                        <span>Active (SSO)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-semibold border border-amber-500/20">
                        <span>Pre-seeded (Pending Login)</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[10px] font-mono text-[var(--text-tertiary)]">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        className="p-1.5 rounded-lg border border-[var(--border-visible)] hover:border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary-soft)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] transition-all cursor-pointer"
                        title="Edit Roles"
                      >
                        <IconEdit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u)}
                        className="p-1.5 rounded-lg border border-[var(--border-visible)] hover:border-red-500/40 hover:bg-red-500/10 text-[var(--text-secondary)] hover:text-red-500 transition-all cursor-pointer"
                        title="Delete User"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: Pre-seed User & Roles */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 transition-opacity animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] cursor-pointer"
            >
              <IconX className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-[var(--heading-color)] mb-1 flex items-center gap-2">
              <IconUserPlus className="w-5 h-5 text-[var(--accent-primary-text)]" />
              Pre-seed User & Assign Role
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-6">
              Enter the corporate email and select the role to grant. When this employee logs in via Microsoft SSO, their account will link automatically.
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--heading-color)] mb-1">
                  Corporate Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="employee@gamuda.com.my"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-elevated)] text-xs text-[var(--heading-color)] focus:outline-none focus:border-[var(--accent-primary-border)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--heading-color)] mb-2">
                  Select Assigned Role (Single Selection)
                </label>
                <div className="space-y-2">
                  {ALL_ROLES.map((r) => {
                    const checked = selectedRole === r.name;
                    return (
                      <label
                        key={r.name}
                        className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${checked
                          ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--heading-color)]"
                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-visible)]"
                          }`}
                      >
                        <input
                          type="radio"
                          name="user_role_add"
                          value={r.name}
                          checked={checked}
                          onChange={(e) => setSelectedRole(e.target.value)}
                          className="mt-0.5 border-[var(--border-visible)] text-[var(--accent-primary)] focus:ring-0 cursor-pointer"
                        />
                        <div className="flex flex-col text-left leading-tight">
                          <span className="text-xs font-semibold capitalize">{r.label}</span>
                          <span className="text-[10px] text-[var(--text-tertiary)]">{r.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-visible)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--heading-color)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save User & Role</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Existing User Role */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 transition-opacity animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] cursor-pointer"
            >
              <IconX className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-[var(--heading-color)] mb-1 flex items-center gap-2">
              <IconEdit className="w-5 h-5 text-[var(--accent-primary-text)]" />
              Edit User Role: {selectedUser.email}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-6">
              Update assigned permission role for this user account.
            </p>

            <form onSubmit={handleUpdateRoles} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-2">
                {ALL_ROLES.map((r) => {
                  const checked = selectedRole === r.name;
                  return (
                    <label
                      key={r.name}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${checked
                        ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--heading-color)]"
                        : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-visible)]"
                        }`}
                    >
                      <input
                        type="radio"
                        name="user_role_edit"
                        value={r.name}
                        checked={checked}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="mt-0.5 border-[var(--border-visible)] text-[var(--accent-primary)] focus:ring-0 cursor-pointer"
                      />
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-xs font-semibold capitalize">{r.label}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">{r.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-visible)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--heading-color)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update Role</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
