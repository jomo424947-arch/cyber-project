import React, { useState, useMemo, useRef } from 'react';
import { toPng } from 'html-to-image';
import { useLanguage } from '../context/LanguageContext';
import { Button } from './ui/Button';
import { formatCurrency, formatDateTime } from '../utils/format';
import type { ShiftSummary } from '../types';

interface ShiftLedgerTableReportProps {
  summaryData: ShiftSummary;
  onClose?: () => void;
}

export function ShiftLedgerTableReport({ summaryData, onClose }: ShiftLedgerTableReportProps) {
  const { language, isRtl } = useLanguage();
  const reportContainerRef = useRef<HTMLDivElement>(null);
  const [savingImage, setSavingImage] = useState(false);

  // Master section collapse states (default open for Expenses, collapsed for Time/Cafe/Service as in user screenshot, or easily toggled)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    cafe: true,
    expenses: true,
    service: false,
    discount: false,
    time: false,
  });

  // Sub-category collapse states (e.g., 'cafe_مشروبات وانترنت', 'expenses_مرتبات')
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'cafe_مشروبات وانترنت': true,
    'expenses_Expenses': true,
    'expenses_مرتبات': true,
    'expenses_مصروفات': true,
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const toggleCategory = (catKey: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  const expandAll = () => {
    setExpandedSections({ cafe: true, expenses: true, service: true, discount: true, time: true });
    // Expand all category keys
    const allCats: Record<string, boolean> = {};
    Object.keys(reportData.cafeByCategory).forEach((k) => (allCats[`cafe_${k}`] = true));
    Object.keys(reportData.expensesByCategory).forEach((k) => (allCats[`expenses_${k}`] = true));
    Object.keys(reportData.timeByCategory).forEach((k) => (allCats[`time_${k}`] = true));
    setExpandedCategories(allCats);
  };

  const collapseAll = () => {
    setExpandedSections({ cafe: false, expenses: false, service: false, discount: false, time: false });
    setExpandedCategories({});
  };

  const { shift, invoices = [], standalone_orders = [], session_orders = [], expenses = [], session_transfers = [] } = summaryData;

  // Process data strictly categorized according to POS Accounting structure
  const reportData = useMemo(() => {
    // ─── 1. Cafe & Drinks: Grouped by Product with total quantity sold ────────
    const cafeMap: Record<string, {
      id: string;
      category: string;
      name: string;
      date: string;
      qty: number;
      price: number;
      total: number;
      notes: string;
    }> = {};

    const processOrder = (ord: any) => {
      let categoryName = ord.product?.category || '';
      if (!categoryName || categoryName === 'مشروبات' || categoryName === 'Drinks' || categoryName === 'مشروبات ومأكولات') {
        categoryName = language === 'ar' ? 'مشروبات وانترنت' : 'Drinks & Internet';
      }
      const productName = ord.product?.name || (language === 'ar' ? 'صنف بوفيه' : 'Cafe item');
      const qty = Number(ord.quantity || 1);
      const total = Number(ord.total_price || (qty * Number(ord.unit_price || ord.product?.price || 0)));
      const unitPrice = Number(ord.unit_price || ord.product?.price || (qty > 0 ? total / qty : 0));
      const key = `${categoryName}__${productName}`;

      if (!cafeMap[key]) {
        cafeMap[key] = {
          id: `item_${key}`,
          category: categoryName,
          name: productName,
          date: ord.created_at ? formatDateTime(ord.created_at) : '—',
          qty: 0,
          price: unitPrice,
          total: 0,
          notes: '',
        };
      }
      cafeMap[key].qty += qty;
      cafeMap[key].total += total;
      if (cafeMap[key].price === 0 && unitPrice > 0) {
        cafeMap[key].price = unitPrice;
      }
    };

    (standalone_orders || []).forEach(processOrder);
    (session_orders || []).forEach(processOrder);

    const cafeRows = Object.values(cafeMap).map((item) => ({
      ...item,
      price: item.qty > 0 ? Math.round((item.total / item.qty) * 100) / 100 : item.price,
      notes: language === 'ar' ? `إجمالي المبيعات` : `Total sales`,
    }));

    const cafeByCategory: Record<string, typeof cafeRows> = {};
    if (cafeRows.length === 0) {
      cafeByCategory[language === 'ar' ? 'مشروبات وانترنت' : 'Drinks & Internet'] = [];
    } else {
      cafeRows.forEach((r) => {
        if (!cafeByCategory[r.category]) cafeByCategory[r.category] = [];
        cafeByCategory[r.category].push(r);
      });
    }
    const cafeTotal = cafeRows.reduce((acc, r) => acc + r.total, 0);

    // ─── 2. Expenses ───────────────────────────────────────────────────────
    const expenseRows = expenses.map((exp: any) => ({
      id: exp.id,
      category: exp.category || (language === 'ar' ? 'مصروفات' : 'Expenses'),
      name: exp.description || (language === 'ar' ? 'مصروف' : 'Expense'),
      date: exp.created_at ? formatDateTime(exp.created_at) : '—',
      qty: 1,
      price: 0,
      total: Number(exp.amount || 0),
      notes: exp.notes || '',
    }));

    const expensesByCategory: Record<string, typeof expenseRows> = {};
    if (expenseRows.length === 0) {
      expensesByCategory[language === 'ar' ? 'مصروفات' : 'Expenses'] = [];
    } else {
      expenseRows.forEach((r) => {
        const cat = r.category || (language === 'ar' ? 'مصروفات' : 'Expenses');
        if (!expensesByCategory[cat]) expensesByCategory[cat] = [];
        expensesByCategory[cat].push(r);
      });
    }
    const expenseTotal = expenseRows.reduce((acc, r) => acc + r.total, 0);

    // ─── 3. Service & Discounts (Merged) ──────────────────────────────────
    const serviceRows: Array<{
      id: string;
      category: string;
      name: string;
      date: string;
      qty: number;
      price: number;
      total: number;
      notes: string;
    }> = [];

    const adjustmentsRows: Array<{
      id: string;
      category: string;
      name: string;
      date: string;
      qty: number;
      price: number;
      total: number;
      isDeduction: boolean;
      notes: string;
    }> = [];

    let serviceTotal = 0;
    let serviceCount = 0;
    let latestServiceDate = '—';

    invoices.forEach((inv: any) => {
      const sFee = Number(inv.service_fee || 0);
      if (sFee > 0) {
        serviceTotal += sFee;
        serviceCount += 1;
        if (inv.issued_at) {
          latestServiceDate = formatDateTime(inv.issued_at);
        }
      }
    });

    if (serviceCount > 0) {
      const sRow = {
        id: 'service_aggregate',
        category: 'service',
        name: language === 'ar' ? 'رسوم خدمة' : 'Service Fee',
        date: latestServiceDate,
        qty: serviceCount,
        price: Math.round((serviceTotal / serviceCount) * 100) / 100,
        total: serviceTotal,
        isDeduction: false,
        notes: language === 'ar' ? 'إجمالي رسوم الخدمة' : 'Total service fees',
      };
      serviceRows.push(sRow);
      adjustmentsRows.push(sRow);
    }

    // ─── 3.5 Discounts (خصومات الفواتير النهائية) ───────────────────────────
    const discountRows: Array<{
      id: string;
      category: string;
      name: string;
      date: string;
      qty: number;
      price: number;
      total: number;
      isDeduction: boolean;
      notes: string;
    }> = [];

    let discountTotal = 0;
    let discountCount = 0;
    let latestDiscountDate = '—';

    invoices.forEach((inv: any) => {
      const dAmount = Number(inv.discount_amount || 0);
      if (dAmount > 0) {
        discountTotal += dAmount;
        discountCount += 1;
        if (inv.issued_at) {
          latestDiscountDate = formatDateTime(inv.issued_at);
        }
      }
    });

    if (discountCount > 0) {
      const dRow = {
        id: 'discount_aggregate',
        category: 'Discount',
        name: language === 'ar' ? 'خصم فاتورة' : 'Invoice Discount',
        date: latestDiscountDate,
        qty: discountCount,
        price: Math.round((discountTotal / discountCount) * 100) / 100,
        total: discountTotal,
        isDeduction: true,
        notes: language === 'ar' ? 'إجمالي الخصم' : 'Total discounts',
      };
      discountRows.push(dRow);
      adjustmentsRows.push(dRow);
    }

    const adjustmentsNetTotal = serviceTotal - discountTotal;

    // ─── 4. Time (Gaming Sessions) ─────────────────────────────────────────
    const sessionCafeMap: Record<string, number> = {};
    (session_orders || []).forEach((ord: any) => {
      const sId = ord.session_id || ord.session?.id;
      if (sId) {
        sessionCafeMap[sId] = (sessionCafeMap[sId] || 0) + Number(ord.total_price || 0);
      }
    });

    const timeRows = invoices.map((inv: any) => {
      const session = inv.session;
      const sId = inv.session_id || session?.id;

      // Check if this session was transferred from another device
      const sessionTransfers = (session_transfers || [])
        .filter((tr: any) => tr.session_id === sId)
        .sort((a: any, b: any) => new Date(a.started_at || a.created_at).getTime() - new Date(b.started_at || b.created_at).getTime());

      // The device the session started with:
      const initialDevice = sessionTransfers.length > 0 && sessionTransfers[0].from_device
        ? sessionTransfers[0].from_device
        : session?.device;

      const currentDevice = session?.device;

      const startDeviceName = initialDevice?.name || currentDevice?.name || (language === 'ar' ? 'جهاز' : 'Station');
      const currentDeviceName = currentDevice?.name;

      const hasTransfer = sessionTransfers.length > 0 && currentDeviceName && currentDeviceName !== startDeviceName;

      // Category based on starting device (or current)
      const devType = initialDevice?.type || currentDevice?.type;
      const deviceType = devType === 'pc' ? 'PC'
        : devType === 'table' ? (language === 'ar' ? 'بلياردو' : 'Billiards')
        : devType === 'vr' ? 'VR'
        : 'Console';

      const durationMins = session?.duration_minutes || 0;
      const invAmount = Number(inv.amount || 0);
      const serviceFee = Number(inv.service_fee || 0);
      const sessionCafeCost = sId ? (sessionCafeMap[sId] || 0) : 0;
      const baseSubtotal = inv.subtotal !== undefined && inv.subtotal !== null
        ? Number(inv.subtotal)
        : Math.max(0, invAmount - serviceFee);
      const pureTimeCost = Math.max(0, Math.round((baseSubtotal - sessionCafeCost) * 100) / 100);

      // Display name:
      // If transferred: show starting device -> current device
      // Otherwise: show starting device name only (without customer name)
      const displayName = hasTransfer
        ? `${startDeviceName} ➔ ${currentDeviceName}`
        : startDeviceName;

      const transferNote = hasTransfer
        ? (language === 'ar' ? `بدأ بـ ${startDeviceName} وتم التحويل إلى ${currentDeviceName}` : `Started on ${startDeviceName}, transferred to ${currentDeviceName}`)
        : '';

      const baseNote = inv.notes || (inv.paid ? (language === 'ar' ? 'مدفوعة' : 'Paid') : (language === 'ar' ? 'معلقة' : 'Pending'));
      const finalNote = transferNote ? `${baseNote} | ${transferNote}` : baseNote;

      return {
        id: inv.id,
        category: deviceType,
        name: displayName,
        date: inv.issued_at ? formatDateTime(inv.issued_at) : '—',
        qty: durationMins,
        price: pureTimeCost,
        total: pureTimeCost,
        notes: finalNote,
      };
    });

    const timeByCategory: Record<string, typeof timeRows> = {};
    if (timeRows.length === 0) {
      timeByCategory['Time'] = [];
    } else {
      timeRows.forEach((r) => {
        if (!timeByCategory[r.category]) timeByCategory[r.category] = [];
        timeByCategory[r.category].push(r);
      });
    }
    const timeTotal = timeRows.reduce((acc, r) => acc + r.total, 0);

    // ─── Net Operations Total ──────────────────────────────────────────────
    const netOperationsTotal = (timeTotal + cafeTotal + serviceTotal) - expenseTotal - discountTotal;

    return {
      cafeByCategory,
      cafeRows,
      cafeTotal,
      expensesByCategory,
      expenseRows,
      expenseTotal,
      serviceRows,
      serviceTotal,
      discountRows,
      discountTotal,
      adjustmentsRows,
      adjustmentsNetTotal,
      timeByCategory,
      timeRows,
      timeTotal,
      netOperationsTotal,
    };
  }, [invoices, standalone_orders, session_orders, expenses, session_transfers, shift, language]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    let csv = `\uFEFFالمستند,التصنيف,التاريخ,البيان,الكميه,السعر,القيمه,ملاحظة\n`;

    // Cafe
    Object.entries(reportData.cafeByCategory).forEach(([cat, rows]) => {
      rows.forEach((r) => {
        csv += `Cafe,"${cat}","${r.date}","${r.name}",${r.qty},${r.price.toFixed(2)},"${r.total.toFixed(2)}","${r.notes}"\n`;
      });
    });
    csv += `Cafe,Total,,,,,"${reportData.cafeTotal.toFixed(2)}",\n`;

    // Expenses
    Object.entries(reportData.expensesByCategory).forEach(([cat, rows]) => {
      rows.forEach((r) => {
        csv += `Expenses,"${cat}","${r.date}","${r.name}",${r.qty},${r.price.toFixed(2)},"-${r.total.toFixed(2)}","${r.notes}"\n`;
      });
    });
    csv += `Expenses,Total,,,,,"-${reportData.expenseTotal.toFixed(2)}",\n`;

    // Service & Discounts (Merged)
    if (reportData.adjustmentsRows.length > 0) {
      reportData.adjustmentsRows.forEach((r) => {
        const val = r.isDeduction ? `-${r.total.toFixed(2)}` : `${r.total.toFixed(2)}`;
        csv += `service,"${r.category}","${r.date}","${r.name}",${r.qty},${r.price.toFixed(2)},"${val}","${r.notes}"\n`;
      });
      csv += `service,Total,,,,,"${reportData.adjustmentsNetTotal.toFixed(2)}",\n`;
    }

    // Time
    Object.entries(reportData.timeByCategory).forEach(([cat, rows]) => {
      rows.forEach((r) => {
        csv += `Time,"${cat}","${r.date}","${r.name}",${r.qty},${r.price.toFixed(2)},"${r.total.toFixed(2)}","${r.notes}"\n`;
      });
    });
    csv += `Time,Total,,,,,"${reportData.timeTotal.toFixed(2)}",\n`;

    // Net Total
    csv += `Total,Total,,,,,"${reportData.netOperationsTotal.toFixed(2)}",\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Shift_Report_${shift.id?.substring(0, 8)}.csv`;
    link.click();
  };

  const handleSaveImage = async () => {
    if (!reportContainerRef.current) return;
    setSavingImage(true);
    try {
      const dataUrl = await toPng(reportContainerRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (node instanceof HTMLElement && node.classList.contains('no-export-image')) {
            return false;
          }
          return true;
        },
      });

      const link = document.createElement('a');
      link.download = `تقرير_العمليات_${shift.id?.substring(0, 8) || 'shift'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export report image:', err);
    } finally {
      setSavingImage(false);
    }
  };

  // Reusable square +/- toggle button matching the image
  const renderSquareToggle = (isExpanded: boolean, onClick: () => void) => (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '13px',
        height: '13px',
        border: '1px solid #000000',
        background: '#ffffff',
        color: '#000000',
        fontSize: '11px',
        fontWeight: 900,
        lineHeight: 1,
        cursor: 'pointer',
        userSelect: 'none',
        marginLeft: isRtl ? '6px' : '2px',
        marginRight: isRtl ? '2px' : '6px',
        verticalAlign: 'middle',
      }}
    >
      {isExpanded ? '–' : '+'}
    </span>
  );

  return (
    <div
      ref={reportContainerRef}
      className="shift-ledger-page-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        direction: isRtl ? 'rtl' : 'ltr',
        background: '#ffffff',
        color: '#000000',
        padding: '16px 20px',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        fontFamily: 'Cairo, Tahoma, Arial, sans-serif',
      }}
    >
      {/* ── Top Header Controls & Title ─────────────────────────────── */}
      <div className="no-export-image" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={expandAll}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              border: '1px solid #94a3b8',
              background: '#f8fafc',
              color: '#0f172a',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {language === 'ar' ? 'توسيع الكل [+]' : 'Expand All [+]'}
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              border: '1px solid #94a3b8',
              background: '#f8fafc',
              color: '#0f172a',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {language === 'ar' ? 'طي الكل [-]' : 'Collapse All [-]'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={handleSaveImage}
            disabled={savingImage}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              border: '1px solid #7c3aed',
              background: '#f5f3ff',
              color: '#7c3aed',
              borderRadius: '4px',
              cursor: savingImage ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>image</span>
            {savingImage
              ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
              : (language === 'ar' ? 'حفظ ك صورة' : 'Save Image')}
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              border: '1px solid #16a34a',
              background: '#f0fdf4',
              color: '#16a34a',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>download</span>
            {language === 'ar' ? 'تصدير Excel' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              border: '1px solid #0284c7',
              background: '#f0f9ff',
              color: '#0284c7',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>print</span>
            {language === 'ar' ? 'طباعة الكشف' : 'Print Ledger'}
          </button>
        </div>
      </div>

      {/* ── Document Title ─────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', margin: '4px 0 10px 0' }}>
        <h1
          style={{
            margin: '0 0 4px 0',
            fontSize: '24px',
            fontWeight: 900,
            color: '#000000',
            letterSpacing: '0.5px',
            fontFamily: 'Cairo, Tahoma, Arial, sans-serif',
          }}
        >
          {language === 'ar' ? 'تقرير جميع العمليات' : 'All Operations Report'}
        </h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', fontSize: '12px', color: '#475569' }}>
          <span>
            <strong>{language === 'ar' ? 'الموظف: ' : 'Staff: '}</strong>
            {shift.user?.full_name || shift.user?.email || 'المسؤول'}
          </span>
          <span>
            <strong>{language === 'ar' ? 'بداية الوردية: ' : 'Started: '}</strong>
            {new Date(shift.started_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)}
          </span>
          {shift.ended_at ? (
            <span>
              <strong>{language === 'ar' ? 'نهاية الوردية: ' : 'Ended: '}</strong>
              {new Date(shift.ended_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)}
            </span>
          ) : (
            <span style={{ color: '#16a34a', fontWeight: 700 }}>
              {language === 'ar' ? '(وردية نشطة حالياً)' : '(Active Shift)'}
            </span>
          )}
        </div>
      </div>

      {/* ── The Accounting Ledger Grid Table (Exact Match to Image) ─── */}
      <div style={{ overflowX: 'auto', border: '1.5px solid #000000' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            fontFamily: 'Cairo, Tahoma, Arial, sans-serif',
            color: '#000000',
            background: '#ffffff',
            textAlign: isRtl ? 'right' : 'left',
          }}
        >
          <thead>
            <tr
              style={{
                background: '#e2e8f0',
                borderBottom: '1.5px solid #000000',
                fontWeight: 900,
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '90px' }}>
                {language === 'ar' ? 'المستند' : 'Document'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '120px' }}>
                {language === 'ar' ? 'التصنيف' : 'Category'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '130px' }}>
                {language === 'ar' ? 'التاريخ' : 'Date'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px' }}>
                {language === 'ar' ? 'البيان' : 'Description'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '70px', textAlign: 'center' }}>
                {language === 'ar' ? 'الكميه' : 'Qty'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '70px', textAlign: 'center' }}>
                {language === 'ar' ? 'السعر' : 'Price'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '95px', textAlign: 'center' }}>
                {language === 'ar' ? 'القيمه' : 'Amount'}
              </th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '110px' }}>
                {language === 'ar' ? 'ملاحظة' : 'Note'}
              </th>
            </tr>
          </thead>
          <tbody>

            {/* ═══════════════════════════════════════════════════════════════
                1. CAFE SECTION
            ════════════════════════════════════════════════════════════════ */}
            {(() => {
              const isSectionExpanded = expandedSections['cafe'];
              const categories = Object.entries(reportData.cafeByCategory);

              if (!isSectionExpanded) {
                // Collapsed single row
                return (
                  <tr style={{ borderBottom: '1px solid #000000', background: '#ffffff' }}>
                    <td
                      style={{
                        border: '1px solid #000000',
                        padding: '6px 8px',
                        fontWeight: 900,
                        color: '#15803d',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {renderSquareToggle(false, () => toggleSection('cafe'))}
                        <span>Cafe</span>
                      </div>
                    </td>
                    <td colSpan={5} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800, background: '#a6c8e0' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 900, color: '#15803d', background: '#a6c8e0' }}>
                      {reportData.cafeTotal.toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                );
              }

              // Calculate total rows for rowSpan
              let totalCafeRows = 1; // for the subtotal row
              categories.forEach(([catName, items]) => {
                const isCatExpanded = expandedCategories[`cafe_${catName}`];
                if (!isCatExpanded || items.length === 0) {
                  totalCafeRows += 1;
                } else {
                  totalCafeRows += items.length;
                }
              });

              let isFirstRowOfCafe = true;

              return (
                <>
                  {categories.map(([catName, items]) => {
                    const isCatExpanded = expandedCategories[`cafe_${catName}`];
                    const catTotal = items.reduce((sum, it) => sum + it.total, 0);

                    if (!isCatExpanded || items.length === 0) {
                      // Category is collapsed (shows [+] Category and total amount in القيمه)
                      const renderMasterCell = isFirstRowOfCafe;
                      isFirstRowOfCafe = false;

                      return (
                        <tr key={catName} style={{ borderBottom: '1px solid #000000' }}>
                          {renderMasterCell && (
                            <td
                              rowSpan={totalCafeRows}
                              style={{
                                border: '1px solid #000000',
                                padding: '6px 8px',
                                fontWeight: 900,
                                color: '#15803d',
                                verticalAlign: 'top',
                                textAlign: 'center',
                                background: '#ffffff',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {renderSquareToggle(true, () => toggleSection('cafe'))}
                                <span>Cafe</span>
                              </div>
                            </td>
                          )}

                          {/* Category Cell with [+] button */}
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800 }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {renderSquareToggle(false, () => toggleCategory(`cafe_${catName}`))}
                              <span>{catName}</span>
                            </div>
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 900, color: '#15803d' }}>
                            {catTotal.toFixed(2)}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                        </tr>
                      );
                    }

                    // Category is expanded (unfolds item rows)
                    return items.map((item, itemIdx) => {
                      const renderMasterCell = isFirstRowOfCafe;
                      isFirstRowOfCafe = false;

                      return (
                        <tr key={item.id || itemIdx} style={{ borderBottom: '1px solid #000000' }}>
                          {renderMasterCell && (
                            <td
                              rowSpan={totalCafeRows}
                              style={{
                                border: '1px solid #000000',
                                padding: '6px 8px',
                                fontWeight: 900,
                                color: '#15803d',
                                verticalAlign: 'top',
                                textAlign: 'center',
                                background: '#ffffff',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {renderSquareToggle(true, () => toggleSection('cafe'))}
                                <span>Cafe</span>
                              </div>
                            </td>
                          )}

                          {itemIdx === 0 && (
                            <td
                              rowSpan={items.length}
                              style={{
                                border: '1px solid #000000',
                                padding: '6px 8px',
                                fontWeight: 800,
                                verticalAlign: 'top',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                {renderSquareToggle(true, () => toggleCategory(`cafe_${catName}`))}
                                <span>{catName}</span>
                              </div>
                            </td>
                          )}

                          <td style={{ border: '1px solid #000000', padding: '6px 8px', fontSize: '11px' }}>{item.date}</td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>{item.name}</td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>{item.price.toFixed(2)}</td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: '#15803d' }}>
                            {item.total.toFixed(2)}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>{item.notes}</td>
                        </tr>
                      );
                    });
                  })}

                  {/* Cafe Subtotal Bar (Periwinkle Blue exactly like Image) */}
                  <tr style={{ background: '#a6c8e0', borderBottom: '1.5px solid #000000', fontWeight: 900 }}>
                    <td colSpan={5} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: '#15803d', fontWeight: 900 }}>
                      {reportData.cafeTotal.toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                </>
              );
            })()}


            {/* ═══════════════════════════════════════════════════════════════
                2. EXPENSES SECTION
            ════════════════════════════════════════════════════════════════ */}
            {(() => {
              const isSectionExpanded = expandedSections['expenses'];
              const categories = Object.entries(reportData.expensesByCategory);

              if (!isSectionExpanded) {
                // Collapsed single row
                return (
                  <tr style={{ borderBottom: '1px solid #000000', background: '#ffffff' }}>
                    <td
                      style={{
                        border: '1px solid #000000',
                        padding: '6px 8px',
                        fontWeight: 900,
                        color: '#dc2626',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {renderSquareToggle(false, () => toggleSection('expenses'))}
                        <span>Expenses</span>
                      </div>
                    </td>
                    <td colSpan={5} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800, background: '#a6c8e0' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 900, color: '#dc2626', background: '#a6c8e0' }}>
                      ({reportData.expenseTotal.toFixed(2)})
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                );
              }

              // Calculate total rows for rowSpan (including sub-subtotals if present + subtotal row)
              let totalExpenseRows = 1; // for the section total row
              categories.forEach(([catName, items]) => {
                const isCatExpanded = expandedCategories[`expenses_${catName}`] ?? true;
                if (!isCatExpanded || items.length === 0) {
                  totalExpenseRows += 1;
                } else {
                  totalExpenseRows += items.length + (items.length > 1 ? 1 : 0);
                }
              });

              let isFirstRowOfExpenses = true;

              return (
                <>
                  {categories.map(([catName, items]) => {
                    const isCatExpanded = expandedCategories[`expenses_${catName}`] ?? true;
                    const catTotal = items.reduce((sum, it) => sum + it.total, 0);

                    if (!isCatExpanded || items.length === 0) {
                      const renderMasterCell = isFirstRowOfExpenses;
                      isFirstRowOfExpenses = false;

                      return (
                        <tr key={catName} style={{ borderBottom: '1px solid #000000' }}>
                          {renderMasterCell && (
                            <td
                              rowSpan={totalExpenseRows}
                              style={{
                                border: '1px solid #000000',
                                padding: '6px 8px',
                                fontWeight: 900,
                                color: '#dc2626',
                                verticalAlign: 'top',
                                textAlign: 'center',
                                background: '#ffffff',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {renderSquareToggle(true, () => toggleSection('expenses'))}
                                <span>Expenses</span>
                              </div>
                            </td>
                          )}

                          <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800 }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {renderSquareToggle(false, () => toggleCategory(`expenses_${catName}`))}
                              <span>{catName}</span>
                            </div>
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 900, color: '#dc2626' }}>
                            ({catTotal.toFixed(2)})
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                        </tr>
                      );
                    }

                    // Expanded rows
                    return (
                      <React.Fragment key={catName}>
                        {items.map((exp, expIdx) => {
                          const renderMasterCell = isFirstRowOfExpenses;
                          isFirstRowOfExpenses = false;

                          return (
                            <tr key={exp.id || expIdx} style={{ borderBottom: '1px solid #000000' }}>
                              {renderMasterCell && (
                                <td
                                  rowSpan={totalExpenseRows}
                                  style={{
                                    border: '1px solid #000000',
                                    padding: '6px 8px',
                                    fontWeight: 900,
                                    color: '#dc2626',
                                    verticalAlign: 'top',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    {renderSquareToggle(true, () => toggleSection('expenses'))}
                                    <span>Expenses</span>
                                  </div>
                                </td>
                              )}

                              {expIdx === 0 && (
                                <td
                                  rowSpan={items.length + (items.length > 1 ? 1 : 0)}
                                  style={{
                                    border: '1px solid #000000',
                                    padding: '6px 8px',
                                    fontWeight: 800,
                                    verticalAlign: 'top',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {renderSquareToggle(true, () => toggleCategory(`expenses_${catName}`))}
                                    <span>{catName}</span>
                                  </div>
                                </td>
                              )}

                              <td style={{ border: '1px solid #000000', padding: '6px 8px', fontSize: '11px', textAlign: 'center' }}>
                                {exp.date}
                              </td>
                              <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                                {exp.name}
                              </td>
                              <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                                {exp.qty}
                              </td>
                              <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                                {exp.price}
                              </td>
                              <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: '#dc2626' }}>
                                ({exp.total.toFixed(2)})
                              </td>
                              <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>
                                {exp.notes}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Sub-subtotal for category if multiple items */}
                        {items.length > 1 && (
                          <tr style={{ borderBottom: '1px solid #000000', fontWeight: 800 }}>
                            <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                            <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                            <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                            <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                            <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>
                              ({catTotal.toFixed(2)})
                            </td>
                            <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Expenses Subtotal Bar (Periwinkle Blue) */}
                  <tr style={{ background: '#a6c8e0', borderBottom: '1.5px solid #000000', fontWeight: 900 }}>
                    <td colSpan={5} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>
                      ({reportData.expenseTotal.toFixed(2)})
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                </>
              );
            })()}


            {/* ═══════════════════════════════════════════════════════════════
                3. SERVICE & DISCOUNT SECTION (Merged in 1 compact section)
            ════════════════════════════════════════════════════════════════ */}
            {(() => {
              if (reportData.adjustmentsRows.length === 0) {
                return null;
              }
              const isSectionExpanded = expandedSections['service'];

              if (!isSectionExpanded) {
                return (
                  <tr style={{ background: '#a6c8e0', borderBottom: '1px solid #000000', fontWeight: 800 }}>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', color: '#0284c7', textAlign: 'center', fontWeight: 900 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {renderSquareToggle(false, () => toggleSection('service'))}
                        <span>service</span>
                      </div>
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800 }}>Total</td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: reportData.adjustmentsNetTotal >= 0 ? '#0284c7' : '#e11d48', fontWeight: 900 }}>
                      {reportData.adjustmentsNetTotal >= 0
                        ? reportData.adjustmentsNetTotal.toFixed(2)
                        : `(${Math.abs(reportData.adjustmentsNetTotal).toFixed(2)})`}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                );
              }

              return (
                <>
                  {reportData.adjustmentsRows.map((row, idx) => (
                    <tr key={row.id || idx} style={{ borderBottom: '1px solid #000000' }}>
                      {idx === 0 && (
                        <td
                          rowSpan={reportData.adjustmentsRows.length + 1}
                          style={{
                            border: '1px solid #000000',
                            padding: '6px 8px',
                            fontWeight: 900,
                            color: '#0284c7',
                            verticalAlign: 'top',
                            textAlign: 'center',
                            background: '#ffffff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {renderSquareToggle(true, () => toggleSection('service'))}
                            <span>service</span>
                          </div>
                        </td>
                      )}
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 700, color: row.isDeduction ? '#e11d48' : '#0284c7' }}>
                        {row.category}
                      </td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', fontSize: '11px' }}>{row.date}</td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>{row.name}</td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>{row.qty}</td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>{row.price.toFixed(2)}</td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: row.isDeduction ? '#e11d48' : '#0284c7' }}>
                        {row.isDeduction ? `(${row.total.toFixed(2)})` : row.total.toFixed(2)}
                      </td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>{row.notes}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#a6c8e0', borderBottom: '1.5px solid #000000', fontWeight: 900 }}>
                    <td colSpan={5} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: reportData.adjustmentsNetTotal >= 0 ? '#0284c7' : '#e11d48', fontWeight: 900 }}>
                      {reportData.adjustmentsNetTotal >= 0
                        ? reportData.adjustmentsNetTotal.toFixed(2)
                        : `(${Math.abs(reportData.adjustmentsNetTotal).toFixed(2)})`}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                </>
              );
            })()}


            {/* ═══════════════════════════════════════════════════════════════
                4. TIME SECTION (Gaming Sessions)
            ════════════════════════════════════════════════════════════════ */}
            {(() => {
              const isSectionExpanded = expandedSections['time'];

              if (!isSectionExpanded) {
                return (
                  <tr style={{ background: '#a6c8e0', borderBottom: '1.5px solid #000000', fontWeight: 800 }}>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', color: '#0d9488', textAlign: 'center', fontWeight: 900 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {renderSquareToggle(false, () => toggleSection('time'))}
                        <span>Time</span>
                      </div>
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800 }}>Total</td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: '#0d9488', fontWeight: 900 }}>
                      {reportData.timeTotal.toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                );
              }

              return (
                <>
                  {reportData.timeRows.length === 0 ? (
                    <tr style={{ borderBottom: '1px solid #000000' }}>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', color: '#0d9488', fontWeight: 900 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          {renderSquareToggle(true, () => toggleSection('time'))}
                          <span>Time</span>
                        </div>
                      </td>
                      <td colSpan={7} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>
                        {language === 'ar' ? 'لا توجد جلسات ألعاب مسجلة' : 'No gaming sessions'}
                      </td>
                    </tr>
                  ) : (
                    reportData.timeRows.map((row, idx) => (
                      <tr key={row.id || idx} style={{ borderBottom: '1px solid #000000' }}>
                        {idx === 0 && (
                          <td
                            rowSpan={reportData.timeRows.length + 1}
                            style={{
                              border: '1px solid #000000',
                              padding: '6px 8px',
                              fontWeight: 900,
                              color: '#0d9488',
                              verticalAlign: 'top',
                              textAlign: 'center',
                              background: '#ffffff',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              {renderSquareToggle(true, () => toggleSection('time'))}
                              <span>Time</span>
                            </div>
                          </td>
                        )}
                        <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 700 }}>{row.category}</td>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px', fontSize: '11px' }}>{row.date}</td>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>{row.name}</td>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>{row.qty} د</td>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>—</td>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: '#0d9488' }}>
                          {row.total.toFixed(2)}
                        </td>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px' }}>{row.notes}</td>
                      </tr>
                    ))
                  )}

                  <tr style={{ background: '#a6c8e0', borderBottom: '1.5px solid #000000', fontWeight: 900 }}>
                    <td colSpan={5} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', color: '#0d9488', fontWeight: 900 }}>
                      {reportData.timeTotal.toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px' }}></td>
                  </tr>
                </>
              );
            })()}


            {/* ═══════════════════════════════════════════════════════════════
                5. OVERALL GRAND TOTAL ROW (Grey exactly like Image)
            ════════════════════════════════════════════════════════════════ */}
            <tr
              style={{
                background: '#cfd8dc',
                borderTop: '2px solid #000000',
                borderBottom: '2px solid #000000',
                fontWeight: 900,
                fontSize: '13px',
              }}
            >
              <td style={{ border: '1px solid #000000', padding: '8px 6px' }}></td>
              <td style={{ border: '1px solid #000000', padding: '8px 6px' }}></td>
              <td style={{ border: '1px solid #000000', padding: '8px 6px' }}></td>
              <td style={{ border: '1px solid #000000', padding: '8px 6px', textAlign: 'center', fontWeight: 900 }}>
                Total
              </td>
              <td style={{ border: '1px solid #000000', padding: '8px 6px' }}></td>
              <td style={{ border: '1px solid #000000', padding: '8px 6px' }}></td>
              <td
                style={{
                  border: '1px solid #000000',
                  padding: '8px 6px',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: '14px',
                  color: reportData.netOperationsTotal >= 0 ? '#15803d' : '#dc2626',
                }}
              >
                {reportData.netOperationsTotal.toFixed(2)}
              </td>
              <td style={{ border: '1px solid #000000', padding: '8px 6px' }}></td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* ── Cash Drawer Reconciliation Card (مطابقة الدرج والعهدة) ─── */}
      <div
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          background: '#f8fafc',
          padding: '12px 16px',
          marginTop: '6px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          fontSize: '12px',
          color: '#0f172a',
        }}
      >
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
            {language === 'ar' ? 'العهدة الافتتاحية (+):' : 'Opening Float (+):'}
          </span>
          <strong style={{ color: '#0284c7', fontSize: '15px' }}>
            {formatCurrency(summaryData.opening_cash)}
          </strong>
        </div>

        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
            {language === 'ar' ? 'صافي حركات الوردية (+/-):' : 'Net Operations (+/-):'}
          </span>
          <strong style={{ color: reportData.netOperationsTotal >= 0 ? '#16a34a' : '#dc2626', fontSize: '15px' }}>
            {formatCurrency(reportData.netOperationsTotal)}
          </strong>
        </div>

        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
            {language === 'ar' ? 'المبلغ المفترض بالدرج (=):' : 'Expected In Drawer (=):'}
          </span>
          <strong style={{ color: '#0f172a', fontSize: '16px', fontWeight: 900 }}>
            {formatCurrency(summaryData.expected_closing)}
          </strong>
        </div>

        {summaryData.closing_cash !== null && summaryData.closing_cash !== undefined && (
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
              {language === 'ar' ? 'الفعلي المسلم (التسوية):' : 'Actual Handover:'}
            </span>
            <strong style={{ color: summaryData.cash_difference === 0 ? '#16a34a' : '#d97706', fontSize: '15px' }}>
              {formatCurrency(summaryData.closing_cash)} {summaryData.cash_difference !== null && summaryData.cash_difference !== 0 && `(${summaryData.cash_difference > 0 ? '+' : ''}${formatCurrency(summaryData.cash_difference)})`}
            </strong>
          </div>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <div className="no-export-image" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <Button variant="primary" onClick={onClose} style={{ fontSize: '12px', minWidth: '90px' }}>
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </Button>
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .shift-ledger-page-container {
            box-shadow: none !important;
            padding: 0 !important;
          }
          .shift-ledger-page-container button {
            display: none !important;
          }
          .shift-ledger-page-container table {
            border: 1.5px solid #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}
