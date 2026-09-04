import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchDispensers,
  createDispenser,
  updateDispenser,
  fetchNozzles,
  createNozzle,
  updateNozzle,
  fetchTanks,
  fetchNozzleCommissioningStatus,
  commissionNozzle,
  bulkCommissionNozzles,
  type Dispenser,
  type Nozzle,
  type Tank,
  type NozzleCommissioningStatusItem,
  ApiError
} from '@/api/client';
import { Search, Plus, Ban, CheckCircle, RefreshCw, X, Edit2, Wrench, Fuel, Database, Sparkles, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const DispensersNozzlesManagement: React.FC = () => {
  const { dispenserId, nozzleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);
  const currentUser = useAppSelector((state) => state.auth.currentUser);
  const currentOrg = currentUser?.organisations?.find((o) => o.id === selectedOrgId);
  const currentOutlet = currentOrg?.outlets?.find((o: any) => o.id === selectedOutletId);

  // Tabs: 'dispensers' | 'nozzles'
  const [activeTab, setActiveTab] = useState<'dispensers' | 'nozzles'>('dispensers');

  // Lists & Loading
  const [dispensers, setDispensers] = useState<Dispenser[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [commissioningStatuses, setCommissioningStatuses] = useState<NozzleCommissioningStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'maintenance'>('all');

  // Drawers
  const [isDispenserDrawerOpen, setIsDispenserDrawerOpen] = useState(false);
  const [isNozzleDrawerOpen, setIsNozzleDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingDispenser, setEditingDispenser] = useState<Dispenser | null>(null);
  const [editingNozzle, setEditingNozzle] = useState<Nozzle | null>(null);

  // Commissioning Drawers & States
  const [isCommissionDrawerOpen, setIsCommissionDrawerOpen] = useState(false);
  const [commissioningNozzle, setCommissioningNozzle] = useState<Nozzle | null>(null);
  const [commissioningStatusItem, setCommissioningStatusItem] = useState<NozzleCommissioningStatusItem | null>(null);
  const [singleCommissionForm, setSingleCommissionForm] = useState({
    initial_totalizer: '',
    effective_at: '',
    reason: '',
    notes: '',
    activate: true,
  });
  const [singleCommissionLoading, setSingleCommissionLoading] = useState(false);
  const [singleCommissionError, setSingleCommissionError] = useState<string | null>(null);
  const [singleCommissionFieldErrors, setSingleCommissionFieldErrors] = useState<Record<string, string>>({});

  // Bulk Commissioning State
  const [isBulkDrawerOpen, setIsBulkDrawerOpen] = useState(false);
  const [bulkEffectiveAt, setBulkEffectiveAt] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkActivate, setBulkActivate] = useState(true);
  const [bulkRows, setBulkRows] = useState<Array<{
    nozzle_id: string;
    nozzle_code: string;
    nozzle_name: string;
    dispenser_name: string;
    product_name: string;
    initial_totalizer: string;
    notes: string;
  }>>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkRowErrors, setBulkRowErrors] = useState<Record<string, string>>({});

  // Form States
  const [dispenserForm, setDispenserForm] = useState({
    code: '',
    name: '',
    manufacturer: '',
    model_number: '',
    serial_number: '',
    commissioned_on: '',
    status: 'active',
    notes: '',
  });

  const [nozzleForm, setNozzleForm] = useState({
    code: '',
    name: '',
    nozzle_number: '',
    dispenser: '',
    tank: '',
    status: 'active',
    notes: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'dispenser' | 'nozzle';
    itemId: string;
    itemName: string;
    status: 'active' | 'inactive' | 'maintenance';
  }>({
    isOpen: false,
    type: 'dispenser',
    itemId: '',
    itemName: '',
    status: 'active'
  });

  // Permissions
  const canDispenserView = usePermission('dispenser.view');
  const canDispenserCreate = usePermission('dispenser.create');
  const canDispenserUpdate = usePermission('dispenser.update');
  const canDispenserDeactivate = usePermission('dispenser.deactivate');

  const canNozzleView = usePermission('nozzle.view');
  const canNozzleCreate = usePermission('nozzle.create');
  const canNozzleUpdate = usePermission('nozzle.update');
  const canNozzleDeactivate = usePermission('nozzle.deactivate');
  const canNozzleCommission = usePermission('nozzle.commission');

  const getLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const loadData = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    try {
      const [dispenserList, nozzleList, tankList, commStatusList] = await Promise.all([
        fetchDispensers(selectedOrgId, selectedOutletId),
        fetchNozzles(selectedOrgId, selectedOutletId),
        fetchTanks(selectedOrgId, selectedOutletId, { status: 'active' }),
        fetchNozzleCommissioningStatus(selectedOrgId, selectedOutletId).catch((err) => {
          console.warn('Failed to load commissioning status:', err);
          return [] as NozzleCommissioningStatusItem[];
        }),
      ]);
      setDispensers(dispenserList);
      setNozzles(nozzleList);
      setTanks(tankList);
      setCommissioningStatuses(commStatusList);
    } catch (err) {
      console.error('Failed to load forecourt master records:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Tab Switch
  const handleTabChange = (tab: 'dispensers' | 'nozzles') => {
    setActiveTab(tab);
    setSearchTerm('');
    setStatusFilter('all');
  };

  // Open Dispenser Edit Drawer
  const openDispenserEdit = useCallback((dispenser: Dispenser) => {
    setEditingDispenser(dispenser);
    setDrawerMode('edit');
    setFormErrors({});
    setGeneralError(null);
    setDispenserForm({
      code: dispenser.code || '',
      name: dispenser.name || '',
      manufacturer: dispenser.manufacturer || '',
      model_number: dispenser.model_number || '',
      serial_number: dispenser.serial_number || '',
      commissioned_on: dispenser.commissioned_on || '',
      status: dispenser.status || 'active',
      notes: dispenser.notes || '',
    });
    setIsDispenserDrawerOpen(true);
  }, []);

  // Open Nozzle Edit Drawer
  const openNozzleEdit = useCallback((nozzle: Nozzle) => {
    setEditingNozzle(nozzle);
    setDrawerMode('edit');
    setFormErrors({});
    setGeneralError(null);
    setNozzleForm({
      code: nozzle.code || '',
      name: nozzle.name || '',
      nozzle_number: nozzle.nozzle_number ? String(nozzle.nozzle_number) : '',
      dispenser: nozzle.dispenser || '',
      tank: nozzle.tank || '',
      status: nozzle.status || 'active',
      notes: nozzle.notes || '',
    });
    setIsNozzleDrawerOpen(true);
  }, []);

  // Sync route params and navigation state
  useEffect(() => {
    const state = location.state as { openDispenserAdd?: boolean; openNozzleAdd?: boolean; editDispenserId?: string } | null;
    
    if (state && state.openDispenserAdd) {
      navigate(location.pathname, { replace: true, state: {} });
      setActiveTab('dispensers');
      setDrawerMode('add');
      setEditingDispenser(null);
      setFormErrors({});
      setGeneralError(null);
      setDispenserForm({
        code: '',
        name: '',
        manufacturer: '',
        model_number: '',
        serial_number: '',
        commissioned_on: '',
        status: 'active',
        notes: '',
      });
      setIsDispenserDrawerOpen(true);
    } else if (state && state.openNozzleAdd) {
      navigate(location.pathname, { replace: true, state: {} });
      setActiveTab('nozzles');
      setDrawerMode('add');
      setEditingNozzle(null);
      setFormErrors({});
      setGeneralError(null);
      setNozzleForm({
        code: '',
        name: '',
        nozzle_number: '',
        dispenser: dispensers.length > 0 ? dispensers[0].id : '',
        tank: tanks.length > 0 ? tanks[0].id : '',
        status: 'active',
        notes: '',
      });
      setIsNozzleDrawerOpen(true);
    } else if (state && state.editDispenserId && dispensers.length > 0) {
      const disp = dispensers.find((d) => d.id === state.editDispenserId);
      navigate(location.pathname, { replace: true, state: {} });
      if (disp) {
        setActiveTab('dispensers');
        openDispenserEdit(disp);
      }
    } else if (dispenserId && dispensers.length > 0) {
      const disp = dispensers.find((d) => d.id === dispenserId);
      if (disp) {
        setActiveTab('dispensers');
        openDispenserEdit(disp);
      } else {
        navigate('/app/settings/dispensers-nozzles');
      }
    } else if (nozzleId && nozzles.length > 0) {
      const noz = nozzles.find((n) => n.id === nozzleId);
      if (noz) {
        setActiveTab('nozzles');
        openNozzleEdit(noz);
      } else {
        navigate('/app/settings/dispensers-nozzles');
      }
    }
  }, [dispenserId, nozzleId, dispensers, nozzles, openDispenserEdit, openNozzleEdit, navigate, location, tanks]);

  const handleCloseDispenserDrawer = () => {
    setIsDispenserDrawerOpen(false);
    setEditingDispenser(null);
    if (dispenserId) {
      navigate('/app/settings/dispensers-nozzles');
    }
  };

  const handleCloseNozzleDrawer = () => {
    setIsNozzleDrawerOpen(false);
    setEditingNozzle(null);
    if (nozzleId) {
      navigate('/app/settings/dispensers-nozzles');
    }
  };

  // Submit Dispenser Form
  const handleDispenserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;
    setActionLoading(true);
    setGeneralError(null);
    setFormErrors({});

    const payload = {
      code: dispenserForm.code.trim(),
      name: dispenserForm.name.trim(),
      manufacturer: dispenserForm.manufacturer.trim() || null,
      model_number: dispenserForm.model_number.trim() || null,
      serial_number: dispenserForm.serial_number.trim() || null,
      commissioned_on: dispenserForm.commissioned_on || null,
      status: dispenserForm.status as any,
      notes: dispenserForm.notes.trim() || null,
    };

    try {
      if (drawerMode === 'add') {
        await createDispenser(selectedOrgId, selectedOutletId, payload);
      } else if (editingDispenser) {
        await updateDispenser(selectedOrgId, selectedOutletId, editingDispenser.id, payload);
      }
      handleCloseDispenserDrawer();
      loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 400 && typeof err.data === 'object' && err.data !== null) {
          const errors = err.data as Record<string, string[] | string>;
          const formatted: Record<string, string> = {};
          Object.keys(errors).forEach((key) => {
            const val = errors[key];
            formatted[key] = Array.isArray(val) ? val[0] : String(val);
          });
          setFormErrors(formatted);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError('An unexpected error occurred.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Nozzle Form
  const handleNozzleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;
    setActionLoading(true);
    setGeneralError(null);
    setFormErrors({});

    const payload = {
      code: nozzleForm.code.trim(),
      name: nozzleForm.name.trim(),
      nozzle_number: nozzleForm.nozzle_number ? parseInt(nozzleForm.nozzle_number) : null,
      dispenser: nozzleForm.dispenser,
      tank: nozzleForm.tank,
      status: nozzleForm.status as any,
      notes: nozzleForm.notes.trim() || null,
    };

    try {
      if (drawerMode === 'add') {
        await createNozzle(selectedOrgId, selectedOutletId, payload);
      } else if (editingNozzle) {
        await updateNozzle(selectedOrgId, selectedOutletId, editingNozzle.id, payload);
      }
      handleCloseNozzleDrawer();
      loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 400 && typeof err.data === 'object' && err.data !== null) {
          const errors = err.data as Record<string, string[] | string>;
          const formatted: Record<string, string> = {};
          Object.keys(errors).forEach((key) => {
            const val = errors[key];
            formatted[key] = Array.isArray(val) ? val[0] : String(val);
          });
          setFormErrors(formatted);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError('An unexpected error occurred.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Status Click
  const handleStatusChangeClick = (type: 'dispenser' | 'nozzle', item: any, newStatus: any) => {
    setConfirmModal({
      isOpen: true,
      type,
      itemId: item.id,
      itemName: item.name,
      status: newStatus
    });
  };

  const handleConfirmStatusChange = async () => {
    const { type, itemId, status } = confirmModal;
    if (!selectedOrgId || !selectedOutletId || !itemId) return;

    try {
      if (type === 'dispenser') {
        await updateDispenser(selectedOrgId, selectedOutletId, itemId, { status });
      } else {
        await updateNozzle(selectedOrgId, selectedOutletId, itemId, { status });
      }
      setConfirmModal({ isOpen: false, type: 'dispenser', itemId: '', itemName: '', status: 'active' });
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  // Commissioning Handlers
  const missingCommissioningNozzles = nozzles.filter((n) => {
    const statusItem = commissioningStatuses.find((c) => c.nozzle_id === n.id);
    return statusItem?.status === 'missing' || (!statusItem && n.status === 'active');
  });
  const missingCommissioningCount = missingCommissioningNozzles.length;

  const openSingleCommissionDrawer = (nozzle: Nozzle, statusItem?: NozzleCommissioningStatusItem) => {
    setCommissioningNozzle(nozzle);
    setCommissioningStatusItem(statusItem || commissioningStatuses.find((c) => c.nozzle_id === nozzle.id) || null);
    setSingleCommissionForm({
      initial_totalizer: '',
      effective_at: getLocalDateTimeString(),
      reason: 'Newly installed nozzle commissioning',
      notes: '',
      activate: true,
    });
    setSingleCommissionError(null);
    setSingleCommissionFieldErrors({});
    setIsCommissionDrawerOpen(true);
  };

  const handleCloseCommissionDrawer = () => {
    setIsCommissionDrawerOpen(false);
    setCommissioningNozzle(null);
    setCommissioningStatusItem(null);
    setSingleCommissionError(null);
    setSingleCommissionFieldErrors({});
  };

  const handleSingleCommissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !commissioningNozzle) return;

    const errors: Record<string, string> = {};
    if (!singleCommissionForm.initial_totalizer.trim()) {
      errors.initial_totalizer = 'Initial totalizer reading is required.';
    } else {
      const val = parseFloat(singleCommissionForm.initial_totalizer);
      if (isNaN(val) || val < 0) {
        errors.initial_totalizer = 'Totalizer must be a valid non-negative number.';
      }
    }

    if (!singleCommissionForm.reason.trim()) {
      errors.reason = 'Commissioning reason is mandatory.';
    }

    if (!singleCommissionForm.effective_at) {
      errors.effective_at = 'Effective date & time is required.';
    }

    if (Object.keys(errors).length > 0) {
      setSingleCommissionFieldErrors(errors);
      return;
    }

    setSingleCommissionLoading(true);
    setSingleCommissionError(null);
    try {
      await commissionNozzle(selectedOrgId, selectedOutletId, commissioningNozzle.id, {
        initial_totalizer: singleCommissionForm.initial_totalizer,
        effective_at: new Date(singleCommissionForm.effective_at).toISOString(),
        reason: singleCommissionForm.reason.trim(),
        notes: singleCommissionForm.notes.trim() || undefined,
        activate: singleCommissionForm.activate,
      });
      handleCloseCommissionDrawer();
      await loadData();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setSingleCommissionError(err.message);
      } else {
        setSingleCommissionError('An unexpected error occurred while commissioning the nozzle.');
      }
    } finally {
      setSingleCommissionLoading(false);
    }
  };

  const openBulkCommissionDrawer = () => {
    const rows = missingCommissioningNozzles.map((n) => ({
      nozzle_id: n.id,
      nozzle_code: n.code,
      nozzle_name: n.name,
      dispenser_name: n.dispenser_name || 'Dispenser',
      product_name: n.product_name || 'Fuel',
      initial_totalizer: '',
      notes: '',
    }));
    setBulkRows(rows);
    setBulkEffectiveAt(getLocalDateTimeString());
    setBulkReason('Bulk commissioning of newly installed forecourt nozzles');
    setBulkActivate(true);
    setBulkError(null);
    setBulkRowErrors({});
    setIsBulkDrawerOpen(true);
  };

  const handleCloseBulkDrawer = () => {
    setIsBulkDrawerOpen(false);
    setBulkRows([]);
    setBulkError(null);
    setBulkRowErrors({});
  };

  const handleBulkCommissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;

    if (!bulkReason.trim()) {
      setBulkError('Common commissioning reason is mandatory.');
      return;
    }
    if (!bulkEffectiveAt) {
      setBulkError('Effective date & time is required.');
      return;
    }

    const rowErrors: Record<string, string> = {};
    const itemsPayload = [];

    for (const row of bulkRows) {
      if (!row.initial_totalizer.trim()) {
        rowErrors[row.nozzle_id] = 'Required';
      } else {
        const val = parseFloat(row.initial_totalizer);
        if (isNaN(val) || val < 0) {
          rowErrors[row.nozzle_id] = 'Must be >= 0';
        } else {
          itemsPayload.push({
            nozzle_id: row.nozzle_id,
            initial_totalizer: row.initial_totalizer.trim(),
            notes: row.notes.trim() || undefined,
          });
        }
      }
    }

    if (Object.keys(rowErrors).length > 0) {
      setBulkRowErrors(rowErrors);
      setBulkError('Please provide valid starting totalizers for all nozzles.');
      return;
    }

    setBulkLoading(true);
    setBulkError(null);
    try {
      await bulkCommissionNozzles(selectedOrgId, selectedOutletId, {
        effective_at: new Date(bulkEffectiveAt).toISOString(),
        reason: bulkReason.trim(),
        activate: bulkActivate,
        items: itemsPayload,
      });
      handleCloseBulkDrawer();
      await loadData();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setBulkError(err.message);
      } else {
        setBulkError('An unexpected error occurred during bulk commissioning.');
      }
    } finally {
      setBulkLoading(false);
    }
  };

  // Filter Dispensers
  const filteredDispensers = dispensers.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && d.status === 'active') ||
      (statusFilter === 'inactive' && d.status === 'inactive') ||
      (statusFilter === 'maintenance' && d.status === 'maintenance');

    return matchesSearch && matchesStatus;
  });

  // Filter Nozzles
  const filteredNozzles = nozzles.filter((n) => {
    const matchesSearch =
      n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.dispenser_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.tank_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.product_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && n.status === 'active') ||
      (statusFilter === 'inactive' && n.status === 'inactive') ||
      (statusFilter === 'maintenance' && n.status === 'maintenance');

    return matchesSearch && matchesStatus;
  });

  if (!selectedOutletId) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Wrench size={48} style={{ color: 'var(--color-accent)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Select an Outlet</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Please select an outlet from the sidebar selector to manage dispensers and nozzles.</p>
      </div>
    );
  }

  if (activeTab === 'dispensers' && !canDispenserView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Wrench size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view dispensers.</p>
      </div>
    );
  }

  if (activeTab === 'nozzles' && !canNozzleView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Fuel size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view nozzles.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - var(--topbar-height) - var(--space-xl))' }}>
      <PageHeader
        title="Dispensers & Nozzles"
        subtitle="Configure fuel delivery machines, hoses, and underground tank mapping"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {activeTab === 'dispensers' && canDispenserCreate && (
              <button
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => {
                  setDrawerMode('add');
                  setEditingDispenser(null);
                  setFormErrors({});
                  setGeneralError(null);
                  setDispenserForm({
                    code: '',
                    name: '',
                    manufacturer: '',
                    model_number: '',
                    serial_number: '',
                    commissioned_on: '',
                    status: 'active',
                    notes: '',
                  });
                  setIsDispenserDrawerOpen(true);
                }}
              >
                <Plus size={18} />
                <span>Add Dispenser</span>
              </button>
            )}
            {activeTab === 'nozzles' && (
              <>
                {missingCommissioningCount > 0 && canNozzleCommission && (
                  <button
                    className="btn btn-secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      borderColor: '#d97706',
                      color: '#d97706',
                      fontWeight: 600,
                    }}
                    onClick={openBulkCommissionDrawer}
                  >
                    <Sparkles size={16} />
                    <span>Commission Missing ({missingCommissioningCount})</span>
                  </button>
                )}
                {canNozzleCreate && (
                  <button
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => {
                      setDrawerMode('add');
                      setEditingNozzle(null);
                      setFormErrors({});
                      setGeneralError(null);
                      setNozzleForm({
                        code: '',
                        name: '',
                        nozzle_number: '',
                        dispenser: dispensers.length > 0 ? dispensers[0].id : '',
                        tank: tanks.length > 0 ? tanks[0].id : '',
                        status: 'active',
                        notes: '',
                      });
                      setIsNozzleDrawerOpen(true);
                    }}
                  >
                    <Plus size={18} />
                    <span>Add Nozzle</span>
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Tabs Layout */}
      <div className="tabs-header" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <button
          className={`tab-btn ${activeTab === 'dispensers' ? 'active' : ''}`}
          style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'dispensers' ? '2px solid var(--color-accent)' : 'none', cursor: 'pointer', fontWeight: 600, color: activeTab === 'dispensers' ? 'var(--text-main)' : 'var(--text-muted)' }}
          onClick={() => handleTabChange('dispensers')}
        >
          Dispensers ({dispensers.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'nozzles' ? 'active' : ''}`}
          style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'nozzles' ? '2px solid var(--color-accent)' : 'none', cursor: 'pointer', fontWeight: 600, color: activeTab === 'nozzles' ? 'var(--text-main)' : 'var(--text-muted)' }}
          onClick={() => handleTabChange('nozzles')}
        >
          Nozzles ({nozzles.length})
        </button>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder={activeTab === 'dispensers' ? 'Search by dispenser name or code...' : 'Search by name, code, dispenser, tank, or fuel...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-control"
          style={{ width: '180px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading records...</p>
        </div>
      ) : activeTab === 'dispensers' ? (
        /* Dispensers Tab */
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dispenser Details</th>
                  <th>Code</th>
                  <th>Machine Info</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDispensers.map((d) => {
                  const dispNozzles = nozzles.filter((n) => n.dispenser === d.id);
                  return (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.name}</div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          {dispNozzles.map((n) => (
                            <span key={n.id} className={`badge ${n.status === 'active' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem' }} title={`Nozzle ${n.code} mapped to ${n.tank_code}`}>
                              {n.code}
                            </span>
                          ))}
                          {dispNozzles.length === 0 && <span className="text-muted" style={{ fontSize: '0.75rem' }}>No nozzles configured</span>}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{d.code}</code>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>
                          <div>Mfg: {d.manufacturer || '—'}</div>
                          <div className="text-muted">Model: {d.model_number || '—'}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${d.status === 'active' ? 'badge-success' : d.status === 'inactive' ? 'badge-danger' : 'badge-warning'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {canDispenserUpdate && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => navigate(`/app/settings/dispensers/${d.id}`)}
                              title="Edit Dispenser Details"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {canDispenserDeactivate && (
                            d.status === 'active' ? (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleStatusChangeClick('dispenser', d, 'inactive')}
                                title="Deactivate Dispenser"
                              >
                                <Ban size={14} />
                              </button>
                            ) : (
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleStatusChangeClick('dispenser', d, 'active')}
                                title="Activate Dispenser"
                              >
                                <CheckCircle size={14} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDispensers.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No fuel dispensers found matching your filters.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Nozzles Tab */
        <>
          {/* Missing Commissioning Notice Banner */}
          {missingCommissioningCount > 0 && (
            <div
              style={{
                padding: '0.85rem 1.25rem',
                marginBottom: '1.25rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0 }} />
                <div>
                  <strong style={{ color: '#b45309' }}>
                    {missingCommissioningCount} {missingCommissioningCount === 1 ? 'nozzle requires' : 'nozzles require'} commissioning:
                  </strong>{' '}
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>
                    New nozzles must have an authoritative starting totalizer established before shifts can be opened.
                  </span>
                </div>
              </div>
              {canNozzleCommission && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={openBulkCommissionDrawer}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#d97706', borderColor: '#d97706', color: '#ffffff' }}
                >
                  <Sparkles size={14} />
                  <span>Commission Missing Nozzles</span>
                </button>
              )}
            </div>
          )}

          <div className="card">
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nozzle Code / Name</th>
                    <th>Dispenser</th>
                    <th>Connected Storage Tank</th>
                    <th>Derived Fuel</th>
                    <th>Nozzle Number</th>
                    <th>Starting Reading / Baseline</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNozzles.map((n) => {
                    const commItem = commissioningStatuses.find((c) => c.nozzle_id === n.id);
                    const isMissing = commItem?.status === 'missing' || (!commItem && n.status === 'active');
                    const canCommissionThis = (commItem ? commItem.commissioning_allowed : true) && canNozzleCommission;

                    return (
                      <tr key={n.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{n.name}</div>
                          <code style={{ fontSize: '0.8rem', color: 'var(--color-accent)' }}>{n.code}</code>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{n.dispenser_name}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 500 }}>
                            <Database size={12} className="text-muted" />
                            <span>{n.tank_name} ({n.tank_code})</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Fuel size={12} className="text-muted" />
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{n.product_name}</span>
                          </div>
                        </td>
                        <td>{n.nozzle_number || '—'}</td>
                        <td>
                          {commItem?.status === 'opening_balance' ? (
                            <div>
                              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary, #e2e8f0)', color: 'var(--text-secondary, #475569)' }}>
                                Opening Balance
                              </span>
                              {commItem.starting_totalizer != null && (
                                <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                  {Number(commItem.starting_totalizer).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L
                                </div>
                              )}
                            </div>
                          ) : commItem?.status === 'commissioned' ? (
                            <div>
                              <span
                                className="badge"
                                style={{ backgroundColor: 'rgba(13, 148, 136, 0.15)', color: '#0f766e', border: '1px solid rgba(13, 148, 136, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                title={`Commissioned by ${commItem.commissioned_by_name || 'System'}${commItem.reason ? `: ${commItem.reason}` : ''}`}
                              >
                                <CheckCircle2 size={12} /> Commissioned
                              </span>
                              {commItem.starting_totalizer != null && (
                                <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-main)', fontWeight: 600, marginTop: '0.2rem' }}>
                                  {Number(commItem.starting_totalizer).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L
                                </div>
                              )}
                              {commItem.commissioned_by_name && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  By {commItem.commissioned_by_name}
                                </div>
                              )}
                            </div>
                          ) : commItem?.status === 'previous_shift' ? (
                            <div>
                              <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#4338ca', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                Previous Shift
                              </span>
                              {commItem.starting_totalizer != null && (
                                <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-main)', marginTop: '0.2rem' }}>
                                  {Number(commItem.starting_totalizer).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.35)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <AlertTriangle size={12} /> Commissioning Required
                              </span>
                              <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: '0.2rem' }}>
                                No starting totalizer
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${n.status === 'active' ? 'badge-success' : n.status === 'inactive' ? 'badge-danger' : 'badge-warning'}`}>
                            {n.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {canCommissionThis && isMissing && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => openSingleCommissionDrawer(n, commItem)}
                                title="Commission Nozzle (Establish Starting Totalizer)"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#0d9488', borderColor: '#0d9488' }}
                              >
                                <Sparkles size={13} />
                                <span>Commission</span>
                              </button>
                            )}
                            {canNozzleUpdate && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => navigate(`/app/settings/nozzles/${n.id}`)}
                                title="Edit Nozzle Mapping"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canNozzleDeactivate && (
                              n.status === 'active' ? (
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleStatusChangeClick('nozzle', n, 'inactive')}
                                  title="Deactivate Nozzle"
                                >
                                  <Ban size={14} />
                                </button>
                              ) : (
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleStatusChangeClick('nozzle', n, 'active')}
                                  title="Activate Nozzle"
                                >
                                  <CheckCircle size={14} />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredNozzles.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                        <p className="text-muted">No dispenser nozzles mapped yet.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Dispenser Add / Edit Drawer */}
      {isDispenserDrawerOpen && (
        <div className="slider-overlay" onClick={handleCloseDispenserDrawer}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wrench size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add Fuel Dispenser' : 'Edit Dispenser Details'}</span>
              </h3>
              <button className="btn-close" onClick={handleCloseDispenserDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDispenserSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {generalError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {generalError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Dispenser Name *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.name ? 'error' : ''}`}
                    placeholder="e.g. MPD DU-01"
                    value={dispenserForm.name}
                    onChange={(e) => setDispenserForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  {formErrors.name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.name}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Dispenser Code *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.code ? 'error' : ''}`}
                    placeholder="e.g. DU-01"
                    value={dispenserForm.code}
                    onChange={(e) => setDispenserForm(prev => ({ ...prev, code: e.target.value }))}
                    required
                    disabled={drawerMode === 'edit'}
                  />
                  {formErrors.code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.code}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Manufacturer</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Gilbarco"
                    value={dispenserForm.manufacturer}
                    onChange={(e) => setDispenserForm(prev => ({ ...prev, manufacturer: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Model Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Encore 500"
                    value={dispenserForm.model_number}
                    onChange={(e) => setDispenserForm(prev => ({ ...prev, model_number: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Serial Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. SN-5743892"
                    value={dispenserForm.serial_number}
                    onChange={(e) => setDispenserForm(prev => ({ ...prev, serial_number: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Dispenser Status</label>
                  <select
                    className="form-control"
                    value={dispenserForm.status}
                    onChange={(e) => setDispenserForm(prev => ({ ...prev, status: e.target.value }))}
                    disabled={drawerMode === 'add'}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Commissioned Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={dispenserForm.commissioned_on}
                  onChange={(e) => setDispenserForm(prev => ({ ...prev, commissioned_on: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Dispenser remarks or logs..."
                  value={dispenserForm.notes}
                  onChange={(e) => setDispenserForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseDispenserDrawer} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Dispenser'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nozzle Add / Edit Drawer */}
      {isNozzleDrawerOpen && (
        <div className="slider-overlay" onClick={handleCloseNozzleDrawer}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Fuel size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add Dispenser Nozzle' : 'Edit Nozzle Mapping'}</span>
              </h3>
              <button className="btn-close" onClick={handleCloseNozzleDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleNozzleSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {generalError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {generalError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Nozzle Name *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.name ? 'error' : ''}`}
                    placeholder="e.g. Nozzle 1 Petrol"
                    value={nozzleForm.name}
                    onChange={(e) => setNozzleForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  {formErrors.name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.name}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Nozzle Code *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.code ? 'error' : ''}`}
                    placeholder="e.g. N1-P1"
                    value={nozzleForm.code}
                    onChange={(e) => setNozzleForm(prev => ({ ...prev, code: e.target.value }))}
                    required
                    disabled={drawerMode === 'edit'}
                  />
                  {formErrors.code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.code}</span>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Parent Dispenser *</label>
                <select
                  className={`form-control ${formErrors.dispenser ? 'error' : ''}`}
                  value={nozzleForm.dispenser}
                  onChange={(e) => setNozzleForm(prev => ({ ...prev, dispenser: e.target.value }))}
                  required
                >
                  <option value="">Select dispenser...</option>
                  {dispensers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
                {formErrors.dispenser && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.dispenser}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Connected Storage Tank *</label>
                <select
                  className={`form-control ${formErrors.tank ? 'error' : ''}`}
                  value={nozzleForm.tank}
                  onChange={(e) => setNozzleForm(prev => ({ ...prev, tank: e.target.value }))}
                  required
                >
                  <option value="">Select active storage tank...</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code}) - {t.product_name}</option>
                  ))}
                </select>
                {formErrors.tank && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.tank}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Nozzle Number (Position ID)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 1"
                    value={nozzleForm.nozzle_number}
                    onChange={(e) => setNozzleForm(prev => ({ ...prev, nozzle_number: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Nozzle Status</label>
                  <select
                    className="form-control"
                    value={nozzleForm.status}
                    onChange={(e) => setNozzleForm(prev => ({ ...prev, status: e.target.value }))}
                    disabled={drawerMode === 'add'}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Enter remarks or service notes..."
                  value={nozzleForm.notes}
                  onChange={(e) => setNozzleForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseNozzleDrawer} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Nozzle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Nozzle Commissioning Drawer */}
      {isCommissionDrawerOpen && commissioningNozzle && (
        <div className="slider-overlay" onClick={handleCloseCommissionDrawer}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '520px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Sparkles size={20} style={{ color: '#0d9488' }} />
                <span>Commission Nozzle</span>
              </h3>
              <button className="btn-close" onClick={handleCloseCommissionDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSingleCommissionSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {/* Context Summary Cards */}
              <div style={{ backgroundColor: 'var(--bg-card-hover, rgba(0,0,0,0.02))', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  Master Record Context (Read-Only)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Outlet</span>
                    <strong>{currentOutlet?.name || 'Selected Outlet'}</strong>
                  </div>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Dispenser</span>
                    <strong>{commissioningNozzle.dispenser_name || 'Dispenser'}</strong>
                  </div>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Nozzle</span>
                    <strong>{commissioningNozzle.name} ({commissioningNozzle.code})</strong>
                  </div>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Connected Fuel</span>
                    <strong style={{ color: 'var(--color-accent)' }}>{commissioningNozzle.product_name || 'Fuel Product'}</strong>
                  </div>
                  {commissioningStatusItem && (
                    <div>
                      <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Baseline Status</span>
                      <span className="badge" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                        {commissioningStatusItem.status === 'missing' ? 'Uncommissioned' : commissioningStatusItem.status.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning Notice Box */}
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(13, 148, 136, 0.08)',
                border: '1px solid rgba(13, 148, 136, 0.25)',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start'
              }}>
                <ShieldCheck size={20} style={{ color: '#0d9488', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                  <strong>Authoritative Starting Meter Reading:</strong> This reading becomes the authoritative starting totalizer for this nozzle and cannot be edited normally after confirmation. No stock or accounting entries will be generated.
                </div>
              </div>

              {singleCommissionError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {singleCommissionError}
                </div>
              )}

              {/* Initial Totalizer */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Initial Totalizer Reading (Litres) *
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className={`form-control ${singleCommissionFieldErrors.initial_totalizer ? 'error' : ''}`}
                  placeholder="e.g. 12540.350"
                  value={singleCommissionForm.initial_totalizer}
                  onChange={(e) => setSingleCommissionForm(prev => ({ ...prev, initial_totalizer: e.target.value }))}
                  required
                  style={{ fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 600 }}
                />
                {singleCommissionFieldErrors.initial_totalizer && (
                  <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {singleCommissionFieldErrors.initial_totalizer}
                  </span>
                )}
                <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                  The exact mechanical/electronic totalizer reading displayed on the dispenser.
                </span>
              </div>

              {/* Effective Date-Time */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Effective Date & Time *</label>
                <input
                  type="datetime-local"
                  className={`form-control ${singleCommissionFieldErrors.effective_at ? 'error' : ''}`}
                  value={singleCommissionForm.effective_at}
                  onChange={(e) => setSingleCommissionForm(prev => ({ ...prev, effective_at: e.target.value }))}
                  required
                />
                {singleCommissionFieldErrors.effective_at && (
                  <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {singleCommissionFieldErrors.effective_at}
                  </span>
                )}
              </div>

              {/* Mandatory Reason */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Commissioning Reason *</label>
                <input
                  type="text"
                  className={`form-control ${singleCommissionFieldErrors.reason ? 'error' : ''}`}
                  placeholder="e.g. Newly installed dispenser DU-02 nozzle"
                  value={singleCommissionForm.reason}
                  onChange={(e) => setSingleCommissionForm(prev => ({ ...prev, reason: e.target.value }))}
                  required
                />
                {singleCommissionFieldErrors.reason && (
                  <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {singleCommissionFieldErrors.reason}
                  </span>
                )}
              </div>

              {/* Optional Notes */}
              <div className="form-group">
                <label className="form-label">Audit Notes (Optional)</label>
                <textarea
                  className="form-control"
                  style={{ minHeight: '70px', resize: 'vertical' }}
                  placeholder="Technician details, calibration certificate ref, or remarks..."
                  value={singleCommissionForm.notes}
                  onChange={(e) => setSingleCommissionForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Activate Checkbox */}
              {commissioningNozzle.status !== 'active' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    id="activate-nozzle-checkbox"
                    checked={singleCommissionForm.activate}
                    onChange={(e) => setSingleCommissionForm(prev => ({ ...prev, activate: e.target.checked }))}
                  />
                  <label htmlFor="activate-nozzle-checkbox" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Activate nozzle immediately upon commissioning
                  </label>
                </div>
              )}

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseCommissionDrawer} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, backgroundColor: '#0d9488', borderColor: '#0d9488' }}
                  disabled={singleCommissionLoading}
                >
                  {singleCommissionLoading ? 'Commissioning...' : 'Confirm & Commission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Nozzles Commissioning Drawer */}
      {isBulkDrawerOpen && (
        <div className="slider-overlay" onClick={handleCloseBulkDrawer}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '780px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Sparkles size={20} style={{ color: '#0d9488' }} />
                <span>Bulk Commission Missing Nozzles ({bulkRows.length})</span>
              </h3>
              <button className="btn-close" onClick={handleCloseBulkDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBulkCommissionSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {/* Notice */}
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(13, 148, 136, 0.08)',
                border: '1px solid rgba(13, 148, 136, 0.25)',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start'
              }}>
                <ShieldCheck size={20} style={{ color: '#0d9488', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                  Establish authoritative starting totalizers for all uncommissioned nozzles simultaneously. All entries are validated and saved atomically.
                </div>
              </div>

              {bulkError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {bulkError}
                </div>
              )}

              {/* Common Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Common Reason *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Forecourt expansion / new nozzles commissioning"
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Effective Date & Time *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={bulkEffectiveAt}
                    onChange={(e) => setBulkEffectiveAt(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Nozzles Table */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.02))' }}>
                      <th style={{ width: '24%' }}>Dispenser / Nozzle</th>
                      <th style={{ width: '20%' }}>Product</th>
                      <th style={{ width: '28%' }}>Initial Totalizer (L) *</th>
                      <th style={{ width: '28%' }}>Row Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, idx) => {
                      const error = bulkRowErrors[row.nozzle_id];
                      return (
                        <tr key={row.nozzle_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{row.nozzle_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {row.dispenser_name} &bull; <code style={{ color: 'var(--color-accent)' }}>{row.nozzle_code}</code>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{row.product_name}</span>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              placeholder="0.000"
                              className={`form-control ${error ? 'error' : ''}`}
                              value={row.initial_totalizer}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, initial_totalizer: val } : r));
                                if (bulkRowErrors[row.nozzle_id]) {
                                  setBulkRowErrors(prev => {
                                    const next = { ...prev };
                                    delete next[row.nozzle_id];
                                    return next;
                                  });
                                }
                              }}
                              style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}
                              required
                            />
                            {error && (
                              <span className="text-danger" style={{ fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' }}>
                                {error}
                              </span>
                            )}
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="Optional remarks"
                              className="form-control"
                              value={row.notes}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, notes: val } : r));
                              }}
                              style={{ fontSize: '0.85rem' }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="bulk-activate-checkbox"
                  checked={bulkActivate}
                  onChange={(e) => setBulkActivate(e.target.checked)}
                />
                <label htmlFor="bulk-activate-checkbox" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                  Activate all commissioned nozzles if inactive
                </label>
              </div>

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseBulkDrawer} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, backgroundColor: '#0d9488', borderColor: '#0d9488' }}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? 'Commissioning...' : `Commission ${bulkRows.length} Nozzles`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Deactivate Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 className="h4" style={{ margin: 0 }}>Confirm Status Update</h3>
            <p className="text-muted">
              Are you sure you want to change the status of {confirmModal.type} "{confirmModal.itemName}" to <strong>{confirmModal.status}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ isOpen: false, type: 'dispenser', itemId: '', itemName: '', status: 'active' })}>
                Cancel
              </button>
              <button 
                className={`btn ${confirmModal.status === 'inactive' ? 'btn-danger' : confirmModal.status === 'maintenance' ? 'btn-warning' : 'btn-success'}`}
                onClick={handleConfirmStatusChange}
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
