import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/StatCard';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { PAYMENT_METHOD_LABELS } from '../utils/constants';
import { formatCurrency, formatDateTime, formatDuration } from '../utils/format';
import type { Invoice } from '../types';

type Filter = 'all' | 'paid' | 'unpaid';

export default function BillingPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [payingId, setPayingId] = useState<string | null>(null);

  const { data, loading, refetch } = useAsync(() => dataService.listInvoices(), []);

  const invoices = data ?? [];
  const filtered = useMemo(() => {
    if (filter === 'paid') return invoices.filter((i) => i.paid);
    if (filter === 'unpaid') return invoices.filter((i) => !i.paid);
    return invoices;
  }, [invoices, filter]);

  const totals = useMemo(() => {
    const collected = invoices.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);
    const outstanding = invoices.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0);
    return { collected, outstanding };
  }, [invoices]);

  const handlePay = async (id: string) => {
    setPayingId(id);
    try {
      await dataService.payInvoice(id);
      toast('Invoice marked as paid', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not update invoice'), 'error');
    } finally {
      setPayingId(null);
    }
  };

  return (
    <Layout title="Billing" subtitle="Invoices and payment management">
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <StatCard index={0} icon="✓" label="Collected" value={formatCurrency(totals.collected)} accent="var(--accent-green)" />
        <StatCard index={1} icon="!" label="Outstanding" value={formatCurrency(totals.outstanding)} accent="var(--accent-yellow)" />
        <StatCard index={2} icon="🗂" label="Total Invoices" value={invoices.length} accent="var(--accent-purple)" />
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['all', 'unpaid', 'paid'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={filter === f ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ padding: '8px 14px', fontSize: '13px', textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading invoices…" />
      ) : filtered.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="💳"
            title={filter === 'all' ? 'No invoices yet' : `No ${filter} invoices`}
            description="Invoices are generated automatically when a session ends."
          />
        </div>
      ) : (
        <div className="ccms-card" style={{ overflow: 'hidden' }}>
          <Table
            columns={[
              {
                key: 'device',
                header: 'Device',
                render: (i: Invoice) => <strong>{i.session?.device?.name ?? '—'}</strong>,
              },
              {
                key: 'customer',
                header: 'Customer',
                render: (i: Invoice) => i.session?.customer?.name ?? 'Walk-in',
              },
              {
                key: 'duration',
                header: 'Duration',
                render: (i: Invoice) => formatDuration(i.session?.duration_minutes),
              },
              {
                key: 'issued',
                header: 'Issued',
                render: (i: Invoice) => formatDateTime(i.issued_at),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (i: Invoice) => (
                  <span style={{ fontFamily: 'Audiowide, sans-serif', color: 'var(--text-primary)' }}>
                    {formatCurrency(i.amount)}
                  </span>
                ),
              },
              {
                key: 'method',
                header: 'Method',
                align: 'right',
                render: (i: Invoice) => PAYMENT_METHOD_LABELS[i.payment_method],
              },
              {
                key: 'status',
                header: 'Status',
                align: 'right',
                render: (i: Invoice) =>
                  i.paid ? (
                    <Badge label="Paid" color="var(--accent-green)" bg="rgba(0,255,136,0.1)" />
                  ) : (
                    <Badge label="Unpaid" color="var(--accent-yellow)" bg="rgba(255,170,0,0.1)" />
                  ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (i: Invoice) =>
                  i.paid ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
                  ) : (
                    <Button
                      variant="primary"
                      loading={payingId === i.id}
                      onClick={() => handlePay(i.id)}
                      style={{ padding: '6px 14px', fontSize: '13px' }}
                    >
                      Mark Paid
                    </Button>
                  ),
              },
            ]}
            data={filtered}
            rowKey={(i) => i.id}
          />
        </div>
      )}
    </Layout>
  );
}
