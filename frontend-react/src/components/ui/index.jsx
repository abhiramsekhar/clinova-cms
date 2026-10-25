import React, { useEffect, useId, useRef } from 'react';
import Icon from '../Icon';
import DataTable from './DataTable';
import { ToastProvider, useToast } from './Toast';
import Badge from '../Badge';

export { DataTable, ToastProvider, useToast, Badge };

/**
 * Reusable modal overlay with focus trap.
 */
export function Modal({ isOpen, onClose, title, size = 'md', children, footer, overlayClassName = '', contentClassName = '', trapFocus = false }) {
  const overlayRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement;
    const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const focusableElements = () => Array.from(overlayRef.current?.querySelectorAll(focusableSelector) || []).filter((element) => element.getClientRects().length);
    let focusFrame;
    if (trapFocus) {
      focusFrame = window.requestAnimationFrame(() => {
        const firstFocusable = focusableElements()[0];
        (firstFocusable || overlayRef.current?.querySelector('[role="dialog"]'))?.focus();
      });
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !trapFocus) return;
      const focusable = focusableElements();
      if (!focusable.length) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlayRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !overlayRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (trapFocus && previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [isOpen, trapFocus]);

  if (!isOpen) return null;

  const widths = { sm: '420px', md: '560px', lg: '720px', xl: '900px', full: '95vw' };

  return (
    <div
      className={`modal-overlay${isOpen ? ' is-open' : ''}${overlayClassName ? ` ${overlayClassName}` : ''}`}
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 'var(--z-modal, 400)',
        padding: '1rem',
      }}
    >
      <div
        className={`glass card modal-content${contentClassName ? ` ${contentClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={trapFocus ? -1 : undefined}
        style={{
          width: '100%',
          maxWidth: widths[size] || widths.md,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)',
          animation: 'modal-in 0.2s ease-out',
        }}
      >
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
          }}>
            <h3 id={titleId} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onClose}
              aria-label="Close"
              style={{ marginRight: '-0.5rem' }}
            >
              <Icon name="icon-x" size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {children}
        </div>
        {footer && (
          <div style={{
            display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Confirm dialog built on Modal.
 */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, isLoading = false }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || 'Confirm Action'} size="sm">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>{message}</p>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button type="button" className="btn btn--secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
        <button
          type="button"
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? <span className="spinner spinner-sm" /> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Form field wrapper with label, error, and hint.
 */
export function FormField({ label, htmlFor, error, hint, required, children }) {
  return (
    <div className="form-group" style={{ marginBottom: '1rem' }}>
      {label && (
        <label
          className="form-group__label"
          htmlFor={htmlFor}
          style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text)' }}
        >
          {label}
          {required && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>}
        </label>
      )}
      {children}
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>{error}</p>
      )}
      {hint && !error && (
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>{hint}</p>
      )}
    </div>
  );
}

/**
 * Stat card for dashboards.
 */
export function StatCard({ label, value, icon, color = 'var(--primary)', trend, onClick }) {
  return (
    <div
      className="glass card"
      style={{
        padding: '1.25rem',
        borderRadius: '12px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform var(--transition-fast)',
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--muted)' }}>{label}</span>
        {icon && (
          <div style={{ color }}>
            <Icon name={icon} size={20} />
          </div>
        )}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>
        {value}
      </div>
      {trend && (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{trend}</div>
      )}
    </div>
  );
}

/**
 * Tabs component.
 */
export function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="tabs" style={{
      display: 'flex', gap: '0', borderBottom: '2px solid var(--border)',
      marginBottom: '1.5rem', overflowX: 'auto',
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`btn btn--ghost ${activeTab === tab.key ? 'tab--active' : ''}`}
          onClick={() => onChange(tab.key)}
          style={{
            padding: '0.75rem 1.25rem',
            fontSize: '0.875rem',
            fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? 'var(--primary)' : 'var(--muted)',
            borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            borderRadius: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {tab.icon && <Icon name={tab.icon} size={16} style={{ marginRight: '0.375rem' }} />}
          {tab.label}
          {tab.count != null && (
            <span style={{
              marginLeft: '0.5rem', fontSize: '0.75rem',
              background: activeTab === tab.key ? 'var(--primary)' : 'var(--border)',
              color: activeTab === tab.key ? '#fff' : 'var(--muted)',
              padding: '0.125rem 0.5rem', borderRadius: '999px',
            }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Avatar with initials fallback.
 */
export function Avatar({ name, src, size = 36 }) {
  const initials = name
    ? name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'User'}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    );
  }

  return (
    <div
      className="avatar"
      style={{
        width: size, height: size, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 600,
        background: 'var(--navy-100)', color: 'var(--navy-900)',
      }}
    >
      {initials}
    </div>
  );
}

/**
 * PrintView — opens an A4 print window.
 */
export function openPrintView(title, contentHtml) {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12pt; color: #17343A; margin: 0; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 1em 0; }
        th, td { border: 1px solid #D7E7E5; padding: 8px 12px; text-align: left; }
        th { background: #E8F6F3; font-weight: 600; }
        h1, h2, h3 { color: #05668D; }
        .print-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #05668D; padding-bottom: 12px; margin-bottom: 20px; }
        .print-footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #D7E7E5; font-size: 10pt; color: #819496; text-align: center; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="print-header">
        <div><h2 style="margin:0;">Clinova Healthcare</h2><small>Care. Precision. Trust.</small></div>
        <div style="text-align:right;"><strong>${title}</strong><br/><small>${new Date().toLocaleDateString('en-GB')}</small></div>
      </div>
      ${contentHtml}
      <div class="print-footer">Generated by Clinova Healthcare CMS • ${new Date().toLocaleString('en-GB')}</div>
    </body>
    </html>
  `);
  win.document.close();
  win.print();
}

/**
 * Multi-step wizard.
 */
export function Wizard({ steps, currentStep, onStepChange, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '2rem',
        padding: '0 0.5rem',
      }}>
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isDone = idx < currentStep;
          return (
            <div
              key={idx}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
                cursor: isDone ? 'pointer' : 'default',
                opacity: isActive || isDone ? 1 : 0.5,
              }}
              onClick={() => isDone && onStepChange?.(idx)}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700,
                background: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--border)',
                color: isActive || isDone ? '#fff' : 'var(--muted)',
                transition: 'all var(--transition-base)',
              }}>
                {isDone ? <Icon name="icon-check" size={16} /> : idx + 1}
              </div>
              <span style={{
                fontSize: '0.75rem', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text)' : 'var(--muted)',
                textAlign: 'center',
              }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
