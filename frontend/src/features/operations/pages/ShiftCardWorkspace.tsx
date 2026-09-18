import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchShiftCardPreparation,
  fetchShiftCardDetail,
  saveShiftCard,
  voidShiftCard,
  type ShiftCardPreparationResponse,
  type EmployeeShiftCardItem,
  type ShiftCardSavePayload,
  type ShiftCardCollectionInput,
  type ShiftCardCreditSlipInput,
  type ShiftCardDeductionInput
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  AlertTriangle,
  CheckCircle,
  Save,
  ArrowRight,
  Plus,
  Trash2,
  Lock,
  FileText,
  CreditCard,
  Smartphone,
  Truck,
  DollarSign,
  Receipt,
  HelpCircle,
  ArrowLeft,
  XCircle
} from 'lucide-react';

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

interface MeterRowState {
  nozzle_id: string;
  nozzle_code: string;
  dispenser_name: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  opening_reading: string;
  expected_opening_reading: number | null;
  opening_source: string;
  source_description: string;
  continuity_status: string;
  continuity_difference: number;
  is_conflict_acknowledged: boolean;
  closing_reading: string;
  testing_quantity: string;
  returned_to_tank: boolean;
  requires_commissioning: boolean;
}

export const ShiftCardWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { cardId } = useParams<{ cardId?: string }>();
  const [searchParams] = useSearchParams();

  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canOpenShift = usePermission('shift.open');
  const canUpdateShift = usePermission('shift.update_open');
  const canSave = canOpenShift || canUpdateShift;
  const canVoidShift = usePermission('shift.void');

  // Header & Shift state
  const [businessDate, setBusinessDate] = useState<string>(searchParams.get('date') || '');
  const [shiftDefId, setShiftDefId] = useState<string>(searchParams.get('shift_def') || '');
  const [employeeId, setEmployeeId] = useState<string>(searchParams.get('employee_id') || '');
  const [sequence, setSequence] = useState<number>(1);
  const [mpdSlipNumber, setMpdSlipNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Loaded preparation data
  const [prepData, setPrepData] = useState<ShiftCardPreparationResponse | null>(null);
  const [existingCard, setExistingCard] = useState<EmployeeShiftCardItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Meter Readings State
  const [meterRows, setMeterRows] = useState<MeterRowState[]>([]);

  // Collections State
  const [activeTab, setActiveTab] = useState<'cash' | 'cards' | 'upi' | 'fleet' | 'credit' | 'expenses'>('cash');

  // Cash Denominations
  const [denominations, setDenominations] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });
  const [manualCashAmount, setManualCashAmount] = useState<string>('0.00');
  const [useManualCash, setUseManualCash] = useState<boolean>(false);

  // Digital & Fleet Collections
  const [cardsList, setCardsList] = useState<ShiftCardCollectionInput[]>([]);
  const [upiList, setUpiList] = useState<ShiftCardCollectionInput[]>([]);
  const [fleetList, setFleetList] = useState<ShiftCardCollectionInput[]>([]);

  // Credit Slips
  const [creditSlipsList, setCreditSlipsList] = useState<ShiftCardCreditSlipInput[]>([]);

  // Deductions / Expenses (Pending manager approval)
  const [deductionsList, setDeductionsList] = useState<ShiftCardDeductionInput[]>([]);

  // Discrepancy & Acknowledgement
  const [isAcknowledged, setIsAcknowledged] = useState<boolean>(false);
  const [acknowledgementNote, setAcknowledgementNote] = useState<string>('');

  // Void modal
  const [showVoidModal, setShowVoidModal] = useState<boolean>(false);
  const [voidReason, setVoidReason] = useState<string>('');

  // Load Preparation Data
  const loadPrep = useCallback(async (bDate?: string, sDefId?: string) => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShiftCardPreparation(selectedOrgId, selectedOutletId, bDate, sDefId);
      setPrepData(data);

      if (!bDate) {
        setBusinessDate(data.business_date);
      }
      if (!sDefId && data.shift_definition_id) {
        setShiftDefId(data.shift_definition_id);
      } else if (!sDefId && data.shift_definitions.length > 0) {
        setShiftDefId(data.shift_definitions[0].id);
      }

      // Populate meter rows from historical nozzles if not already set
      if (meterRows.length === 0 && !cardId) {
        const rows: MeterRowState[] = data.historical_nozzles.map((nz) => {
          const expected = nz.opening_info?.reading !== null && nz.opening_info?.reading !== undefined
            ? parseFloat(nz.opening_info.reading as any)
            : null;
          return {
            nozzle_id: nz.id,
            nozzle_code: nz.code,
            dispenser_name: nz.dispenser_name,
            product_id: nz.product_id,
            product_name: nz.product_name,
            unit_price: parseFloat(nz.current_selling_price as any) || 0,
            opening_reading: expected !== null ? expected.toString() : '',
            expected_opening_reading: expected,
            opening_source: nz.opening_info?.source || 'initial_opening_balance',
            source_description: nz.opening_info?.source_description || '',
            continuity_status: nz.opening_info?.continuity_status || 'valid',
            continuity_difference: 0,
            is_conflict_acknowledged: false,
            closing_reading: '',
            testing_quantity: '0.000',
            returned_to_tank: true,
            requires_commissioning: !!nz.opening_info?.requires_commissioning,
          };
        });
        setMeterRows(rows);
      }
    } catch (err: any) {
      console.error('Failed to load shift card preparation data:', err);
      setError(err.message || 'Failed to load preparation data.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, cardId, meterRows.length]);

  // Initial load
  useEffect(() => {
    if (cardId && selectedOrgId && selectedOutletId) {
      setLoading(true);
      fetchShiftCardDetail(selectedOrgId, selectedOutletId, cardId)
        .then((card) => {
          setExistingCard(card);
          setBusinessDate(card.parent_shift.business_date);
          setShiftDefId(card.parent_shift.shift_definition.id);
          setEmployeeId(card.employee.id);
          setSequence(card.sequence);
          setMpdSlipNumber(card.mpd_slip_number || '');
          setNotes(card.notes || '');
          setIsAcknowledged(card.is_shortage_excess_acknowledged);
          setAcknowledgementNote(card.shortage_excess_acknowledgement_note || '');

          // Map meters
          const mappedMeters: MeterRowState[] = (card.meters || []).map((m: any) => ({
            nozzle_id: m.nozzle_id,
            nozzle_code: m.nozzle_code,
            dispenser_name: m.dispenser_name_snapshot || '',
            product_id: m.product_id,
            product_name: m.product_name_snapshot || '',
            unit_price: parseFloat((m.price_segments?.[0]?.unit_price ?? m.unit_price) as any) || 0,
            opening_reading: m.opening_reading?.toString() || '',
            expected_opening_reading: m.expected_opening_reading !== null && m.expected_opening_reading !== undefined ? parseFloat(m.expected_opening_reading as any) : null,
            opening_source: m.opening_source || 'previous_shift_card',
            source_description: m.opening_source,
            continuity_status: m.continuity_status || 'valid',
            continuity_difference: parseFloat(m.continuity_difference || '0'),
            is_conflict_acknowledged: m.is_conflict_acknowledged || false,
            closing_reading: m.closing_reading !== null ? m.closing_reading.toString() : '',
            testing_quantity: m.testing_records?.[0]?.quantity?.toString() || '0.000',
            returned_to_tank: m.testing_records?.[0]?.returned_to_tank ?? true,
            requires_commissioning: false,
          }));
          setMeterRows(mappedMeters);

          // Map collections
          const cashColl = (card.collections || []).find((c: any) => c.collection_method === 'cash');
          if (cashColl) {
            setManualCashAmount(cashColl.amount?.toString() || '0.00');
            setUseManualCash(true);
            if (cashColl.denominations && cashColl.denominations.length > 0) {
              const denMap: Record<number, number> = { ...denominations };
              cashColl.denominations.forEach((d: any) => {
                denMap[d.denomination_value] = d.quantity;
              });
              setDenominations(denMap);
              setUseManualCash(false);
            }
          }

          setCardsList((card.collections || []).filter((c: any) => c.collection_method === 'card').map((c: any) => ({
            amount: c.amount,
            provider_name: c.provider_name,
            reference_number: c.reference_number,
            terminal_or_account_reference: c.terminal_or_account_reference,
            occurred_at: c.occurred_at,
            notes: c.notes,
          })));

          setUpiList((card.collections || []).filter((c: any) => c.collection_method === 'upi').map((c: any) => ({
            amount: c.amount,
            provider_name: c.provider_name,
            reference_number: c.reference_number,
            occurred_at: c.occurred_at,
            notes: c.notes,
          })));

          setFleetList((card.collections || []).filter((c: any) => c.collection_method === 'fleet_card').map((c: any) => ({
            amount: c.amount,
            provider_name: c.provider_name,
            reference_number: c.reference_number,
            terminal_or_account_reference: c.terminal_or_account_reference,
            occurred_at: c.occurred_at,
            notes: c.notes,
          })));

          setCreditSlipsList((card.credit_slips || []).map((cs: any) => ({
            customer_id: cs.customer_id,
            nozzle_id: cs.nozzle_id,
            product_id: cs.product_id,
            quantity: cs.quantity,
            unit_price: cs.unit_price,
            slip_number: cs.slip_number,
            physical_slip_number: cs.physical_slip_number,
            vehicle_number: cs.vehicle_number,
            driver_name: cs.driver_name,
            customer_reference: cs.customer_reference,
            occurred_at: cs.occurred_at,
            notes: cs.notes,
          })));

          setDeductionsList((card.deductions || []).map((d: any) => ({
            id: d.id,
            deduction_type: d.deduction_type,
            direction: d.direction,
            amount: d.amount,
            description: d.description,
            payee: d.payee,
            reference_number: d.reference_number,
            occurred_at: d.occurred_at,
          })));

          loadPrep(card.parent_shift.business_date, card.parent_shift.shift_definition.id);
        })
        .catch((err: any) => {
          console.error('Failed to load card details:', err);
          setError(err.message || 'Failed to load shift card details.');
          setLoading(false);
        });
    } else {
      loadPrep();
    }
  }, [cardId, selectedOrgId, selectedOutletId]);

  // Quick Date Helpers
  const handleSetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yStr = d.toISOString().split('T')[0];
    setBusinessDate(yStr);
    loadPrep(yStr, shiftDefId);
  };

  const handleSetToday = () => {
    const tStr = new Date().toISOString().split('T')[0];
    setBusinessDate(tStr);
    loadPrep(tStr, shiftDefId);
  };

  // Check parent shift lock status
  const isShiftLocked = useMemo(() => {
    if (existingCard) return existingCard.parent_shift?.is_locked ?? false;
    return prepData?.parent_shift?.is_locked ?? false;
  }, [existingCard, prepData]);

  // Meter Calculations
  const calculatedMeters = useMemo(() => {
    return meterRows.map((row) => {
      const open = parseFloat(row.opening_reading) || 0;
      const close = row.closing_reading !== '' ? parseFloat(row.closing_reading) : null;
      const testing = parseFloat(row.testing_quantity) || 0;

      const gross = close !== null ? Math.max(0, close - open) : 0;
      const netLitres = Math.max(0, gross - testing);
      const unitPrice = parseFloat(row.unit_price as any) || 0;
      const saleAmount = netLitres * unitPrice;

      // Check continuity difference
      let diff = 0;
      let conflict = false;
      if (row.expected_opening_reading !== null && row.opening_reading !== '') {
        diff = open - row.expected_opening_reading;
        if (Math.abs(diff) > 0.001) {
          conflict = true;
        }
      }

      return {
        ...row,
        gross,
        netLitres,
        saleAmount,
        diff,
        conflict
      };
    });
  }, [meterRows]);

  const totalLitresSold = useMemo(() => {
    return calculatedMeters.reduce((sum, m) => sum + m.netLitres, 0);
  }, [calculatedMeters]);

  const totalExpectedSaleAmount = useMemo(() => {
    return calculatedMeters.reduce((sum, m) => sum + m.saleAmount, 0);
  }, [calculatedMeters]);

  // Cash Calculation
  const totalDenominationAmount = useMemo(() => {
    return DENOMINATIONS.reduce((sum, val) => {
      return sum + val * (denominations[val] || 0);
    }, 0);
  }, [denominations]);

  const effectiveCashAmount = useMemo(() => {
    if (useManualCash) {
      return parseFloat(manualCashAmount) || 0;
    }
    return totalDenominationAmount;
  }, [useManualCash, manualCashAmount, totalDenominationAmount]);

  const cashDiscrepancy = useMemo(() => {
    if (!useManualCash) return 0;
    return (parseFloat(manualCashAmount) || 0) - totalDenominationAmount;
  }, [useManualCash, manualCashAmount, totalDenominationAmount]);

  // Digital & Credit Totals
  const totalCardsAmount = useMemo(() => {
    return cardsList.reduce((sum, c) => sum + (parseFloat(c.amount as string) || 0), 0);
  }, [cardsList]);

  const totalUpiAmount = useMemo(() => {
    return upiList.reduce((sum, u) => sum + (parseFloat(u.amount as string) || 0), 0);
  }, [upiList]);

  const totalFleetAmount = useMemo(() => {
    return fleetList.reduce((sum, f) => sum + (parseFloat(f.amount as string) || 0), 0);
  }, [fleetList]);

  const totalCreditAmount = useMemo(() => {
    return creditSlipsList.reduce((sum, cs) => {
      const q = parseFloat(cs.quantity as string) || 0;
      const p = parseFloat(cs.unit_price as string) || 0;
      return sum + (q * p);
    }, 0);
  }, [creditSlipsList]);

  // Expenses: Note that pending expenses do NOT reduce accounted amount
  const totalPendingExpenses = useMemo(() => {
    return deductionsList.reduce((sum, d) => sum + (parseFloat(d.amount as string) || 0), 0);
  }, [deductionsList]);

  // Total Accounted Amount
  const totalAccountedAmount = useMemo(() => {
    return effectiveCashAmount + totalCardsAmount + totalUpiAmount + totalFleetAmount + totalCreditAmount;
  }, [effectiveCashAmount, totalCardsAmount, totalUpiAmount, totalFleetAmount, totalCreditAmount]);

  // Difference Calculation
  const differenceAmount = useMemo(() => {
    return totalAccountedAmount - totalExpectedSaleAmount;
  }, [totalAccountedAmount, totalExpectedSaleAmount]);

  const remainingToAllocate = useMemo(() => {
    return Math.max(0, totalExpectedSaleAmount - totalAccountedAmount);
  }, [totalExpectedSaleAmount, totalAccountedAmount]);

  // Discrepancy Status:
  // Requirement 9: Balanced -> Green, Shortage -> Red, Excess -> Amber/Orange (NEVER GREEN!), Conflict -> Red
  const hasContinuityConflict = useMemo(() => {
    return calculatedMeters.some((m) => m.conflict && !m.is_conflict_acknowledged);
  }, [calculatedMeters]);

  const discrepancyType = useMemo<'balanced' | 'shortage' | 'excess' | 'conflict'>(() => {
    if (hasContinuityConflict) return 'conflict';
    if (Math.abs(differenceAmount) < 0.01) return 'balanced';
    if (differenceAmount < 0) return 'shortage';
    return 'excess';
  }, [differenceAmount, hasContinuityConflict]);

  // Row update handlers
  const handleMeterChange = (index: number, field: keyof MeterRowState, value: any) => {
    setMeterRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleDenominationChange = (value: number, countStr: string) => {
    const count = parseInt(countStr, 10) || 0;
    setDenominations((prev) => ({
      ...prev,
      [value]: Math.max(0, count)
    }));
  };

  const handleQuickCollectionAmount = (
    method: 'cards' | 'upi' | 'fleet',
    amount: string
  ) => {
    const update = (rows: ShiftCardCollectionInput[]) => {
      if (rows.length === 0) return [{ amount }];
      return rows.map((row, index) => index === 0 ? { ...row, amount } : row);
    };

    if (method === 'cards') setCardsList(update);
    if (method === 'upi') setUpiList(update);
    if (method === 'fleet') setFleetList(update);
  };

  // Add Dynamic Rows
  const handleAddCard = () => {
    setCardsList((prev) => [
      ...prev,
      { amount: '', provider_name: '', reference_number: '', terminal_or_account_reference: '', notes: '' }
    ]);
  };

  const handleAddUpi = () => {
    setUpiList((prev) => [
      ...prev,
      { amount: '', provider_name: '', reference_number: '', notes: '' }
    ]);
  };

  const handleAddFleet = () => {
    setFleetList((prev) => [
      ...prev,
      { amount: '', provider_name: '', reference_number: '', terminal_or_account_reference: '', notes: '' }
    ]);
  };

  const handleAddCreditSlip = () => {
    const firstCust = prepData?.customers?.[0]?.id || '';
    const firstProd = prepData?.historical_nozzles?.[0]?.product_id || '';
    const firstPrice = parseFloat(prepData?.historical_nozzles?.[0]?.current_selling_price as any) || 0;
    setCreditSlipsList((prev) => [
      ...prev,
      {
        customer_id: firstCust,
        product_id: firstProd,
        quantity: '',
        unit_price: firstPrice,
        slip_number: '',
        physical_slip_number: '',
        vehicle_number: '',
        driver_name: '',
        customer_reference: '',
        notes: ''
      }
    ]);
  };

  const handleAddExpense = () => {
    setDeductionsList((prev) => [
      ...prev,
      {
        deduction_type: 'cash_expense',
        direction: 'increases_accounted',
        amount: '',
        description: '',
        payee: '',
        reference_number: ''
      }
    ]);
  };

  // Save Validation & Submit
  const handleSave = async (nextAction?: 'next_employee' | 'next_shift') => {
    if (!selectedOrgId || !selectedOutletId) return;

    if (isShiftLocked) {
      alert('This Shift is locked. You must unlock the parent shift first to record changes.');
      return;
    }

    if (!employeeId) {
      setError('Please select an employee for this Shift Card.');
      return;
    }
    if (!shiftDefId) {
      setError('Please select a Shift Definition.');
      return;
    }
    if (!businessDate) {
      setError('Please select a Business Date.');
      return;
    }

    // Check for uncommissioned nozzles
    const uncommissioned = meterRows.find((m) => m.requires_commissioning);
    if (uncommissioned) {
      setError(`Nozzle ${uncommissioned.nozzle_code} has no baseline or history and requires commissioning before entering shift data.`);
      return;
    }

    // Check unacknowledged continuity conflict
    const unackConflict = calculatedMeters.find((m) => m.conflict && !m.is_conflict_acknowledged);
    if (unackConflict) {
      setError(`Nozzle ${unackConflict.nozzle_code} has a continuity conflict. Please review and acknowledge the conflict before saving.`);
      return;
    }

    // Check shortage/excess acknowledgement
    if (Math.abs(differenceAmount) >= 0.01) {
      if (!isAcknowledged) {
        const discName = differenceAmount > 0 ? 'Excess' : 'Shortage';
        setError(`An ${discName} of ₹${Math.abs(differenceAmount).toFixed(2)} exists. You must acknowledge the difference to save.`);
        return;
      }
      if (!acknowledgementNote.trim()) {
        setError('A mandatory explanation note is required when saving with a shortage or excess.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: ShiftCardSavePayload = {
        shift_card_id: existingCard?.id,
        shift_definition_id: shiftDefId,
        business_date: businessDate,
        employee_id: employeeId,
        sequence: sequence,
        mpd_slip_number: mpdSlipNumber || undefined,
        notes: notes || undefined,
        operator_notes: notes || undefined,
        is_shortage_excess_acknowledged: isAcknowledged,
        shortage_acknowledged: isAcknowledged,
        shortage_excess_acknowledgement_note: acknowledgementNote || undefined,
        shortage_notes: acknowledgementNote || undefined,
        cash_amount: effectiveCashAmount,
        meters: meterRows.map((r) => ({
          nozzle_id: r.nozzle_id,
          opening_reading: r.opening_reading,
          closing_reading: r.closing_reading !== '' ? r.closing_reading : null,
          expected_opening_reading: r.expected_opening_reading,
          opening_source: r.opening_source,
          continuity_status: r.continuity_status,
          continuity_difference: r.continuity_difference,
          is_conflict_acknowledged: r.is_conflict_acknowledged,
          testing_quantity: r.testing_quantity || '0.000',
          testing_litres: r.testing_quantity || '0.000',
          returned_to_tank: r.returned_to_tank,
          price_segments: [{
            opening_reading: r.opening_reading,
            closing_reading: r.closing_reading !== '' ? r.closing_reading : null,
            unit_price: r.unit_price,
            testing_quantity: r.testing_quantity || '0.000',
          }]
        })),
        nozzle_meters: meterRows.map((r) => ({
          nozzle_id: r.nozzle_id,
          opening_reading: r.opening_reading,
          closing_reading: r.closing_reading !== '' ? r.closing_reading : null,
          expected_opening_reading: r.expected_opening_reading,
          opening_source: r.opening_source,
          continuity_status: r.continuity_status,
          continuity_difference: r.continuity_difference,
          is_conflict_acknowledged: r.is_conflict_acknowledged,
          testing_quantity: r.testing_quantity || '0.000',
          testing_litres: r.testing_quantity || '0.000',
          returned_to_tank: r.returned_to_tank,
          price_segments: [{
            opening_reading: r.opening_reading,
            closing_reading: r.closing_reading !== '' ? r.closing_reading : null,
            unit_price: r.unit_price,
            testing_quantity: r.testing_quantity || '0.000',
          }]
        })),
        cash: {
          amount: effectiveCashAmount,
          denominations: DENOMINATIONS.map((dVal) => ({
            denomination_value: dVal,
            quantity: denominations[dVal] || 0
          }))
        },
        cards: cardsList.filter((c) => (parseFloat(c.amount as string) || 0) > 0),
        upi: upiList.filter((u) => (parseFloat(u.amount as string) || 0) > 0),
        fleet: fleetList.filter((f) => (parseFloat(f.amount as string) || 0) > 0),
        credit_slips: creditSlipsList.filter((cs) => (parseFloat(cs.quantity as string) || 0) > 0).map((cs) => ({
          ...cs,
          amount: (parseFloat(cs.quantity as string) || 0) * (parseFloat(cs.unit_price as string) || 0)
        })),
        deductions: deductionsList.filter((d) => (parseFloat(d.amount as string) || 0) > 0).map((d) => ({
          ...d,
          deduction_type: d.deduction_type || 'cash_expense',
          direction: d.direction || 'increases_accounted'
        }))
      };

      const saved = await saveShiftCard(selectedOrgId, selectedOutletId, payload);
      setSuccessMsg(`Shift Card #${saved.sequence} for ${saved.employee.display_name} saved successfully!`);

      if (nextAction === 'next_employee') {
        // Pick next unentered employee for the same parent shift
        const remainingEmp = prepData?.historical_employees?.find(
          (e) => e.id !== employeeId && !prepData?.existing_cards?.some((c) => c.employee.id === e.id)
        );
        if (remainingEmp) {
          setEmployeeId(remainingEmp.id);
          setExistingCard(null);
          // Reset collections
          setDenominations({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
          setCardsList([]);
          setUpiList([]);
          setFleetList([]);
          setCreditSlipsList([]);
          setDeductionsList([]);
          setIsAcknowledged(false);
          setAcknowledgementNote('');
          loadPrep(businessDate, shiftDefId);
        } else {
          alert('All historical employees for this shift have been entered!');
          navigate(`/app/operations/shift-cards/parent/${saved.parent_shift.id}`);
        }
      } else if (nextAction === 'next_shift') {
        // Cycle to next shift definition or next day
        const currentIdx = prepData?.shift_definitions?.findIndex((s) => s.id === shiftDefId) ?? -1;
        if (prepData?.shift_definitions && currentIdx !== -1 && currentIdx + 1 < prepData.shift_definitions.length) {
          const nextShift = prepData.shift_definitions[currentIdx + 1];
          setShiftDefId(nextShift.id);
          setExistingCard(null);
          loadPrep(businessDate, nextShift.id);
        } else {
          // Advance business date by 1 day
          const d = new Date(businessDate);
          d.setDate(d.getDate() + 1);
          const nextDateStr = d.toISOString().split('T')[0];
          setBusinessDate(nextDateStr);
          setExistingCard(null);
          loadPrep(nextDateStr);
        }
      } else {
        // Redirect to parent overview or reload card
        navigate(`/app/operations/shift-cards/parent/${saved.parent_shift.id}`);
      }
    } catch (err: any) {
      console.error('Failed to save shift card:', err);
      setError(err.message || 'Failed to save Shift Card.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoidCard = async () => {
    if (!selectedOrgId || !selectedOutletId || !existingCard || !voidReason.trim()) return;
    setSaving(true);
    try {
      await voidShiftCard(selectedOrgId, selectedOutletId, existingCard.id, voidReason.trim());
      setShowVoidModal(false);
      alert('Shift Card voided successfully. You can now enter a replacement card.');
      navigate(`/app/operations/shift-cards/parent/${existingCard.parent_shift.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to void Shift Card.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="management-page" style={{ padding: '3rem', textAlign: 'center' }}>
        <p className="text-muted">Loading Shift Card workspace...</p>
      </div>
    );
  }

  return (
    <div className="erp-page shift-card-erp-page" style={{ maxWidth: '1600px', margin: '0 auto' }}>
      {/* Top Breadcrumb & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => navigate('/app/operations/shift-cards')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Shift Cards
        </button>

        {existingCard && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className={`badge ${existingCard.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}>
              Card Status: {existingCard.status.toUpperCase()}
            </span>
            {canVoidShift && existingCard.status === 'active' && !isShiftLocked && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => setShowVoidModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <XCircle size={16} /> Void Card
              </button>
            )}
          </div>
        )}
      </div>

      <PageHeader
        title={existingCard ? `Edit Shift Card #${existingCard.sequence}` : "New Employee Shift Card"}
        subtitle="ERP shift document for nozzle totalizers, collections, credit and attendant reconciliation."
      />

      {/* Lock Alert Banner if Shift is Locked */}
      {isShiftLocked && (
        <div
          style={{
            background: 'var(--color-danger-light, #fee2e2)',
            border: '1px solid var(--color-danger, #ef4444)',
            color: 'var(--color-danger-dark, #991b1b)',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontWeight: 500
          }}
        >
          <Lock size={20} />
          <div>
            <strong>Shift Locked:</strong> This shift was locked on {existingCard?.parent_shift?.locked_at || 'record'}.
            Modifications require an authorized manager unlock with a mandatory audit reason.
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#b91c1c',
            padding: '0.875rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #34d399',
            color: '#065f46',
            padding: '0.875rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header Parameters Panel */}
      <div className="card shift-document-header" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', background: 'var(--color-surface, #fff)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'end' }}>
          {/* Business Date */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Business Date *</label>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  onClick={handleSetYesterday}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={handleSetToday}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
                >
                  Today
                </button>
              </div>
            </div>
            <input
              type="date"
              className="form-control"
              value={businessDate}
              onChange={(e) => {
                setBusinessDate(e.target.value);
                loadPrep(e.target.value, shiftDefId);
              }}
              disabled={isShiftLocked || !!existingCard}
              required
            />
          </div>

          {/* Shift Definition */}
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
              Shift Definition *
            </label>
            <select
              className="form-control"
              value={shiftDefId}
              onChange={(e) => {
                setShiftDefId(e.target.value);
                loadPrep(businessDate, e.target.value);
              }}
              disabled={isShiftLocked || !!existingCard}
              required
            >
              <option value="">Select Shift</option>
              {prepData?.shift_definitions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.starts_at} - {s.ends_at})
                </option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
              DSM / Attendant *
            </label>
            <select
              className="form-control"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={isShiftLocked || !!existingCard}
              required
            >
              <option value="">Select Attendant</option>
              {prepData?.historical_employees?.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.code})
                </option>
              ))}
            </select>
          </div>

          {/* MPD Slip Number */}
          <div>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
              Physical MPD Slip #
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. SLIP-9042"
              value={mpdSlipNumber}
              onChange={(e) => setMpdSlipNumber(e.target.value)}
              disabled={isShiftLocked}
            />
          </div>
        </div>
      </div>

      {/* Main Workspace 2-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Side: Meters & Collections Workspace */}
        <div>
          {/* Section 1: Nozzle Totalizers */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>1. Nozzle Meter Totalizers</h3>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Enter closing readings from printed MPD slip. Litres and expected sale amount calculate dynamically.
                </span>
              </div>
            </div>

            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-subtle, #f8fafc)', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Nozzle / Fuel</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Opening Totalizer</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Closing Totalizer</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Gross (L)</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Testing (L)</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Net Sold (L)</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Rate (₹/L)</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Sale Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {calculatedMeters.map((meter, idx) => (
                    <React.Fragment key={meter.nozzle_id}>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ fontWeight: 600 }}>{meter.nozzle_code}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {meter.dispenser_name} • {meter.product_name}
                          </div>
                          {meter.requires_commissioning && (
                            <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                              Commissioning Required
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <input
                            type="number"
                            step="0.001"
                            className="form-control"
                            style={{ width: '130px', fontWeight: 500 }}
                            value={meter.opening_reading}
                            onChange={(e) => handleMeterChange(idx, 'opening_reading', e.target.value)}
                            disabled={isShiftLocked}
                          />
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                            {meter.source_description || `Opening source: ${meter.opening_source.replace(/_/g, ' ')}`}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <input
                            type="number"
                            step="0.001"
                            className="form-control"
                            style={{ width: '130px', fontWeight: 600 }}
                            placeholder="Closing Totalizer"
                            value={meter.closing_reading}
                            onChange={(e) => handleMeterChange(idx, 'closing_reading', e.target.value)}
                            disabled={isShiftLocked}
                            required
                          />
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                          {(Number(meter.gross) || 0).toFixed(3)}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="number"
                              step="0.001"
                              className="form-control"
                              style={{ width: '80px' }}
                              value={meter.testing_quantity}
                              onChange={(e) => handleMeterChange(idx, 'testing_quantity', e.target.value)}
                              disabled={isShiftLocked}
                            />
                            <label style={{ fontSize: '0.75rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}>
                              <input
                                type="checkbox"
                                checked={meter.returned_to_tank}
                                onChange={(e) => handleMeterChange(idx, 'returned_to_tank', e.target.checked)}
                                disabled={isShiftLocked}
                              />
                              Returned
                            </label>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary, #2563eb)' }}>
                          {(Number(meter.netLitres) || 0).toFixed(3)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          ₹{(Number(meter.unit_price) || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                          ₹{(Number(meter.saleAmount) || 0).toFixed(2)}
                        </td>
                      </tr>

                      {/* Continuity Conflict Row */}
                      {meter.conflict && (
                        <tr style={{ background: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
                          <td colSpan={8} style={{ padding: '0.65rem 0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#be123c', fontSize: '0.825rem' }}>
                                <AlertTriangle size={16} />
                                <span>
                                  <strong>Continuity Conflict:</strong> Expected opening totalizer was {meter.expected_opening_reading !== null && meter.expected_opening_reading !== undefined ? Number(meter.expected_opening_reading).toFixed(3) : '-'}, but entered {parseFloat(meter.opening_reading || '0').toFixed(3)} (Diff: {meter.diff > 0 ? `+${Number(meter.diff || 0).toFixed(3)}` : Number(meter.diff || 0).toFixed(3)} L).
                                </span>
                              </div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', fontWeight: 600, color: '#be123c', margin: 0, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={meter.is_conflict_acknowledged}
                                  onChange={(e) => handleMeterChange(idx, 'is_conflict_acknowledged', e.target.checked)}
                                  disabled={isShiftLocked}
                                />
                                Acknowledge Conflict
                              </label>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                    <td colSpan={3} style={{ padding: '0.75rem' }}>Totals</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {calculatedMeters.reduce((s, m) => s + m.gross, 0).toFixed(3)} L
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {calculatedMeters.reduce((s, m) => s + (parseFloat(m.testing_quantity) || 0), 0).toFixed(3)} L
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--color-primary, #2563eb)' }}>
                      {totalLitresSold.toFixed(3)} L
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>-</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--color-primary, #2563eb)' }}>
                      ₹{totalExpectedSaleAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Section 2: Collections & Slips Multi-Tab Workspace */}
          <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>2. Collections & Disbursements</h3>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                Account for handed over cash, digital transactions, credit slips, and shift expenses.
              </span>
            </div>

            {/* Fast allocation strip. Detailed rows remain available below when references are required. */}
            <div className="shift-collection-allocation-grid">
              <button
                type="button"
                onClick={() => setActiveTab('cash')}
                className={`shift-collection-allocation-card ${activeTab === 'cash' ? 'is-active' : ''}`}
              >
                <span className="shift-collection-allocation-label"><DollarSign size={17} /> Cash</span>
                <strong>₹{effectiveCashAmount.toFixed(2)}</strong>
                <span>Count denominations</span>
              </button>
              {([
                { key: 'cards' as const, label: 'Bank / POS Card', icon: CreditCard, total: totalCardsAmount, rows: cardsList },
                { key: 'upi' as const, label: 'UPI / Wallet', icon: Smartphone, total: totalUpiAmount, rows: upiList },
                { key: 'fleet' as const, label: 'Fleet / Company Card', icon: Truck, total: totalFleetAmount, rows: fleetList },
              ]).map(({ key, label, icon: Icon, total, rows }) => (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  className={`shift-collection-allocation-card ${activeTab === key ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setActiveTab(key);
                  }}
                >
                  <span className="shift-collection-allocation-label"><Icon size={17} /> {label}</span>
                  <div className="shift-collection-quick-input">
                    <span>₹</span>
                    <input
                      aria-label={`${label} amount`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={rows.length > 1 ? total.toFixed(2) : rows[0]?.amount || ''}
                      placeholder="0.00"
                      disabled={isShiftLocked || rows.length > 1}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={() => setActiveTab(key)}
                      onChange={(event) => handleQuickCollectionAmount(key, event.target.value)}
                    />
                  </div>
                  <span>{rows.length > 1 ? `${rows.length} entries · edit below` : 'Enter total or add details'}</span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setActiveTab('credit')}
                className={`shift-collection-allocation-card ${activeTab === 'credit' ? 'is-active' : ''}`}
              >
                <span className="shift-collection-allocation-label"><FileText size={17} /> Credit Slips</span>
                <strong>₹{totalCreditAmount.toFixed(2)}</strong>
                <span>{creditSlipsList.length} slip(s) · allocate below</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('expenses')}
                className={`shift-collection-allocation-card ${activeTab === 'expenses' ? 'is-active' : ''}`}
              >
                <span className="shift-collection-allocation-label"><Receipt size={17} /> Shift Expenses</span>
                <strong>₹{totalPendingExpenses.toFixed(2)}</strong>
                <span>{deductionsList.length} expense(s) · allocate below</span>
              </button>
            </div>
            <div className="shift-allocation-balance-bar">
              <div>
                <span>Expected sale</span><strong>₹{totalExpectedSaleAmount.toFixed(2)}</strong>
              </div>
              <div>
                <span>Allocated</span><strong>₹{totalAccountedAmount.toFixed(2)}</strong>
              </div>
              <div className={remainingToAllocate > 0.009 ? 'is-pending' : 'is-complete'}>
                <span>Remaining to allocate</span><strong>₹{remainingToAllocate.toFixed(2)}</strong>
              </div>
              {remainingToAllocate > 0.009 && !isShiftLocked && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    setUseManualCash(true);
                    setManualCashAmount((effectiveCashAmount + remainingToAllocate).toFixed(2));
                    setActiveTab('cash');
                  }}
                >
                  Allocate balance to Cash
                </button>
              )}
            </div>

            {/* Tab 1: Cash Counter & Denominations */}
            {activeTab === 'cash' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  {DENOMINATIONS.map((dVal) => (
                    <div key={dVal} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.65rem', background: '#f8fafc' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        ₹{dVal}
                      </div>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        placeholder="Qty"
                        value={denominations[dVal] || ''}
                        onChange={(e) => handleDenominationChange(dVal, e.target.value)}
                        disabled={isShiftLocked}
                      />
                      <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.25rem', color: '#64748b' }}>
                        = ₹{(dVal * (denominations[dVal] || 0)).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '0.85rem 1.25rem', borderRadius: '6px' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Denomination Breakdown Total: </span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--color-primary, #2563eb)' }}>
                      ₹{totalDenominationAmount.toFixed(2)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={useManualCash}
                        onChange={(e) => setUseManualCash(e.target.checked)}
                        disabled={isShiftLocked}
                      />
                      Override with Lump-sum Cash Amount
                    </label>
                    {useManualCash && (
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        style={{ width: '130px' }}
                        value={manualCashAmount}
                        onChange={(e) => setManualCashAmount(e.target.value)}
                        disabled={isShiftLocked}
                      />
                    )}
                  </div>
                </div>

                {useManualCash && Math.abs(cashDiscrepancy) > 0.01 && (
                  <div style={{ marginTop: '0.5rem', color: '#b45309', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangle size={15} />
                    <span>Difference between denomination total and entered cash: ₹{Math.abs(cashDiscrepancy).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: POS Cards */}
            {activeTab === 'cards' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={handleAddCard} disabled={isShiftLocked}>
                    <Plus size={15} /> Add Card Slip
                  </button>
                </div>
                {cardsList.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No card slips recorded. Click "+ Add Card Slip" to record POS transactions.
                  </div>
                ) : (
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>Provider (Bank/POS)</th>
                        <th>Auth / Ref #</th>
                        <th>POS Terminal</th>
                        <th>Amount (₹)</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardsList.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. HDFC Bank"
                              value={c.provider_name || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCardsList((prev) => prev.map((item, idx) => idx === i ? { ...item, provider_name: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Auth Code"
                              value={c.reference_number || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCardsList((prev) => prev.map((item, idx) => idx === i ? { ...item, reference_number: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="TID"
                              value={c.terminal_or_account_reference || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCardsList((prev) => prev.map((item, idx) => idx === i ? { ...item, terminal_or_account_reference: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              placeholder="0.00"
                              value={c.amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCardsList((prev) => prev.map((item, idx) => idx === i ? { ...item, amount: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost text-danger"
                              onClick={() => setCardsList((prev) => prev.filter((_, idx) => idx !== i))}
                              disabled={isShiftLocked}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab 3: UPI / QR */}
            {activeTab === 'upi' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={handleAddUpi} disabled={isShiftLocked}>
                    <Plus size={15} /> Add UPI Transaction
                  </button>
                </div>
                {upiList.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No UPI records entered. Click "+ Add UPI Transaction" to add QR/UPI payments.
                  </div>
                ) : (
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>App / Provider</th>
                        <th>UTR / Reference Number</th>
                        <th>Amount (₹)</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {upiList.map((u, i) => (
                        <tr key={i}>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. PhonePe / Paytm"
                              value={u.provider_name || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setUpiList((prev) => prev.map((item, idx) => idx === i ? { ...item, provider_name: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="UTR Number"
                              value={u.reference_number || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setUpiList((prev) => prev.map((item, idx) => idx === i ? { ...item, reference_number: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              placeholder="0.00"
                              value={u.amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setUpiList((prev) => prev.map((item, idx) => idx === i ? { ...item, amount: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost text-danger"
                              onClick={() => setUpiList((prev) => prev.filter((_, idx) => idx !== i))}
                              disabled={isShiftLocked}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab 4: Fleet Cards */}
            {activeTab === 'fleet' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={handleAddFleet} disabled={isShiftLocked}>
                    <Plus size={15} /> Add Fleet Card Slip
                  </button>
                </div>
                {fleetList.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No fleet card slips recorded.
                  </div>
                ) : (
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>Fleet Provider (DriveTrack / HPCL)</th>
                        <th>Slip / Card Reference</th>
                        <th>Terminal Reference</th>
                        <th>Amount (₹)</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fleetList.map((f, i) => (
                        <tr key={i}>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. DriveTrack Plus"
                              value={f.provider_name || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFleetList((prev) => prev.map((item, idx) => idx === i ? { ...item, provider_name: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Slip #"
                              value={f.reference_number || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFleetList((prev) => prev.map((item, idx) => idx === i ? { ...item, reference_number: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Terminal ID"
                              value={f.terminal_or_account_reference || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFleetList((prev) => prev.map((item, idx) => idx === i ? { ...item, terminal_or_account_reference: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              placeholder="0.00"
                              value={f.amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFleetList((prev) => prev.map((item, idx) => idx === i ? { ...item, amount: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost text-danger"
                              onClick={() => setFleetList((prev) => prev.filter((_, idx) => idx !== i))}
                              disabled={isShiftLocked}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab 5: Customer Credit Slips */}
            {activeTab === 'credit' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={handleAddCreditSlip} disabled={isShiftLocked}>
                    <Plus size={15} /> Add Credit Slip
                  </button>
                </div>
                {creditSlipsList.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No customer credit slips entered.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th>Customer *</th>
                          <th>Vehicle #</th>
                          <th>Driver Name</th>
                          <th>Product *</th>
                          <th>Litres (Qty) *</th>
                          <th>Rate (₹)</th>
                          <th>Amount (₹)</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditSlipsList.map((cs, i) => {
                          const q = parseFloat(cs.quantity as string) || 0;
                          const r = parseFloat(cs.unit_price as string) || 0;
                          const amt = q * r;
                          return (
                            <tr key={i}>
                              <td>
                                <select
                                  className="form-control"
                                  value={cs.customer_id}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCreditSlipsList((prev) => prev.map((item, idx) => idx === i ? { ...item, customer_id: val } : item));
                                  }}
                                  disabled={isShiftLocked}
                                >
                                  {prepData?.customers?.map((cust) => (
                                    <option key={cust.id} value={cust.id}>
                                      {cust.name} ({cust.code})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="e.g. KL-07-AB-1234"
                                  value={cs.vehicle_number || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCreditSlipsList((prev) => prev.map((item, idx) => idx === i ? { ...item, vehicle_number: val } : item));
                                  }}
                                  disabled={isShiftLocked}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="Driver"
                                  value={cs.driver_name || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCreditSlipsList((prev) => prev.map((item, idx) => idx === i ? { ...item, driver_name: val } : item));
                                  }}
                                  disabled={isShiftLocked}
                                />
                              </td>
                              <td>
                                <select
                                  className="form-control"
                                  value={cs.product_id}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    // Match unit price
                                    const nz = prepData?.historical_nozzles?.find((n) => n.product_id === val);
                                    setCreditSlipsList((prev) => prev.map((item, idx) => idx === i ? {
                                      ...item,
                                      product_id: val,
                                      unit_price: parseFloat((nz?.current_selling_price ?? item.unit_price) as any) || 0
                                    } : item));
                                  }}
                                  disabled={isShiftLocked}
                                >
                                  {prepData?.historical_nozzles?.map((nz) => (
                                    <option key={nz.product_id} value={nz.product_id}>
                                      {nz.product_name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="form-control"
                                  placeholder="Qty"
                                  value={cs.quantity}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCreditSlipsList((prev) => prev.map((item, idx) => idx === i ? { ...item, quantity: val } : item));
                                  }}
                                  disabled={isShiftLocked}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="form-control"
                                  value={cs.unit_price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCreditSlipsList((prev) => prev.map((item, idx) => idx === i ? { ...item, unit_price: val } : item));
                                  }}
                                  disabled={isShiftLocked}
                                />
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                ₹{amt.toFixed(2)}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost text-danger"
                                  onClick={() => setCreditSlipsList((prev) => prev.filter((_, idx) => idx !== i))}
                                  disabled={isShiftLocked}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 6: Expenses / Deductions */}
            {activeTab === 'expenses' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1e40af',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <HelpCircle size={15} />
                    <span>
                      <strong>Expense Approval Policy:</strong> Expenses entered here default to <strong>Pending</strong> status. They require explicit manager approval via the Manager Approval screen to affect accounted amounts.
                    </span>
                  </div>
                  <button type="button" className="btn btn-sm btn-outline" onClick={handleAddExpense} disabled={isShiftLocked}>
                    <Plus size={15} /> Add Expense Slip
                  </button>
                </div>

                {deductionsList.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No expense slips submitted for this shift card.
                  </div>
                ) : (
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>Expense Description *</th>
                        <th>Payee / Vendor</th>
                        <th>Amount (₹) *</th>
                        <th>Approval Status</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductionsList.map((d, i) => (
                        <tr key={i}>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. Office tea / generator fuel"
                              value={d.description}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDeductionsList((prev) => prev.map((item, idx) => idx === i ? { ...item, description: val } : item));
                              }}
                              disabled={isShiftLocked}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Payee name"
                              value={d.payee || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDeductionsList((prev) => prev.map((item, idx) => idx === i ? { ...item, payee: val } : item));
                              }}
                              disabled={isShiftLocked}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              placeholder="0.00"
                              value={d.amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDeductionsList((prev) => prev.map((item, idx) => idx === i ? { ...item, amount: val } : item));
                              }}
                              disabled={isShiftLocked}
                              required
                            />
                          </td>
                          <td>
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                              Pending Manager Approval
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost text-danger"
                              onClick={() => setDeductionsList((prev) => prev.filter((_, idx) => idx !== i))}
                              disabled={isShiftLocked}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Sticky Summary & Settlement Panel */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          <div className="card" style={{ padding: '1.25rem', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
              Shift Card Summary
            </h3>

            {/* Total Sales Summary */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#475569', marginBottom: '0.35rem' }}>
                <span>Total Net Litres Sold:</span>
                <strong>{totalLitresSold.toFixed(3)} L</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                <span>Expected Sales Value:</span>
                <span style={{ color: 'var(--color-primary, #2563eb)' }}>₹{totalExpectedSaleAmount.toFixed(2)}</span>
              </div>
            </div>

            <hr style={{ border: 0, borderTop: '1px dashed #cbd5e1', margin: '0.75rem 0' }} />

            {/* Total Accounted Breakdown */}
            <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span className="text-muted">Cash:</span>
                <span>₹{effectiveCashAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span className="text-muted">Cards (POS):</span>
                <span>₹{totalCardsAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span className="text-muted">UPI / QR:</span>
                <span>₹{totalUpiAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span className="text-muted">Fleet Cards:</span>
                <span>₹{totalFleetAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span className="text-muted">Credit Slips:</span>
                <span>₹{totalCreditAmount.toFixed(2)}</span>
              </div>
              {totalPendingExpenses > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#b45309' }}>
                  <span>Pending Expenses (Excluded):</span>
                  <span>₹{totalPendingExpenses.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                <span>Total Accounted:</span>
                <span>₹{totalAccountedAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Discrepancy Status Card */}
            {/* Requirement 9: Balanced -> Green, Shortage -> Red, Excess -> Amber/Orange (NEVER GREEN!), Conflict -> Red */}
            <div
              style={{
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                border: '1px solid',
                background:
                  discrepancyType === 'balanced'
                    ? '#ecfdf5'
                    : discrepancyType === 'shortage' || discrepancyType === 'conflict'
                    ? '#fef2f2'
                    : '#fffbeb', // excess -> amber/orange
                borderColor:
                  discrepancyType === 'balanced'
                    ? '#10b981'
                    : discrepancyType === 'shortage' || discrepancyType === 'conflict'
                    ? '#ef4444'
                    : '#f59e0b', // excess -> amber/orange
                color:
                  discrepancyType === 'balanced'
                    ? '#065f46'
                    : discrepancyType === 'shortage' || discrepancyType === 'conflict'
                    ? '#991b1b'
                    : '#92400e'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.9rem' }}>
                  {discrepancyType === 'balanced' && <CheckCircle size={18} />}
                  {(discrepancyType === 'shortage' || discrepancyType === 'conflict') && <AlertTriangle size={18} />}
                  {discrepancyType === 'excess' && <AlertTriangle size={18} />}
                  <span>
                    {discrepancyType === 'balanced' && 'Balanced'}
                    {discrepancyType === 'shortage' && `Shortage: -₹${Math.abs(differenceAmount).toFixed(2)}`}
                    {discrepancyType === 'excess' && `Excess: +₹${differenceAmount.toFixed(2)}`}
                    {discrepancyType === 'conflict' && 'Continuity Conflict'}
                  </span>
                </div>
              </div>
            </div>

            {/* Shortage / Excess Acknowledgement */}
            {Math.abs(differenceAmount) >= 0.01 && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.85rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={isAcknowledged}
                    onChange={(e) => setIsAcknowledged(e.target.checked)}
                    disabled={isShiftLocked}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>
                    I acknowledge this {differenceAmount > 0 ? 'Excess' : 'Shortage'} of ₹{Math.abs(differenceAmount).toFixed(2)}.
                  </span>
                </label>

                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Mandatory explanation for difference..."
                  style={{ fontSize: '0.8rem' }}
                  value={acknowledgementNote}
                  onChange={(e) => setAcknowledgementNote(e.target.value)}
                  disabled={isShiftLocked}
                  required
                />
              </div>
            )}

            {/* General Notes */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem', display: 'block' }}>
                Remarks / Notes
              </label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Optional shift notes..."
                style={{ fontSize: '0.8rem' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isShiftLocked}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSave()}
                disabled={saving || isShiftLocked || !canSave}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.65rem' }}
              >
                <Save size={18} /> {saving ? 'Saving...' : 'Save Shift Card'}
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleSave('next_employee')}
                disabled={saving || isShiftLocked || !canSave}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.65rem' }}
              >
                Save & Next Attendant <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleSave('next_shift')}
                disabled={saving || isShiftLocked || !canSave}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.65rem' }}
              >
                Save & Next Shift <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', padding: '1.5rem', background: '#fff' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#991b1b' }}>
              Void Shift Card
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
              Voiding this card marks it inactive and releases nozzle meter totalizers so a replacement card can be entered. A mandatory audit reason is required.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                Void Reason *
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Reason for voiding this shift card..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowVoidModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleVoidCard}
                disabled={saving || !voidReason.trim()}
              >
                {saving ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
