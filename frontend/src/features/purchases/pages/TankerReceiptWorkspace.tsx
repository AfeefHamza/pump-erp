// frontend/src/features/purchases/pages/TankerReceiptWorkspace.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchTankerReceiptDetail,
  createTankerReceipt,
  updateTankerReceipt,
  confirmTankerReceipt,
  voidTankerReceipt,
  fetchSuppliers,
  uploadTankerReceiptAttachment,
  getTankerReceiptAttachmentDownloadUrl,
  acknowledgeReceiptVariance,
  previewTankDipConversion
} from '@/api/client';
import type {
  Supplier,
  TankerReceiptDetail,
  TankerReceiptInput,
  ProductLineInput,
  TankAllocationInput
} from '@/features/purchases/types';
import {
  Truck,
  ArrowLeft,
  Save,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Plus,
  Trash2,
  Upload,
  Download,
  Layers,
  RefreshCw,
  Check
} from 'lucide-react';

interface TankOption {
  id: string;
  code: string;
  name: string;
  product_id: string;
  product_name: string;
  capacity: string;
}

interface ProductOption {
  id: string;
  code: string;
  name: string;
}

export const TankerReceiptWorkspace: React.FC = () => {
  const { receiptId } = useParams<{ receiptId?: string }>();
  const navigate = useNavigate();
  const activeOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const activeOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const isNew = !receiptId || receiptId === 'new';

  const [receipt, setReceipt] = useState<TankerReceiptDetail | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tanks, setTanks] = useState<TankOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [ackAllocId, setAckAllocId] = useState<string | null>(null);
  const [ackReason, setAckReason] = useState('');
  const [ackLoading, setAckLoading] = useState(false);

  // Form State
  const [receiptNumber, setReceiptNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryChallanNumber, setDeliveryChallanNumber] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [sealDetails, setSealDetails] = useState('');
  const [unloadingStartTime, setUnloadingStartTime] = useState('');
  const [unloadingEndTime, setUnloadingEndTime] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');

  // Lines & Allocations
  const [lines, setLines] = useState<ProductLineInput[]>([]);

  // Attachment upload state
  const [uploadType, setUploadType] = useState<string>('invoice');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const isConfirmed = receipt?.status === 'confirmed';
  const isVoided = receipt?.status === 'voided';
  const isReadOnly = isConfirmed || isVoided;

  useEffect(() => {
    const initData = async () => {
      if (!activeOrgId || !activeOutletId) return;
      setLoading(true);
      setError(null);
      try {
        const suppliersData = await fetchSuppliers(activeOrgId);
        setSuppliers(suppliersData);

        // Fetch tanks and products for outlet via custom summary or API
        const summaryRes = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'}/organisations/${activeOrgId}/outlets/${activeOutletId}/fuel-stock/summary/`,
          { credentials: 'include' }
        );
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          const tankList: TankOption[] = summaryData.tanks.map((t: any) => ({
            id: t.tank_id,
            code: t.tank_code,
            name: t.tank_name,
            product_id: t.product_id,
            product_name: t.product_name,
            capacity: t.capacity,
          }));
          setTanks(tankList);

          // Unique products
          const prodMap = new Map<string, ProductOption>();
          tankList.forEach((t) => {
            if (!prodMap.has(t.product_id)) {
              prodMap.set(t.product_id, { id: t.product_id, code: t.code, name: t.product_name });
            }
          });
          setProducts(Array.from(prodMap.values()));
        }

        if (!isNew && receiptId) {
          const detail = await fetchTankerReceiptDetail(activeOrgId, activeOutletId, receiptId);
          setReceipt(detail);
          setReceiptNumber(detail.receipt_number);
          setSupplierId(detail.supplier);
          setInvoiceNumber(detail.invoice_number);
          setInvoiceDate(detail.invoice_date);
          setDeliveryChallanNumber(detail.delivery_challan_number || '');
          setVehicleRegistration(detail.vehicle_registration);
          setDriverName(detail.driver_name || '');
          setDriverPhone(detail.driver_phone || '');
          setSealDetails(detail.seal_details || '');
          setUnloadingStartTime(detail.unloading_start_time ? detail.unloading_start_time.slice(0, 16) : '');
          setUnloadingEndTime(detail.unloading_end_time ? detail.unloading_end_time.slice(0, 16) : '');
          setNotes(detail.notes || '');

          // Map lines
          const mappedLines: ProductLineInput[] = detail.product_lines.map((l) => ({
            product_id: l.product,
            invoice_quantity: l.invoice_quantity,
            accepted_book_quantity: l.accepted_book_quantity,
            unit_rate: l.unit_rate || '',
            invoice_density: l.invoice_density || '',
            observed_density: l.observed_density || '',
            observed_temperature: l.observed_temperature || '',
            quantity_override_reason: l.quantity_override_reason || '',
            remarks: l.remarks || '',
            allocations: l.allocations.map((a) => ({
              tank_id: a.tank,
              allocated_book_quantity: a.allocated_book_quantity,
              pre_unloading_dip_height: a.pre_unloading_dip_height || '',
              pre_unloading_dip_unit: a.pre_unloading_dip_unit || 'millimetre',
              post_unloading_dip_height: a.post_unloading_dip_height || '',
              post_unloading_dip_unit: a.post_unloading_dip_unit || 'millimetre',
              notes: a.notes || '',
            })),
          }));
          setLines(mappedLines);
        } else {
          // Generate default receipt number
          setReceiptNumber(`TR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load workspace data.');
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [activeOrgId, activeOutletId, receiptId, isNew]);

  // Product Line Operations
  const handleAddLine = () => {
    if (products.length === 0) return;
    setLines((prev) => [
      ...prev,
      {
        product_id: products[0].id,
        invoice_quantity: '0',
        accepted_book_quantity: '0',
        unit_rate: '',
        invoice_density: '',
        observed_density: '',
        observed_temperature: '',
        quantity_override_reason: '',
        remarks: '',
        allocations: [],
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateLine = (index: number, field: keyof ProductLineInput, value: any) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      // Default accepted to invoice quantity if accepted was equal or 0
      if (field === 'invoice_quantity') {
        copy[index].accepted_book_quantity = value;
      }
      return copy;
    });
  };

  // Tank Allocation Operations
  const handleAddAllocation = (lineIndex: number) => {
    const line = lines[lineIndex];
    const compatibleTanks = tanks.filter((t) => t.product_id === line.product_id);
    if (compatibleTanks.length === 0) return;

    // Remaining accepted quantity
    const totalAllocated = line.allocations.reduce(
      (acc, a) => acc + (parseFloat(a.allocated_book_quantity) || 0),
      0
    );
    const remaining = Math.max(0, (parseFloat(line.accepted_book_quantity) || 0) - totalAllocated);

    setLines((prev) => {
      const copy = [...prev];
      const lineCopy = { ...copy[lineIndex] };
      lineCopy.allocations = [
        ...lineCopy.allocations,
        {
          tank_id: compatibleTanks[0].id,
          allocated_book_quantity: remaining.toString(),
          pre_unloading_dip_height: '',
          pre_unloading_dip_unit: 'millimetre',
          post_unloading_dip_height: '',
          post_unloading_dip_unit: 'millimetre',
          notes: '',
        },
      ];
      copy[lineIndex] = lineCopy;
      return copy;
    });
  };

  const handleRemoveAllocation = (lineIndex: number, allocIndex: number) => {
    setLines((prev) => {
      const copy = [...prev];
      const lineCopy = { ...copy[lineIndex] };
      lineCopy.allocations = lineCopy.allocations.filter((_, idx) => idx !== allocIndex);
      copy[lineIndex] = lineCopy;
      return copy;
    });
  };

  const handleUpdateAllocation = (
    lineIndex: number,
    allocIndex: number,
    field: keyof TankAllocationInput,
    value: any
  ) => {
    setLines((prev) => {
      const copy = [...prev];
      const lineCopy = { ...copy[lineIndex] };
      const allocs = [...lineCopy.allocations];
      allocs[allocIndex] = { ...allocs[allocIndex], [field]: value };
      lineCopy.allocations = allocs;
      copy[lineIndex] = lineCopy;
      return copy;
    });
  };

  // Previews dip volume dynamically
  const handlePreviewDip = async (tankId: string, height: string, unit: string) => {
    if (!height || !activeOrgId || !activeOutletId) return;
    try {
      const res = await previewTankDipConversion(activeOrgId, activeOutletId, tankId, height, unit);
      alert(`Calibrated Volume: ${res.volume} L (${res.chart_name} - ${res.method})`);
    } catch (err: any) {
      alert(`Dip conversion error: ${err?.message || 'Outside calibration chart or no chart assigned.'}`);
    }
  };

  // Totals calculations
  const totals = useMemo(() => {
    let totalInv = 0;
    let totalAcc = 0;
    lines.forEach((l) => {
      totalInv += parseFloat(l.invoice_quantity) || 0;
      totalAcc += parseFloat(l.accepted_book_quantity) || 0;
    });
    return { totalInv, totalAcc };
  }, [lines]);

  // Form submission (Save)
  const handleSave = async () => {
    if (!activeOrgId || !activeOutletId) return;
    if (!receiptNumber.trim()) {
      setError('Receipt number is required.');
      return;
    }
    if (!supplierId) {
      setError('Supplier selection is required.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.');
      return;
    }
    if (!vehicleRegistration.trim()) {
      setError('Vehicle registration is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload: TankerReceiptInput = {
      receipt_number: receiptNumber.trim(),
      supplier_id: supplierId,
      invoice_number: invoiceNumber.trim(),
      invoice_date: invoiceDate,
      delivery_challan_number: deliveryChallanNumber.trim() || undefined,
      vehicle_registration: vehicleRegistration.trim(),
      driver_name: driverName.trim() || undefined,
      driver_phone: driverPhone.trim() || undefined,
      seal_details: sealDetails.trim() || undefined,
      unloading_start_time: unloadingStartTime ? new Date(unloadingStartTime).toISOString() : undefined,
      unloading_end_time: new Date(unloadingEndTime).toISOString(),
      notes: notes.trim() || undefined,
      product_lines: lines.map((l) => ({
        product_id: l.product_id,
        invoice_quantity: l.invoice_quantity,
        accepted_book_quantity: l.accepted_book_quantity,
        unit_rate: l.unit_rate ? l.unit_rate : undefined,
        invoice_density: l.invoice_density ? l.invoice_density : undefined,
        observed_density: l.observed_density ? l.observed_density : undefined,
        observed_temperature: l.observed_temperature ? l.observed_temperature : undefined,
        quantity_override_reason: l.quantity_override_reason || undefined,
        remarks: l.remarks || undefined,
        allocations: l.allocations.map((a) => ({
          tank_id: a.tank_id,
          allocated_book_quantity: a.allocated_book_quantity,
          pre_unloading_dip_height: a.pre_unloading_dip_height || undefined,
          pre_unloading_dip_unit: a.pre_unloading_dip_unit || 'millimetre',
          post_unloading_dip_height: a.post_unloading_dip_height || undefined,
          post_unloading_dip_unit: a.post_unloading_dip_unit || 'millimetre',
          notes: a.notes || undefined,
        })),
      })),
    };

    try {
      let saved: TankerReceiptDetail;
      if (isNew) {
        saved = await createTankerReceipt(activeOrgId, activeOutletId, payload);
        navigate(`/app/purchases/tanker-receipts/${saved.id}`, { replace: true });
      } else {
        saved = await updateTankerReceipt(activeOrgId, activeOutletId, receiptId!, payload);
      }
      setReceipt(saved);
      setSuccessMessage('Tanker receipt saved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save tanker receipt.');
    } finally {
      setSaving(false);
    }
  };

  // Confirm receipt
  const handleConfirm = async () => {
    if (!receipt || !activeOrgId || !activeOutletId) return;
    setConfirmLoading(true);
    setError(null);
    try {
      const confirmed = await confirmTankerReceipt(activeOrgId, activeOutletId, receipt.id);
      setReceipt(confirmed);
      setShowConfirmModal(false);
      setSuccessMessage('Tanker receipt confirmed and immutable stock movements posted.');
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm tanker receipt.');
    } finally {
      setConfirmLoading(false);
    }
  };

  // Void receipt
  const handleVoid = async () => {
    if (!receipt || !activeOrgId || !activeOutletId) return;
    if (!voidReason.trim()) {
      setError('Please provide a mandatory reason for voiding this receipt.');
      return;
    }
    setVoidLoading(true);
    setError(null);
    try {
      const voided = await voidTankerReceipt(activeOrgId, activeOutletId, receipt.id, voidReason.trim());
      setReceipt(voided);
      setShowVoidModal(false);
      setSuccessMessage('Tanker receipt voided and stock movements reversed.');
    } catch (err: any) {
      setError(err?.message || 'Failed to void tanker receipt.');
    } finally {
      setVoidLoading(false);
    }
  };

  // Variance acknowledgement
  const handleAcknowledgeVariance = async () => {
    if (!ackAllocId || !ackReason.trim() || !activeOrgId || !activeOutletId) return;
    setAckLoading(true);
    try {
      await acknowledgeReceiptVariance(activeOrgId, activeOutletId, ackAllocId, ackReason.trim());
      // Refresh detail
      const refreshed = await fetchTankerReceiptDetail(activeOrgId, activeOutletId, receipt!.id);
      setReceipt(refreshed);
      setAckAllocId(null);
      setAckReason('');
    } catch (err: any) {
      alert(`Failed to acknowledge variance: ${err?.message || 'Error occurred'}`);
    } finally {
      setAckLoading(false);
    }
  };

  // Attachment upload
  const handleAttachmentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !receipt || !activeOrgId || !activeOutletId) return;
    setUploadLoading(true);
    try {
      await uploadTankerReceiptAttachment(activeOrgId, activeOutletId, receipt.id, selectedFile, uploadType);
      const refreshed = await fetchTankerReceiptDetail(activeOrgId, activeOutletId, receipt.id);
      setReceipt(refreshed);
      setSelectedFile(null);
    } catch (err: any) {
      alert(`Upload failed: ${err?.message || 'Error'}`);
    } finally {
      setUploadLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" style={{ margin: '0 auto var(--space-sm)' }} />
        Loading tanker receipt workspace...
      </div>
    );
  }

  return (
    <div className="workspace-container" style={{ padding: 'var(--space-lg)', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Breadcrumb & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <button
            onClick={() => navigate('/app/purchases/tanker-receipts')}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ArrowLeft size={14} /> Back to Receipts
          </button>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontWeight: 600, fontSize: '1.125rem' }}>
            {isNew ? 'New Tanker Receipt' : receiptNumber}
          </span>
          {receipt && (
            <span
              className={`badge badge-${
                receipt.status === 'confirmed' ? 'success' : receipt.status === 'voided' ? 'danger' : 'pending'
              }`}
              style={{ textTransform: 'capitalize' }}
            >
              {receipt.status}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save'}
              </button>
              {!isNew && (
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={saving || lines.length === 0}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
                >
                  <CheckCircle2 size={16} /> Confirm Receipt
                </button>
              )}
            </>
          )}

          {isConfirmed && (
            <button
              type="button"
              onClick={() => setShowVoidModal(true)}
              className="btn btn-outline-danger"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
            >
              <XCircle size={16} /> Void Receipt
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)' }}>
          <AlertCircle size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)' }}>
          <Check size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          {successMessage}
        </div>
      )}

      {/* Grid Layout: Main Document (Left/Center) + Summary/Attachments (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 'var(--space-lg)' }}>
        {/* Left Column: Form Details, Products & Allocations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Section 1: Receipt Header Details */}
          <div className="card" style={{ padding: 'var(--space-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Truck size={18} color="var(--color-accent)" /> Document & Vehicle Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
              <div>
                <label className="label">Internal Receipt # *</label>
                <input
                  type="text"
                  className="input"
                  value={receiptNumber}
                  disabled={isReadOnly}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Supplier / Oil Co *</label>
                <select
                  className="input"
                  value={supplierId}
                  disabled={isReadOnly}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Select Supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Invoice Number *</label>
                <input
                  type="text"
                  className="input"
                  value={invoiceNumber}
                  disabled={isReadOnly}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Invoice Date *</label>
                <input
                  type="date"
                  className="input"
                  value={invoiceDate}
                  disabled={isReadOnly}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Delivery Challan #</label>
                <input
                  type="text"
                  className="input"
                  value={deliveryChallanNumber}
                  disabled={isReadOnly}
                  onChange={(e) => setDeliveryChallanNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Vehicle Registration *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. KSA-1234"
                  value={vehicleRegistration}
                  disabled={isReadOnly}
                  onChange={(e) => setVehicleRegistration(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Driver Name</label>
                <input
                  type="text"
                  className="input"
                  value={driverName}
                  disabled={isReadOnly}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Driver Phone</label>
                <input
                  type="text"
                  className="input"
                  value={driverPhone}
                  disabled={isReadOnly}
                  onChange={(e) => setDriverPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Seal / Reference Details</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Seal numbers or remarks"
                  value={sealDetails}
                  disabled={isReadOnly}
                  onChange={(e) => setSealDetails(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Unloading Start Time</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={unloadingStartTime}
                  disabled={isReadOnly}
                  onChange={(e) => setUnloadingStartTime(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Completion / Effective At *</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={unloadingEndTime}
                  disabled={isReadOnly}
                  onChange={(e) => setUnloadingEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 2 & 3: Fuel Product Lines & Destination Tank Allocations */}
          <div className="card" style={{ padding: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={18} color="var(--color-accent)" /> Product Lines & Tank Allocations
              </h3>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={14} /> Add Product Line
                </button>
              )}
            </div>

            {lines.length === 0 ? (
              <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                No product lines added yet. Click "Add Product Line" to decant incoming fuel.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {lines.map((line, lIdx) => {
                  const lineProduct = products.find((p) => p.id === line.product_id);
                  const compatibleTanks = tanks.filter((t) => t.product_id === line.product_id);
                  const totalAllocated = line.allocations.reduce(
                    (acc, a) => acc + (parseFloat(a.allocated_book_quantity) || 0),
                    0
                  );
                  const acceptedQty = parseFloat(line.accepted_book_quantity) || 0;
                  const invoiceQty = parseFloat(line.invoice_quantity) || 0;
                  const isAllocationMatched = Math.abs(totalAllocated - acceptedQty) < 0.001;
                  const isOverride = Math.abs(invoiceQty - acceptedQty) > 0.001;

                  return (
                    <div
                      key={lIdx}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-md)',
                        backgroundColor: '#fafafa'
                      }}
                    >
                      {/* Product Line Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                          Line #{lIdx + 1}: {lineProduct?.name || 'Fuel Product'}
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(lIdx)}
                            className="btn-icon"
                            style={{ color: 'var(--color-danger-text)', border: 'none', background: 'none', cursor: 'pointer' }}
                            title="Remove Product Line"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      {/* Line Inputs */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                        <div>
                          <label className="label">Product *</label>
                          <select
                            className="input"
                            value={line.product_id}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'product_id', e.target.value)}
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="label">Invoice Qty (L) *</label>
                          <input
                            type="number"
                            step="0.0001"
                            className="input"
                            value={line.invoice_quantity}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'invoice_quantity', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="label">Accepted Book Qty (L) *</label>
                          <input
                            type="number"
                            step="0.0001"
                            className="input"
                            value={line.accepted_book_quantity}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'accepted_book_quantity', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="label">Unit Rate</label>
                          <input
                            type="number"
                            step="0.0001"
                            className="input"
                            placeholder="Optional"
                            value={line.unit_rate || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'unit_rate', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="label">Observed Density</label>
                          <input
                            type="number"
                            step="0.0001"
                            className="input"
                            placeholder="kg/m³"
                            value={line.observed_density || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'observed_density', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="label">Observed Temp (°C)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="input"
                            placeholder="°C"
                            value={line.observed_temperature || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'observed_temperature', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Override Warning & Reason */}
                      {isOverride && (
                        <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)', backgroundColor: 'var(--color-warning-bg)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-warning-text)', marginBottom: '4px' }}>
                            <AlertCircle size={14} /> Accepted Quantity differs from Invoice Quantity (Override Permission Required)
                          </div>
                          <input
                            type="text"
                            className="input"
                            placeholder="Mandatory reason for overriding accepted book delivery quantity..."
                            value={line.quantity_override_reason || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateLine(lIdx, 'quantity_override_reason', e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </div>
                      )}

                      {/* Allocations Section */}
                      <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                            Destination Tank Allocations
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '0.75rem',
                                color: isAllocationMatched ? 'var(--color-success-text)' : 'var(--color-danger-text)',
                                fontWeight: 500,
                              }}
                            >
                              ({totalAllocated} / {acceptedQty} L allocated — {isAllocationMatched ? 'Matched' : `${Math.abs(acceptedQty - totalAllocated)} L remaining`})
                            </span>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleAddAllocation(lIdx)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem' }}
                            >
                              <Plus size={12} /> Add Tank Allocation
                            </button>
                          )}
                        </div>

                        {line.allocations.length === 0 ? (
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 'var(--space-xs) 0' }}>
                            No destination tanks allocated. Click "Add Tank Allocation" to specify where fuel is unloaded.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
                            {line.allocations.map((alloc, aIdx) => {
                              return (
                                <div
                                  key={aIdx}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(140px, 1fr) minmax(110px, 1fr) minmax(130px, 1.2fr) minmax(130px, 1.2fr) auto',
                                    gap: 'var(--space-xs)',
                                    alignItems: 'flex-end',
                                    padding: 'var(--space-xs)',
                                    background: '#f8fafc',
                                    borderRadius: 'var(--radius-sm)'
                                  }}
                                >
                                  <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tank *</label>
                                    <select
                                      className="input"
                                      value={alloc.tank_id}
                                      disabled={isReadOnly}
                                      onChange={(e) => handleUpdateAllocation(lIdx, aIdx, 'tank_id', e.target.value)}
                                    >
                                      {compatibleTanks.map((t) => (
                                        <option key={t.id} value={t.id}>{t.code} ({t.name})</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Book Qty (L) *</label>
                                    <input
                                      type="number"
                                      step="0.0001"
                                      className="input"
                                      value={alloc.allocated_book_quantity}
                                      disabled={isReadOnly}
                                      onChange={(e) => handleUpdateAllocation(lIdx, aIdx, 'allocated_book_quantity', e.target.value)}
                                    />
                                  </div>

                                  <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Pre-Dip (mm)</label>
                                    <div style={{ display: 'flex', gap: '2px' }}>
                                      <input
                                        type="number"
                                        step="0.1"
                                        className="input"
                                        placeholder="Height"
                                        value={alloc.pre_unloading_dip_height || ''}
                                        disabled={isReadOnly}
                                        onChange={(e) => handleUpdateAllocation(lIdx, aIdx, 'pre_unloading_dip_height', e.target.value)}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handlePreviewDip(alloc.tank_id, alloc.pre_unloading_dip_height || '', alloc.pre_unloading_dip_unit || 'millimetre')}
                                        className="btn btn-secondary btn-sm"
                                        title="Preview Dip Volume"
                                      >
                                        Dip
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Post-Dip (mm)</label>
                                    <div style={{ display: 'flex', gap: '2px' }}>
                                      <input
                                        type="number"
                                        step="0.1"
                                        className="input"
                                        placeholder="Height"
                                        value={alloc.post_unloading_dip_height || ''}
                                        disabled={isReadOnly}
                                        onChange={(e) => handleUpdateAllocation(lIdx, aIdx, 'post_unloading_dip_height', e.target.value)}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handlePreviewDip(alloc.tank_id, alloc.post_unloading_dip_height || '', alloc.post_unloading_dip_unit || 'millimetre')}
                                        className="btn btn-secondary btn-sm"
                                        title="Preview Dip Volume"
                                      >
                                        Dip
                                      </button>
                                    </div>
                                  </div>

                                  {!isReadOnly && (
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveAllocation(lIdx, aIdx)}
                                        className="btn-icon"
                                        style={{ color: 'var(--color-danger-text)', border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Notes */}
          <div className="card" style={{ padding: 'var(--space-md)' }}>
            <label className="label">Operational Notes & Remarks</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Additional delivery notes, seal observations, or dispatch discrepancies..."
              value={notes}
              disabled={isReadOnly}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Right Column: Summary Card, Existing Allocations Variance & Attachments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Summary Card */}
          <div className="card" style={{ padding: 'var(--space-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Quantity & Value Summary</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Invoice Volume:</span>
                <span style={{ fontWeight: 600 }}>{totals.totalInv.toLocaleString()} L</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Accepted Book Volume:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{totals.totalAcc.toLocaleString()} L</span>
              </div>

              {receipt && receipt.total_physical_dip_gain && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Calibrated Dip Gain:</span>
                  <span style={{ fontWeight: 600 }}>{parseFloat(receipt.total_physical_dip_gain).toLocaleString()} L</span>
                </div>
              )}

              {receipt && receipt.total_variance && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', paddingTop: 'var(--space-xs)', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Receipt Variance:</span>
                  <span style={{ fontWeight: 700, color: parseFloat(receipt.total_variance) < 0 ? 'var(--color-danger-text)' : 'var(--color-warning-text)' }}>
                    {parseFloat(receipt.total_variance) > 0 ? '+' : ''}{parseFloat(receipt.total_variance).toLocaleString()} L
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Calibrated Tank Allocations Review (if saved receipt exists) */}
          {receipt && receipt.product_lines.length > 0 && (
            <div className="card" style={{ padding: 'var(--space-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Variance Accountability</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {receipt.product_lines.flatMap((pl) =>
                  pl.allocations.map((alloc) => (
                    <div
                      key={alloc.id}
                      style={{
                        padding: 'var(--space-xs)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8125rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>Tank {alloc.tank_code}</span>
                        <span>{parseFloat(alloc.allocated_book_quantity).toLocaleString()} L</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Gain: {alloc.physical_dip_gain ? `${parseFloat(alloc.physical_dip_gain).toLocaleString()} L` : 'No Dips'} |
                        Variance: <span style={{ fontWeight: 600, color: (parseFloat(alloc.variance || '0') < 0) ? 'red' : 'orange' }}>
                          {alloc.variance ? `${parseFloat(alloc.variance).toLocaleString()} L` : '—'}
                        </span>
                      </div>

                      {alloc.variance && Math.abs(parseFloat(alloc.variance)) > 0.001 && (
                        <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            className={`badge badge-${alloc.variance_status === 'acknowledged' ? 'success' : 'warning'}`}
                            style={{ fontSize: '0.7rem' }}
                          >
                            {alloc.variance_status.toUpperCase()}
                          </span>
                          {alloc.variance_status !== 'acknowledged' && isConfirmed && (
                            <button
                              type="button"
                              onClick={() => {
                                setAckAllocId(alloc.id);
                                setAckReason('');
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Attachments Section */}
          <div className="card" style={{ padding: 'var(--space-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={18} color="var(--color-accent)" /> Protected Attachments
            </h3>

            {receipt && !isVoided && (
              <form onSubmit={handleAttachmentUpload} style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  <select
                    className="input"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    style={{ fontSize: '0.8125rem' }}
                  >
                    <option value="invoice">Invoice Document</option>
                    <option value="challan">Delivery Challan</option>
                    <option value="dip_sheet">Dip / Calibration Sheet</option>
                    <option value="receipt_image">Tanker / Meter Photo</option>
                    <option value="other">Other Attachment</option>
                  </select>
                  <input
                    type="file"
                    className="input"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{ fontSize: '0.8125rem' }}
                  />
                  <button
                    type="submit"
                    disabled={!selectedFile || uploadLoading}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <Upload size={14} /> {uploadLoading ? 'Uploading...' : 'Upload Attachment'}
                  </button>
                </div>
              </form>
            )}

            {receipt?.attachments && receipt.attachments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {receipt.attachments.map((att) => (
                  <div
                    key={att.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 'var(--space-xs)',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8125rem'
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                      <div style={{ fontWeight: 500 }}>{att.file_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {att.attachment_type.replace('_', ' ')} ({(att.file_size / 1024).toFixed(0)} KB)
                      </div>
                    </div>
                    <a
                      href={getTankerReceiptAttachmentDownloadUrl(activeOrgId!, activeOutletId!, receipt.id, att.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px' }}
                    >
                      <Download size={14} />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No attachments uploaded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Warning Modal */}
      {showConfirmModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--color-warning-text)', marginBottom: 'var(--space-sm)' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Confirm Tanker Receipt</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
              Confirming receipt <strong>{receiptNumber}</strong> will atomically post <strong>immutable stock movements</strong> into the tank stock ledger.
              <br /><br />
              Once confirmed, this operational document <strong>cannot be edited or deleted</strong>. Corrections can only be made by authorized voiding with an audit reason.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={confirmLoading}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={confirmLoading}
                onClick={handleConfirm}
              >
                {confirmLoading ? 'Confirming...' : 'Yes, Confirm and Post Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {showVoidModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--color-danger-text)', marginBottom: 'var(--space-sm)' }}>
              <XCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Void Confirmed Receipt</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
              Voiding will create permanent reversal movements in the tank stock ledger.
            </p>

            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
                Mandatory Void Reason <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="Reason for voiding..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={voidLoading}
                onClick={() => setShowVoidModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={voidLoading || !voidReason.trim()}
                onClick={handleVoid}
              >
                {voidLoading ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledge Variance Modal */}
      {ackAllocId && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', padding: 'var(--space-lg)' }}>
            <h3 style={{ margin: '0 0 var(--space-sm) 0', fontSize: '1.125rem' }}>Acknowledge Stock Variance</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
              Acknowledging indicates that management has inspected the decanting variance. This does not alter the calculated quantity.
            </p>
            <textarea
              className="input"
              rows={3}
              placeholder="Provide justification or reason (e.g. transit evaporation, temperature difference)..."
              value={ackReason}
              onChange={(e) => setAckReason(e.target.value)}
              style={{ width: '100%', marginBottom: 'var(--space-md)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={ackLoading}
                onClick={() => setAckAllocId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={ackLoading || !ackReason.trim()}
                onClick={handleAcknowledgeVariance}
              >
                {ackLoading ? 'Acknowledging...' : 'Acknowledge Variance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
