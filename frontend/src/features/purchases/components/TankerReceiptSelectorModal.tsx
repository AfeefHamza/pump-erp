// frontend/src/features/purchases/components/TankerReceiptSelectorModal.tsx
import React, { useState, useEffect } from 'react';
import type { AvailableTankerReceipt, AvailableTankerReceiptLine } from '@/features/purchases/types';
import { XCircle, Search, Link as LinkIcon, CheckCircle2, RefreshCw } from 'lucide-react';

export interface TankerReceiptSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipts: AvailableTankerReceipt[];
  loading: boolean;
  onImportLines: (selected: Array<{ receipt: AvailableTankerReceipt; line: AvailableTankerReceiptLine }>) => void;
  alreadyLinkedLineIds: string[];
}

export const TankerReceiptSelectorModal: React.FC<TankerReceiptSelectorModalProps> = ({
  isOpen,
  onClose,
  receipts,
  loading,
  onImportLines,
  alreadyLinkedLineIds
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLines, setSelectedLines] = useState<Record<string, { receipt: AvailableTankerReceipt; line: AvailableTankerReceiptLine }>>({});

  useEffect(() => {
    if (isOpen) {
      setSelectedLines({});
      setSearchQuery('');
    }
  }, [isOpen]);

  // Keyboard shortcut: Escape to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredReceipts = receipts.filter((rcpt) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesReceipt =
      rcpt.receipt_number.toLowerCase().includes(q) ||
      rcpt.vehicle_registration.toLowerCase().includes(q) ||
      rcpt.invoice_number.toLowerCase().includes(q);
    const matchesLine = rcpt.available_lines.some(
      (l) => l.product_name.toLowerCase().includes(q) || l.product_code.toLowerCase().includes(q)
    );
    return matchesReceipt || matchesLine;
  });

  const handleToggleLine = (receipt: AvailableTankerReceipt, line: AvailableTankerReceiptLine) => {
    if (alreadyLinkedLineIds.includes(line.id)) return;
    setSelectedLines((prev) => {
      const copy = { ...prev };
      if (copy[line.id]) {
        delete copy[line.id];
      } else {
        copy[line.id] = { receipt, line };
      }
      return copy;
    });
  };

  const handleConfirmImport = () => {
    const list = Object.values(selectedLines);
    if (list.length > 0) {
      onImportLines(list);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-md)'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-selector-title"
    >
      <div
        className="card"
        style={{
          maxWidth: '750px',
          width: '100%',
          padding: 'var(--space-lg)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 0
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: 'var(--space-sm)'
          }}
        >
          <div>
            <h3 id="receipt-selector-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
              Link Confirmed Tanker Receipts
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Select available tanker receipt fuel drops to import into this purchase bill. (Alt+T)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close dialog"
          >
            <XCircle size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: 'var(--space-md)' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            className="input"
            placeholder="Search by receipt #, vehicle, or product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '32px', width: '100%' }}
            autoFocus
          />
        </div>

        {/* List Content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', paddingRight: '4px' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto var(--space-sm)' }} />
              Loading available tanker receipts...
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={36} color="var(--color-success-text)" style={{ margin: '0 auto var(--space-sm)' }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No unbilled tanker receipts found for this supplier.</p>
            </div>
          ) : (
            filteredReceipts.map((rcpt) => (
              <div
                key={rcpt.id}
                style={{
                  padding: 'var(--space-md)',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginBottom: '6px'
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-accent)' }}>{rcpt.receipt_number}</span> •{' '}
                    <span>{rcpt.vehicle_registration}</span> •{' '}
                    <span style={{ color: 'var(--text-muted)' }}>{rcpt.invoice_date}</span>
                  </div>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    Ref Inv: {rcpt.invoice_number}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '6px'
                  }}
                >
                  {(rcpt.available_lines || (rcpt as any).lines || []).map((line: any) => {
                    const isAlreadyLinked = alreadyLinkedLineIds.includes(line.id) || !!line.already_linked;
                    const isChecked = !!selectedLines[line.id] || isAlreadyLinked;
                    return (
                      <label
                        key={line.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          background: isAlreadyLinked
                            ? 'var(--bg-main)'
                            : isChecked
                            ? 'var(--color-accent-light)'
                            : '#ffffff',
                          border: `1px solid ${
                            isAlreadyLinked
                              ? 'var(--border-color)'
                              : isChecked
                              ? 'var(--color-accent)'
                              : 'var(--border-color)'
                          }`,
                          borderRadius: 'var(--radius-sm)',
                          cursor: isAlreadyLinked ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          opacity: isAlreadyLinked ? 0.7 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isAlreadyLinked}
                            onChange={() => handleToggleLine(rcpt, line)}
                            style={{ width: '16px', height: '16px', cursor: isAlreadyLinked ? 'not-allowed' : 'pointer' }}
                          />
                          <span style={{ fontWeight: 600 }}>{line.product_name}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.725rem' }}>
                            ({line.product_code})
                          </span>
                          {isAlreadyLinked && (
                            <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>
                              Already Linked
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'monospace' }}>
                          <span>
                            {line.accepted_book_quantity || line.invoice_quantity} {line.unit}
                          </span>
                          {line.unit_rate && (
                            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                              @ Rs. {line.unit_rate}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'var(--space-md)',
            paddingTop: 'var(--space-sm)',
            borderTop: '1px solid var(--border-color)'
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {Object.keys(selectedLines).length} line(s) selected
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={Object.keys(selectedLines).length === 0}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <LinkIcon size={14} />
              Link {Object.keys(selectedLines).length} Lines
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
