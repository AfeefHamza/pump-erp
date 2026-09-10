// frontend/src/features/purchases/components/KeyboardShortcutsModal.tsx
import React, { useEffect } from 'react';
import { XCircle, Keyboard } from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
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

  const shortcuts = [
    { key: 'Ctrl + S', description: 'Save & Record the current purchase bill' },
    { key: 'Ctrl + Shift + S', description: 'Save & open a fresh purchase bill form' },
    { key: 'Alt + T', description: 'Open Tanker Receipt selector modal' },
    { key: 'Alt + R', description: 'Add a new product line row to the grid' },
    { key: 'Alt + A', description: 'Toggle Add Adjustment dropdown menu' },
    { key: 'Alt + Delete', description: 'Delete currently focused product line row' },
    { key: 'Enter', description: 'Inside grid: advance to next cell; in final cell: create row' },
    { key: 'Tab / Shift + Tab', description: 'Navigate forward / backward through editable fields' },
    { key: 'Arrow Up / Down', description: 'Navigate items in searchable comboboxes' },
    { key: 'Escape', description: 'Close active combobox dropdown or modal dialog' },
    { key: 'Ctrl + /', description: 'Toggle this keyboard shortcuts reference dialog' }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 'var(--space-md)'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
    >
      <div
        className="card"
        style={{
          maxWidth: '550px',
          width: '100%',
          padding: 'var(--space-lg)',
          margin: 0
        }}
      >
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={20} color="var(--color-accent)" />
            <h3 id="shortcuts-dialog-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
              Keyboard Shortcuts
            </h3>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {shortcuts.map((sc, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 8px',
                background: idx % 2 === 0 ? 'var(--bg-main)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem'
              }}
            >
              <span style={{ color: 'var(--text-main)' }}>{sc.description}</span>
              <kbd
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                  padding: '2px 6px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-accent)'
                }}
              >
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
