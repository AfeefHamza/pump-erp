// frontend/src/features/purchases/components/TransactionStickyFooter.tsx
import React, { useEffect } from 'react';
import { Save, PlusCircle, HelpCircle, RefreshCw } from 'lucide-react';

export interface TransactionStickyFooterProps {
  onSave: () => void;
  onSaveAndNew: () => void;
  onCancel: () => void;
  onOpenHelp: () => void;
  saving: boolean;
  isVoided: boolean;
  isNew: boolean;
}

export const TransactionStickyFooter: React.FC<TransactionStickyFooterProps> = ({
  onSave,
  onSaveAndNew,
  onCancel,
  onOpenHelp,
  saving,
  isVoided,
  isNew
}) => {
  // Global keyboard shortcuts: Ctrl+S, Ctrl+Shift+S, Ctrl+/
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + S or Cmd + S
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        if (isVoided || saving) return;

        if (e.shiftKey) {
          onSaveAndNew();
        } else {
          onSave();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key === '?' || e.code === 'Slash')) {
        e.preventDefault();
        e.stopPropagation();
        onOpenHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave, onSaveAndNew, onOpenHelp, saving, isVoided]);

  return (
    <footer
      style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: '#ffffff',
        borderTop: '1px solid var(--border-color)',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)',
        padding: '10px var(--space-lg)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: '0 calc(-1 * var(--space-lg)) -20px calc(-1 * var(--space-lg))'
      }}
      role="toolbar"
      aria-label="Transaction Actions Toolbar"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <button
          type="button"
          onClick={onOpenHelp}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          title="View keyboard shortcuts (Ctrl+/)"
        >
          <HelpCircle size={14} color="var(--color-accent)" />
          <span>Shortcuts (Ctrl+/)</span>
        </button>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <kbd style={{ padding: '1px 4px', border: '1px solid var(--border-color)', borderRadius: '3px', background: 'var(--bg-main)' }}>Ctrl+S</kbd> Save &bull;{' '}
          <kbd style={{ padding: '1px 4px', border: '1px solid var(--border-color)', borderRadius: '3px', background: 'var(--bg-main)' }}>Alt+T</kbd> Link Receipt &bull;{' '}
          <kbd style={{ padding: '1px 4px', border: '1px solid var(--border-color)', borderRadius: '3px', background: 'var(--bg-main)' }}>Alt+R</kbd> Add Row
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>

        {!isVoided && isNew && (
          <button
            type="button"
            onClick={onSaveAndNew}
            disabled={saving}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            title="Save & record, then open a fresh new bill (Ctrl+Shift+S)"
          >
            {saving ? <RefreshCw size={13} className="spin" /> : <PlusCircle size={13} />}
            <span>Save &amp; New (Ctrl+Shift+S)</span>
          </button>
        )}

        {!isVoided && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Save and record purchase bill (Ctrl+S)"
          >
            {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
            <span>Save &amp; Record (Ctrl+S)</span>
          </button>
        )}
      </div>
    </footer>
  );
};
