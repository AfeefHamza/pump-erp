import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchCurrentProductPrices,
  setProductPrices,
  fetchProductPriceHistory,
  type CurrentPriceItem,
  type ProductPrice,
  ApiError
} from '@/api/client';
import { RefreshCw, History, DollarSign, Calendar, TrendingUp, TrendingDown, ClipboardCopy, X } from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const ProductPrices: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // States
  const [currentPrices, setCurrentPrices] = useState<CurrentPriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Drawers
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<CurrentPriceItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<ProductPrice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form States
  const [bulkEffectiveFrom, setBulkEffectiveFrom] = useState('');
  const [bulkRates, setBulkRates] = useState<Record<string, string>>({}); // product_id -> rate string
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [bulkGeneralError, setBulkGeneralError] = useState<string | null>(null);

  // Permissions
  const canView = usePermission('product_price.view');
  const canUpdate = usePermission('product_price.update');

  // Load Current Prices
  const loadCurrentPrices = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    try {
      const data = await fetchCurrentProductPrices(selectedOrgId, selectedOutletId);
      setCurrentPrices(data);
    } catch (err) {
      console.error('Failed to load current prices:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadCurrentPrices();
  }, [loadCurrentPrices]);

  // Currency formatter
  const formatIndianCurrency = (value: number | string | null) => {
    if (value === null || value === undefined) return '—';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(num);
  };

  // Date formatter
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate Delta
  const renderPriceVariation = (curr: string | null, prev: string | null) => {
    if (!curr || !prev) return <span className="text-muted" style={{ fontSize: '0.85rem' }}>—</span>;
    const c = parseFloat(curr);
    const p = parseFloat(prev);
    const diff = c - p;
    
    if (diff > 0) {
      return (
        <span style={{ color: 'var(--color-danger-text)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600, fontSize: '0.85rem' }}>
          <TrendingUp size={14} />
          <span>+{diff.toFixed(2)}</span>
        </span>
      );
    } else if (diff < 0) {
      return (
        <span style={{ color: 'var(--color-success-text)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600, fontSize: '0.85rem' }}>
          <TrendingDown size={14} />
          <span>{diff.toFixed(2)}</span>
        </span>
      );
    }
    return <span className="text-muted" style={{ fontSize: '0.85rem' }}>No change</span>;
  };

  // Open Bulk Rate Entry Drawer
  const handleOpenBulk = () => {
    setBulkGeneralError(null);
    setBulkErrors({});
    
    // Set default effective date-time to current local ISO format (YYYY-MM-DDTHH:MM)
    const localNow = new Date();
    localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
    setBulkEffectiveFrom(localNow.toISOString().slice(0, 16));

    // Initialize rates
    const initialRates: Record<string, string> = {};
    currentPrices.forEach((p) => {
      initialRates[p.product_id] = '';
    });
    setBulkRates(initialRates);
    setIsBulkOpen(true);
  };

  // Convenience: Copy Current Rates
  const handleCopyCurrentRates = () => {
    const copied: Record<string, string> = {};
    currentPrices.forEach((p) => {
      copied[p.product_id] = p.selling_price || '';
    });
    setBulkRates(copied);
  };

  const handleRateChange = (productId: string, value: string) => {
    setBulkRates((prev) => ({ ...prev, [productId]: value }));
    if (bulkErrors[productId]) {
      setBulkErrors((prev) => {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      });
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;
    setActionLoading(true);
    setBulkGeneralError(null);
    setBulkErrors({});

    // Filter rates where a rate was entered
    const pricePayload = Object.keys(bulkRates)
      .filter((pid) => bulkRates[pid].trim() !== '')
      .map((pid) => ({
        product_id: pid,
        selling_price: parseFloat(bulkRates[pid]),
      }));

    if (pricePayload.length === 0) {
      setBulkGeneralError('Please enter a new price for at least one product.');
      setActionLoading(false);
      return;
    }

    const payload = {
      effective_from: bulkEffectiveFrom ? new Date(bulkEffectiveFrom).toISOString() : null,
      prices: pricePayload,
    };

    try {
      await setProductPrices(selectedOrgId, selectedOutletId, payload);
      setIsBulkOpen(false);
      loadCurrentPrices();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 400 && typeof err.data === 'object' && err.data !== null) {
          const errors = err.data as Record<string, string[] | string>;
          // check if they are field/item errors
          const formatted: Record<string, string> = {};
          Object.keys(errors).forEach((key) => {
            const val = errors[key];
            formatted[key] = Array.isArray(val) ? val[0] : String(val);
          });
          setBulkErrors(formatted);
        } else {
          setBulkGeneralError(err.message);
        }
      } else {
        setBulkGeneralError('An unexpected error occurred.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Open History Drawer
  const handleOpenHistory = async (productItem: CurrentPriceItem) => {
    setHistoryProduct(productItem);
    setPriceHistory([]);
    setHistoryLoading(true);
    setIsHistoryOpen(true);
    
    if (!selectedOrgId || !selectedOutletId) return;

    try {
      const data = await fetchProductPriceHistory(selectedOrgId, selectedOutletId, productItem.product_id);
      setPriceHistory(data);
    } catch (err) {
      console.error('Failed to load price history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const isFutureDated = (effectiveFromStr: string) => {
    return new Date(effectiveFromStr) > new Date();
  };

  if (!selectedOutletId) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <DollarSign size={48} style={{ color: 'var(--color-accent)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Select an Outlet</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Please select an outlet from the sidebar selector to manage fuel pricing.</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <DollarSign size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view fuel product pricing.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ minHeight: 'calc(100vh - var(--topbar-height) - var(--space-xl))' }}>
      <PageHeader
        title="Product Pricing"
        subtitle="Set and monitor fuel product selling rates and pricing history logs"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={canUpdate && (
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={handleOpenBulk}
          >
            <ClipboardCopy size={18} />
            <span>Set New Prices</span>
          </button>
        )}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading fuel prices...</p>
        </div>
      ) : (
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current Selling Rate</th>
                  <th>Effective Date & Time</th>
                  <th>Previous Selling Rate</th>
                  <th>Rate Variation</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentPrices.map((cp) => (
                  <tr key={cp.product_id}>
                    <td style={{ fontWeight: 600 }}>
                      <span>{cp.product_name}</span>
                      <code style={{ fontSize: '0.8rem', color: 'var(--color-accent)', marginLeft: '0.5rem' }}>{cp.product_code}</code>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1.05rem' }}>
                      {formatIndianCurrency(cp.selling_price)}
                    </td>
                    <td>{formatDateTime(cp.effective_from)}</td>
                    <td>{formatIndianCurrency(cp.previous_price)}</td>
                    <td>{renderPriceVariation(cp.selling_price, cp.previous_price)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        onClick={() => handleOpenHistory(cp)}
                        title="View Price History Log"
                      >
                        <History size={14} />
                        <span>History Log</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {currentPrices.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No fuel products available in the organisation to price.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Rate Entry Drawer */}
      {isBulkOpen && (
        <div className="slider-overlay" onClick={() => setIsBulkOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign size={20} style={{ color: 'var(--color-accent)' }} />
                <span>Bulk Price Update</span>
              </h3>
              <button className="btn-close" onClick={() => setIsBulkOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {bulkGeneralError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {bulkGeneralError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Effective Date & Time *</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>Timezone: Asia/Kolkata</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
                  <input
                    type="datetime-local"
                    className="form-control"
                    style={{ paddingLeft: '2.5rem' }}
                    value={bulkEffectiveFrom}
                    onChange={(e) => setBulkEffectiveFrom(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h4 className="h5" style={{ margin: 0 }}>Product Rates</h4>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  onClick={handleCopyCurrentRates}
                >
                  <ClipboardCopy size={12} />
                  <span>Copy Current Rates</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {currentPrices.map((p) => (
                  <div key={p.product_id} className="form-group" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        Current: {formatIndianCurrency(p.selling_price)}
                      </div>
                    </div>
                    <div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', opacity: 0.6 }}>₹</span>
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="0.00"
                          className={`form-control ${bulkErrors[p.product_id] ? 'error' : ''}`}
                          style={{ paddingLeft: '1.75rem' }}
                          value={bulkRates[p.product_id] || ''}
                          onChange={(e) => handleRateChange(p.product_id, e.target.value)}
                        />
                      </div>
                      {bulkErrors[p.product_id] && (
                        <span className="text-danger" style={{ fontSize: '0.7rem', marginTop: '0.15rem', display: 'block' }}>
                          {bulkErrors[p.product_id]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsBulkOpen(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Apply New Price Set'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pricing History Drawer */}
      {isHistoryOpen && (
        <div className="slider-overlay" onClick={() => setIsHistoryOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '600px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <History size={20} style={{ color: 'var(--color-accent)' }} />
                  <span>Price History Log</span>
                </h3>
                <p className="text-muted" style={{ margin: '0.15rem 0 0 0', fontSize: '0.85rem' }}>
                  {historyProduct?.product_name} ({historyProduct?.product_code})
                </p>
              </div>
              <button className="btn-close" onClick={() => setIsHistoryOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div className="slider-body" style={{ padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 75px)' }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
                  <p className="text-muted">Loading pricing logs...</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                      <tr>
                        <th>Selling Rate</th>
                        <th>Effective From</th>
                        <th>Effective To</th>
                        <th>Set By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((ph) => {
                        const isFuture = isFutureDated(ph.effective_from);
                        return (
                          <tr key={ph.id} style={{ backgroundColor: isFuture ? 'rgba(var(--color-primary-rgb), 0.05)' : undefined }}>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>{formatIndianCurrency(ph.selling_price)}</span>
                                {isFuture && (
                                  <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem' }}>
                                    Future Price
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>{formatDateTime(ph.effective_from)}</td>
                            <td>{formatDateTime(ph.effective_to)}</td>
                            <td>{ph.created_by_name || 'System'}</td>
                          </tr>
                        );
                      })}
                      {priceHistory.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '3rem' }}>
                            <p className="text-muted">No pricing history found for this product.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
