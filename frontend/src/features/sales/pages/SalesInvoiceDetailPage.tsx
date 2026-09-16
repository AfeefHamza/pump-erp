import React, { useEffect, useState } from 'react';
import { ArrowLeft, Ban, BookOpenCheck, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { fetchSalesInvoice, voidSalesInvoice } from '@/api/client';
import type { SalesInvoice } from '@/features/sales/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const SalesInvoiceDetailPage: React.FC = () => {
  const navigate = useNavigate(); const { invoiceId } = useParams();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId); const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null); const [error, setError] = useState<string | null>(null);
  const load = () => { if (orgId && outletId && invoiceId) fetchSalesInvoice(orgId, outletId, invoiceId).then(setInvoice).catch((err) => setError(err.message)); };
  useEffect(load, [orgId, outletId, invoiceId]);
  const voidInvoice = async () => {
    if (!orgId || !outletId || !invoiceId) return;
    const reason = window.prompt('Reason for voiding this invoice (minimum 5 characters):');
    if (!reason) return;
    try { setInvoice(await voidSalesInvoice(orgId, outletId, invoiceId, reason)); } catch (err: any) { setError(err.message); }
  };
  if (!invoice) return <div style={{ padding: 24 }}>{error || 'Loading Sales Invoice…'}</div>;
  return <div style={{ maxWidth: 1350, margin: '0 auto', padding: '1.5rem' }}>
    <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><button className="btn btn-ghost" onClick={() => navigate('/app/sales/invoices')}><ArrowLeft size={16}/> Back</button><div style={{ display: 'flex', gap: 8 }}>{invoice.accounting_journal_id && <button className="btn btn-secondary" onClick={() => navigate(`/app/finance/vouchers/${invoice.accounting_journal_id}`)}><BookOpenCheck size={16}/> View Journal</button>}<button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16}/> Print</button>{invoice.status === 'active' && <button className="btn btn-danger" onClick={voidInvoice}><Ban size={16}/> Void Invoice</button>}</div></div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', borderBottom: '1px solid var(--border-color)', paddingBottom: 20 }}><div><div className="text-muted">SALES INVOICE</div><h1 style={{ margin: '4px 0' }}>{invoice.invoice_number}</h1><span className={`status-badge ${invoice.status === 'active' ? 'success' : 'danger'}`}>{invoice.status}</span></div><div style={{ textAlign: 'right' }}><strong>{invoice.customer_name}</strong><div>{invoice.customer_code_snapshot}</div><div className="text-muted">Invoice: {invoice.invoice_date}</div><div className="text-muted">Due: {invoice.due_date}</div></div></div>
      <div style={{ overflowX: 'auto', marginTop: 22 }}><table className="data-table"><thead><tr><th>Item</th><th>HSN/SAC</th><th>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Taxable</th><th>Tax Treatment</th><th style={{ textAlign: 'right' }}>Tax</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead><tbody>{invoice.lines.map((line) => <tr key={line.id}><td><strong>{line.item_name_snapshot}</strong><div className="text-muted">{line.item_code_snapshot}{line.credit_slip_number ? ` · ${line.credit_slip_number}` : ''}</div></td><td>{line.hsn_sac_snapshot || '—'}</td><td>{line.quantity} {line.unit_snapshot}</td><td style={{ textAlign: 'right' }}>{money(line.unit_price)}</td><td style={{ textAlign: 'right' }}>{money(line.taxable_amount)}</td><td>{line.tax_treatment_name_snapshot}</td><td style={{ textAlign: 'right' }}>{money(line.tax_amount)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(line.line_total)}</td></tr>)}</tbody></table></div>
      <div style={{ marginLeft: 'auto', width: 360, marginTop: 22 }}>{[['Subtotal', invoice.subtotal], ['Discount', invoice.discount_total], ['Taxable', invoice.taxable_total], ['Tax', invoice.tax_total], ['Grand Total', invoice.grand_total], ['Paid', invoice.amount_paid], ['Outstanding', invoice.outstanding_amount]].map(([label, value], index) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: index === 4 ? '2px solid var(--text-main)' : '1px solid var(--border-color)', fontSize: index === 4 ? 18 : 14 }}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
      {invoice.notes && <div style={{ marginTop: 24 }}><strong>Notes</strong><div>{invoice.notes}</div></div>}
      {invoice.status === 'voided' && <div className="alert alert-error" style={{ marginTop: 20 }}>Voided: {invoice.void_reason}</div>}
    </div>
  </div>;
};
