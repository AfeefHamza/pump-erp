// frontend/src/components/forms/SearchableCombobox.tsx
import React, { useState, useEffect, useLayoutEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, X } from 'lucide-react';

export interface ComboboxOption {
  id: string;
  label: string;
  subLabel?: string;
  tags?: string[];
}

export interface SearchableComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onAddNew?: (searchQuery: string) => void;
  addNewLabel?: string;
  ariaLabel?: string;
  error?: string;
  style?: React.CSSProperties;
  className?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectAdvance?: () => void;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select or search...',
  disabled = false,
  autoFocus = false,
  onAddNew,
  addNewLabel = 'Create new',
  ariaLabel,
  error,
  style,
  className = '',
  tabIndex = 0,
  onKeyDown: customKeyDown,
  onSelectAdvance
}) => {
  const generatedId = useId();
  const inputId = id || `combobox-${generatedId}`;
  const listboxId = `listbox-${generatedId}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });

  // Find selected option
  const selectedOption = options.find((opt) => opt.id === value);

  // When value changes from outside, sync search query to label if closed
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery(selectedOption ? selectedOption.label : '');
    }
  }, [value, selectedOption, isOpen]);

  // Autofocus handling
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Filter options based on query
  const filteredOptions = options.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesLabel = opt.label.toLowerCase().includes(q);
    const matchesSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(q) : false;
    const matchesTags = opt.tags ? opt.tags.some((t) => t.toLowerCase().includes(q)) : false;
    return matchesLabel || matchesSub || matchesTags;
  });

  // Handle outside click to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery(selectedOption ? selectedOption.label : '');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [selectedOption]);

  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const handleSelectOption = (opt: ComboboxOption, advance = false) => {
    onChange(opt.id, opt);
    setSearchQuery(opt.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (advance && onSelectAdvance) {
      onSelectAdvance();
    } else {
      inputRef.current?.focus();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (customKeyDown) {
      customKeyDown(e);
      if (e.defaultPrevented) return;
    }

    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
    }

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelectOption(filteredOptions[highlightedIndex], true);
        } else if (onAddNew && searchQuery.trim() && filteredOptions.length === 0) {
          onAddNew(searchQuery.trim());
          setIsOpen(false);
        }
      } else if (e.key === 'Tab') {
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelectOption(filteredOptions[highlightedIndex]);
        } else {
          setIsOpen(false);
          setSearchQuery(selectedOption ? selectedOption.label : '');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setSearchQuery(selectedOption ? selectedOption.label : '');
      }
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', ...style }}
      className={`searchable-combobox-root ${className}`}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          id={inputId}
          type="text"
          role="combobox"
          aria-label={ariaLabel || placeholder}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]
              ? `option-${inputId}-${highlightedIndex}`
              : undefined
          }
          className={`input ${error ? 'input-error' : ''}`}
          style={{
            width: '100%',
            paddingRight: value ? '50px' : '30px',
            borderColor: error ? 'var(--color-danger-text)' : undefined
          }}
          placeholder={placeholder}
          disabled={disabled}
          tabIndex={tabIndex}
          value={isOpen ? searchQuery : (selectedOption ? selectedOption.label : searchQuery)}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (!disabled) {
              if (selectedOption) {
                setSearchQuery(selectedOption.label);
              }
              if (inputRef.current) inputRef.current.select();
            }
          }}
          onClick={() => {
            if (!disabled) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />

        <div
          style={{
            position: 'absolute',
            right: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            pointerEvents: disabled ? 'none' : 'auto'
          }}
        >
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              tabIndex={-1}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!disabled) {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }
            }}
            tabIndex={-1}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-danger-text)', marginTop: '2px', display: 'block' }}>
          {error}
        </span>
      )}

      {isOpen && !disabled && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            maxHeight: '240px',
            overflowY: 'auto',
            zIndex: 12000,
            padding: '4px 0'
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              No matching options
            </div>
          ) : (
            filteredOptions.map((opt, index) => {
              const isSelected = opt.id === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={opt.id}
                  id={`option-${inputId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectOption(opt)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: isHighlighted
                      ? 'var(--color-accent-light)'
                      : isSelected
                      ? 'var(--bg-main)'
                      : 'transparent',
                    color: isHighlighted ? 'var(--color-accent-text)' : 'var(--text-main)',
                    display: 'flex',
                    flexDirection: 'column',
                    borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent'
                  }}
                >
                  <div style={{ fontWeight: isSelected ? 600 : 500 }}>{opt.label}</div>
                  {opt.subLabel && (
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{opt.subLabel}</div>
                  )}
                </div>
              );
            })
          )}

          {onAddNew && searchQuery.trim() && (
            <div
              role="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onAddNew(searchQuery.trim());
                setIsOpen(false);
              }}
              onClick={() => {
                onAddNew(searchQuery.trim());
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '0.8rem',
                borderTop: '1px solid var(--border-color)',
                color: 'var(--color-accent)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600
              }}
            >
              <Plus size={14} />
              <span>{addNewLabel} &quot;{searchQuery.trim()}&quot;</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
