import React, { useEffect, useState } from 'react';
import { Plus, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchCustomerReceipts } from '@/api/client';
import type { CustomerReceipt } from '@/features/sales/types';
const money = (value:string) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value||0));
export const CustomerReceiptsPage:React.FC=()=>{
  const navigate=useNavigate(); const orgId=useAppSelector(s=>s.ui.selectedOrganizationId); const outletId=useAppSelector(s=>s.ui.selectedOutletId);
  const [rows,setRows]=useState<CustomerReceipt[]>([]); const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(orgId&&outletId)fetchCustomerReceipts(orgId,outletId).then(setRows).catch(e=>setError(e.message));},[orgId,outletId]);
  return <div style={{maxWidth:1400,margin:'0 auto',padding:'1.5rem'}}><PageHeader title="Customer Receipts" subtitle="Collect customer payments and allocate them against credit Sales Invoices." actions={<button className="btn btn-primary" onClick={()=>navigate('/app/sales/receipts/new')}><Plus size={16}/> Record Receipt</button>}/>{error&&<div className="alert alert-error">{error}</div>}<div className="card" style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Account</th><th style={{textAlign:'right'}}>Amount</th><th style={{textAlign:'right'}}>Advance</th><th>Status</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={7} style={{textAlign:'center',padding:44}}><WalletCards size={28}/><div>No customer receipts found.</div></td></tr>:rows.map(row=><tr key={row.id}><td>{row.receipt_date}</td><td><strong>{row.receipt_number}</strong><div className="text-muted">{row.reference_number||'No reference'}</div></td><td>{row.customer_name}</td><td>{row.payment_account_name}</td><td style={{textAlign:'right',fontWeight:700}}>{money(row.amount)}</td><td style={{textAlign:'right'}}>{money(row.unallocated_amount)}</td><td><span className={`status-badge ${row.status==='active'?'success':'danger'}`}>{row.status}</span></td></tr>)}</tbody></table></div></div>;
};
