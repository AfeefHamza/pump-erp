import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchRoles,
  fetchPermissions,
  createRole,
  updateRole,
  deleteRole,
  type RoleResponse,
  type PermissionResponse
} from '@/api/client';
import { Plus, Trash2, Save, ShieldAlert, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const RolesManagement: React.FC = () => {
  const { roleId } = useParams();

  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  // States
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [permissionsByModule, setPermissionsByModule] = useState<Record<string, PermissionResponse[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleResponse | null>(null);

  // Edit / Create States
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Permissions
  const canCreate = usePermission('role.create');
  const canUpdate = usePermission('role.update');
  const canDelete = usePermission('role.delete');

  const loadData = React.useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [roleList, permList] = await Promise.all([
        fetchRoles(selectedOrgId),
        fetchPermissions(selectedOrgId),
      ]);
      setRoles(roleList);
      setPermissionsByModule(permList);
      if (roleList.length > 0) {
        // Auto-select role matching URL param if present, else first role
        const target = roleId ? roleList.find(r => r.id === roleId) : null;
        setSelectedRole(target || roleList[0]);
      }
    } catch (err) {
      console.error('Failed to load roles data', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, roleId]);


  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);


  useEffect(() => {
    if (roleId && roles.length > 0) {
      const target = roles.find(r => r.id === roleId);
      if (target) {
        const timer = setTimeout(() => {
          setSelectedRole(target);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [roleId, roles]);

  useEffect(() => {
    if (selectedRole) {
      const timer = setTimeout(() => {
        setRoleName(selectedRole.name);
        setRoleDesc(selectedRole.description || '');
        setSelectedPermissions(selectedRole.permissions);
        setErrorMsg(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedRole]);

  const handleCreateNewRoleClick = () => {
    setSelectedRole(null);
    setRoleName('');
    setRoleDesc('');
    setSelectedPermissions([]);
    setErrorMsg(null);
  };

  const handlePermissionToggle = (permCode: string) => {
    if (selectedRole?.is_system || (!selectedRole && !canCreate) || (selectedRole && !canUpdate)) {
      return; // Read-only for system roles or if lacking permission
    }
    if (selectedPermissions.includes(permCode)) {
      setSelectedPermissions(selectedPermissions.filter(code => code !== permCode));
    } else {
      setSelectedPermissions([...selectedPermissions, permCode]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setErrorMsg(null);

    if (!roleName.trim()) {
      setErrorMsg('Role name is required.');
      return;
    }

    try {
      if (selectedRole) {
        // Update custom role
        const updated = await updateRole(selectedOrgId, selectedRole.id, {
          name: roleName.trim(),
          description: roleDesc.trim(),
          permissions: selectedPermissions
        });
        alert('Role updated successfully.');
        loadData().then(() => {
          setSelectedRole(updated);
        });
      } else {
        // Create custom role
        const created = await createRole(selectedOrgId, {
          name: roleName.trim(),
          description: roleDesc.trim(),
          permissions: selectedPermissions
        });
        alert('Role created successfully.');
        loadData().then(() => {
          setSelectedRole(created);
        });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred while saving the role.');
    }
  };

  const handleDelete = async (roleId: string, name: string) => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to permanently delete the custom role "${name}"?`)) return;

    try {
      await deleteRole(selectedOrgId, roleId);
      alert('Role deleted successfully.');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete role.');
    }
  };

  const canView = usePermission('role.view');

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view roles and permissions settings.</p>
      </div>
    );
  }

  return (
    <div className="management-page">
      <PageHeader 
        title="Roles & Permissions" 
        subtitle="Configure access rights, modules permissions, and custom organization roles."
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading roles and permissions matrix...</p>
        </div>
      ) : (
        <div className="roles-grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
          
          {/* Left panel: Roles List */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
              <h3 className="h4" style={{ margin: 0 }}>Roles</h3>
              {canCreate && (
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={handleCreateNewRoleClick}
                  title="Create Custom Role"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.75rem' }}>
              {roles.map((r) => {
                const isSelected = selectedRole?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRole(r)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(var(--primary-rgb), 0.15)' : 'transparent',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                        {r.is_system ? 'System Default' : 'Custom Role'}
                      </div>
                    </div>
                    {canDelete && !r.is_system && (
                      <button
                        className="btn-trash"
                        style={{ color: 'var(--danger)', opacity: 0.8, background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r.id, r.name);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Role Config & Permissions Matrix */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {errorMsg && (
                <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldAlert size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, marginRight: '2rem' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Role Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Sales Coordinator"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    disabled={!!(selectedRole?.is_system || (!selectedRole && !canCreate) || (selectedRole && !canUpdate))}
                    required
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Description</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Short description of duties..."
                    value={roleDesc}
                    onChange={(e) => setRoleDesc(e.target.value)}
                    disabled={!!(selectedRole?.is_system || (!selectedRole && !canCreate) || (selectedRole && !canUpdate))}
                  />
                </div>
              </div>

              <div>
                <h3 className="h4" style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                  Permissions Matrix
                </h3>

                {selectedRole?.is_system && (
                  <div className="alert alert-secondary" style={{ marginBottom: '1.25rem', fontSize: '0.9rem', background: 'rgba(255,255,255,0.05)' }}>
                    System default roles cannot be edited or modified. Checkboxes are locked.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {Object.entries(permissionsByModule).map(([moduleName, perms]) => (
                    <div key={moduleName} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {moduleName}
                      </h4>
                      <div className="permissions-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                        {perms.map((p) => {
                          const isChecked = selectedPermissions.includes(p.code);
                          const isDisabled = selectedRole?.is_system || (!selectedRole && !canCreate) || (selectedRole && !canUpdate);
                          return (
                            <div
                              key={p.id}
                              onClick={() => !isDisabled && handlePermissionToggle(p.code)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                cursor: isDisabled ? 'default' : 'pointer',
                                userSelect: 'none',
                                opacity: isDisabled && !isChecked ? 0.5 : 1
                              }}
                              title={p.description || undefined}
                            >
                              {isChecked ? (
                                <CheckSquare size={16} style={{ color: 'var(--primary)' }} />
                              ) : (
                                <Square size={16} style={{ opacity: 0.5 }} />
                              )}
                              <span style={{ fontSize: '0.85rem' }}>{p.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {selectedRole?.is_system ? null : (
                ((!selectedRole && canCreate) || (selectedRole && canUpdate)) && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Save size={16} />
                      <span>Save Role Mappings</span>
                    </button>
                  </div>
                )
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
