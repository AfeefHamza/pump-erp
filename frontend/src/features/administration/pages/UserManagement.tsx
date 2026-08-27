import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchMemberships,
  fetchActivations,
  fetchRoles,
  fetchOutlets,
  addUser,
  resendActivation,
  revokeActivation,
  suspendMembership,
  reactivateMembership,
  updateMembershipAccess,
  type MembershipResponse,
  type ActivationResponse,
  type RoleResponse,
  type OutletDetail
} from '@/api/client';
import { Search, UserPlus, ShieldAlert, Ban, CheckCircle, RefreshCw, X, Edit2 } from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const UserManagement: React.FC = () => {
  const { membershipId } = useParams();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const currentUser = useAppSelector((state) => state.auth.currentUser);


  // States
  const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
  const [activations, setActivations] = useState<ActivationResponse[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [outlets, setOutlets] = useState<OutletDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, suspended, pending
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal / Slider states
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<MembershipResponse | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Add User Form states
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addMemType, setAddMemType] = useState<'administrator' | 'member'>('member');
  const [addSelectedRoles, setAddSelectedRoles] = useState<string[]>([]);
  const [addSelectedOutlets, setAddSelectedOutlets] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [addSuccessState, setAddSuccessState] = useState<boolean>(false);
  const [successLink, setSuccessLink] = useState('');

  // Edit Form states
  const [editSelectedRoles, setEditSelectedRoles] = useState<string[]>([]);
  const [editSelectedOutlets, setEditSelectedOutlets] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Permissions
  const canAdd = usePermission('user.add');
  const canSuspend = usePermission('user.suspend');
  const canUpdate = usePermission('user.update');

  const openEditModal = React.useCallback((mem: MembershipResponse) => {
    setSelectedMembership(mem);
    setEditSelectedRoles(mem.roles.map(r => r.id));
    setEditSelectedOutlets(mem.outlets.map(o => o.id));
    setEditError(null);
    setIsEditOpen(true);
  }, []);

  const loadData = React.useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [memList, actList, roleList, outletList] = await Promise.all([
        fetchMemberships(selectedOrgId),
        fetchActivations(selectedOrgId),
        fetchRoles(selectedOrgId),
        fetchOutlets(selectedOrgId)
      ]);
      setMemberships(memList);
      setActivations(actList);
      setRoles(roleList);
      setOutlets(outletList);
    } catch (err) {
      console.error('Failed to load user management data', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (membershipId && memberships.length > 0) {
      const mem = memberships.find((m) => m.id === membershipId);
      if (mem) {
        const timer = setTimeout(() => {
          openEditModal(mem);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [membershipId, memberships, openEditModal]);



  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setFormError(null);

    if (!addName.trim() || !addEmail.trim()) {
      setFormError('Name and Email are required.');
      return;
    }

    try {
      await addUser(selectedOrgId, {
        email: addEmail.trim(),
        display_name: addName.trim(),
        phone_number: addPhone.trim() || undefined,
        membership_type: addMemType,
        roles: addSelectedRoles,
        outlets: addSelectedOutlets
      });
      // Set success state
      setAddSuccessState(true);
      // Generate standard link preview for console check
      setSuccessLink(`http://localhost:5173/activate-account?token=...`);
      // Reload lists
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An error occurred while adding the user.');
    }
  };

  const resetAddForm = () => {
    setAddName('');
    setAddEmail('');
    setAddPhone('');
    setAddMemType('member');
    setAddSelectedRoles([]);
    setAddSelectedOutlets([]);
    setFormError(null);
    setAddSuccessState(false);
  };

  const handleResendActivation = async (actId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to resend this activation link? The old link will be invalidated.')) return;
    try {
      await resendActivation(selectedOrgId, actId);
      alert('Activation link resent successfully.');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to resend activation.');
    }
  };

  const handleRevokeActivation = async (actId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to revoke this activation invite?')) return;
    try {
      await revokeActivation(selectedOrgId, actId);
      alert('Activation revoked successfully.');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to revoke activation.');
    }
  };

  const handleSuspend = async (memId: string, name: string) => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to suspend access for ${name}?`)) return;
    try {
      await suspendMembership(selectedOrgId, memId);
      alert('Membership suspended successfully.');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to suspend membership.');
    }
  };

  const handleReactivate = async (memId: string, name: string) => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to reactivate access for ${name}?`)) return;
    try {
      await reactivateMembership(selectedOrgId, memId);
      alert('Membership reactivated successfully.');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate membership.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedMembership) return;
    setEditError(null);

    try {
      await updateMembershipAccess(selectedOrgId, selectedMembership.id, {
        roles: editSelectedRoles,
        outlets: editSelectedOutlets
      });
      alert('Membership details updated successfully.');
      setIsEditOpen(false);
      loadData();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update membership.');
    }
  };

  // Filtering Logic
  const filteredMemberships = memberships.filter((mem) => {
    const matchesSearch =
      mem.user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mem.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && mem.status === 'active') ||
      (statusFilter === 'suspended' && mem.status === 'suspended');

    const matchesRole =
      roleFilter === 'all' ||
      mem.roles.some((r) => r.id === roleFilter) ||
      (roleFilter === 'owner' && mem.membership_type === 'owner');

    return matchesSearch && matchesStatus && matchesRole;
  });

  const filteredActivations = activations.filter((act) => {
    const matchesSearch =
      act.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'pending' && act.status === 'pending');

    return matchesSearch && matchesStatus;
  });

  const canView = usePermission('user.view');

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view user management settings.</p>
      </div>
    );
  }

  return (
    <div className="management-page">
      <PageHeader 
        title="User Management" 
        subtitle="Manage memberships, system permissions, activations and outlet accessibility."
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={canAdd && (
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => { resetAddForm(); setIsAddUserOpen(true); }}
          >
            <UserPlus size={18} />
            <span>Add User</span>
          </button>
        )}
      />

      {/* Filters Bar */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-control"
          style={{ width: '180px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Members</option>
          <option value="suspended">Suspended Members</option>
          <option value="pending">Pending Invitations</option>
        </select>
        <select
          className="form-control"
          style={{ width: '200px' }}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="owner">Owners</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading organisation memberships...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Members Table */}
          {filteredMemberships.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="h4">Members & Roles</h3>
              </div>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Display Name</th>
                      <th>Email</th>
                      <th>Type</th>
                      <th>Assigned Roles</th>
                      <th>Allowed Outlets</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMemberships.map((mem) => (
                      <tr key={mem.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{mem.user.display_name}</div>
                          {mem.user.phone_number && (
                            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{mem.user.phone_number}</div>
                          )}
                        </td>
                        <td>{mem.user.email}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          <span className={`badge ${mem.membership_type === 'owner' ? 'badge-primary' : 'badge-secondary'}`}>
                            {mem.membership_type}
                          </span>
                        </td>
                        <td>
                          {mem.membership_type === 'owner' ? (
                            <span className="text-muted" style={{ fontSize: '0.9rem' }}>Implicit Full Access</span>
                          ) : mem.roles.length > 0 ? (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {mem.roles.map((r) => (
                                <span key={r.id} className="badge badge-secondary" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                  {r.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.9rem' }}>No Roles Assigned</span>
                          )}
                        </td>
                        <td>
                          {mem.membership_type === 'owner' || mem.membership_type === 'administrator' ? (
                            <span style={{ fontSize: '0.9rem', color: 'var(--success)' }}>All Outlets</span>
                          ) : mem.outlets.length > 0 ? (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {mem.outlets.map((o) => (
                                <span key={o.id} className="badge badge-secondary" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                  {o.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.9rem' }}>No Outlets Allowed</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${mem.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                            {mem.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {canUpdate && (
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEditModal(mem)}
                                title="Edit Access"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canSuspend && mem.membership_type !== 'owner' && (
                              mem.status === 'active' ? (
                                <button 
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleSuspend(mem.id, mem.user.display_name)}
                                  title="Suspend User"
                                >
                                  <Ban size={14} />
                                </button>
                              ) : (
                                <button 
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleReactivate(mem.id, mem.user.display_name)}
                                  title="Reactivate User"
                                >
                                  <CheckCircle size={14} />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Activations Table */}
          {filteredActivations.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="h4">Pending Activations</h3>
                <span className="badge badge-secondary">{filteredActivations.length} Pending</span>
              </div>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Display Name</th>
                      <th>Email</th>
                      <th>Target Role</th>
                      <th>Expires At</th>
                      <th>Invited By</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivations.map((act) => (
                      <tr key={act.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{act.display_name}</div>
                          {act.phone_number && (
                            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{act.phone_number}</div>
                          )}
                        </td>
                        <td>{act.email}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          <div style={{ fontSize: '0.9rem' }}>{act.membership_type}</div>
                          {act.roles.map(r => (
                            <span key={r.id} className="badge badge-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'inline-block' }}>
                              {r.name}
                            </span>
                          ))}
                        </td>
                        <td style={{ color: new Date(act.expires_at) < new Date() ? 'var(--danger)' : 'inherit' }}>
                          {new Date(act.expires_at).toLocaleDateString()}
                        </td>
                        <td>{act.invited_by?.display_name || act.invited_by?.email}</td>
                        <td>
                          <span className={`badge ${act.status === 'pending' ? 'badge-primary' : 'badge-secondary'}`}>
                            {act.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {canAdd && act.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleResendActivation(act.id)}
                                title="Resend Invite"
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button 
                                className="btn btn-danger btn-sm"
                                onClick={() => handleRevokeActivation(act.id)}
                                title="Revoke Invite"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredMemberships.length === 0 && filteredActivations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
              <p className="text-muted">No memberships or activations match your search filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Add User Slider (Drawer) */}
      {isAddUserOpen && (
        <div className="slider-overlay" onClick={() => setIsAddUserOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()}>
            <div className="slider-header">
              <h3 className="h4">Add User</h3>
              <button className="btn-close" onClick={() => setIsAddUserOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            {addSuccessState ? (
              <div className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', justifyContent: 'center', height: '80%', textAlign: 'center' }}>
                <CheckCircle size={64} style={{ color: 'var(--success)', margin: '0 auto' }} />
                <h4 className="h4">User Added Successfully</h4>
                <p className="text-muted">An activation email has been queued and printed to the development server console.</p>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px', textAlign: 'left', wordBreak: 'break-all' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>Development Activation URL:</div>
                  <code style={{ fontSize: '0.85rem' }}>{successLink}</code>
                </div>
                <button className="btn btn-primary" onClick={() => { resetAddForm(); setIsAddUserOpen(false); }}>
                  Close Panel
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddUserSubmit} className="slider-body">
                {formError && (
                  <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <ShieldAlert size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter display name"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="Enter email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="+91 XXXXX XXXXX"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Membership Type</label>
                  <select
                    className="form-control"
                    value={addMemType}
                    onChange={(e) => setAddMemType(e.target.value as 'administrator' | 'member')}
                  >
                    <option value="member">Regular Member</option>
                    {currentUser?.organisations?.find(o => o.id === selectedOrgId)?.membership_type === 'owner' && (
                      <option value="administrator">Administrator</option>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assign Roles</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '4px' }}>
                    {roles.map((r) => (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={addSelectedRoles.includes(r.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAddSelectedRoles([...addSelectedRoles, r.id]);
                            } else {
                              setAddSelectedRoles(addSelectedRoles.filter(id => id !== r.id));
                            }
                          }}
                        />
                        <span>{r.name} {r.is_system && <span className="text-muted" style={{ fontSize: '0.75rem' }}>(System)</span>}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Allowed Outlets</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '4px' }}>
                    {outlets.map((o) => (
                      <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={addSelectedOutlets.includes(o.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAddSelectedOutlets([...addSelectedOutlets, o.id]);
                            } else {
                              setAddSelectedOutlets(addSelectedOutlets.filter(id => id !== o.id));
                            }
                          }}
                        />
                        <span>{o.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="slider-actions" style={{ marginTop: '2rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    Add User & Send Activation
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Access Modal */}
      {isEditOpen && selectedMembership && (
        <div className="slider-overlay" onClick={() => setIsEditOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()}>
            <div className="slider-header">
              <h3 className="h4">Edit Access: {selectedMembership.user.display_name}</h3>
              <button className="btn-close" onClick={() => setIsEditOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="slider-body">
              {editError && (
                <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <ShieldAlert size={16} />
                  <span>{editError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="text" className="form-control" value={selectedMembership.user.email} disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Membership Type</label>
                <input type="text" className="form-control" style={{ textTransform: 'capitalize' }} value={selectedMembership.membership_type} disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Assign Roles</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '4px' }}>
                  {roles.map((r) => (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editSelectedRoles.includes(r.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditSelectedRoles([...editSelectedRoles, r.id]);
                          } else {
                            setEditSelectedRoles(editSelectedRoles.filter(id => id !== r.id));
                          }
                        }}
                      />
                      <span>{r.name} {r.is_system && <span className="text-muted" style={{ fontSize: '0.75rem' }}>(System)</span>}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Allowed Outlets</label>
                {selectedMembership.membership_type === 'owner' || selectedMembership.membership_type === 'administrator' ? (
                  <div className="text-muted" style={{ fontSize: '0.9rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                    Owners and Administrators have access to all outlets.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '4px' }}>
                    {outlets.map((o) => (
                      <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editSelectedOutlets.includes(o.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditSelectedOutlets([...editSelectedOutlets, o.id]);
                            } else {
                              setEditSelectedOutlets(editSelectedOutlets.filter(id => id !== o.id));
                            }
                          }}
                        />
                        <span>{o.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="slider-actions" style={{ marginTop: '2rem' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  Save Permissions & Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
