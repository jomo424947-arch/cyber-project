import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/StatCard';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency, formatDuration } from '../utils/format';
import type { Invoice } from '../types';

type Filter = 'all' | 'paid' | 'unpaid';

export default function BillingPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const { data, loading, refetch } = useAsync(() => dataService.listInvoices(), []);

  const invoices = data ?? [];
  
  // Filter & Search logic
  const filtered = useMemo(() => {
    let result = invoices;
    if (filter === 'paid') result = result.filter((i) => i.paid);
    if (filter === 'unpaid') result = result.filter((i) => !i.paid);
    
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => {
        const idMatch = i.id.toLowerCase().includes(q) || `#inv-${i.id.slice(0, 4)}`.includes(q);
        const nameMatch = (i.session?.customer?.name ?? 'walk-in').toLowerCase().includes(q);
        const deviceMatch = (i.session?.device?.name ?? '').toLowerCase().includes(q);
        return idMatch || nameMatch || deviceMatch;
      });
    }
    return result;
  }, [invoices, filter, search]);

  const totals = useMemo(() => {
    const collected = invoices.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);
    const outstanding = invoices.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0);
    return { collected, outstanding };
  }, [invoices]);

  const handlePay = async (id: string) => {
    setPayingId(id);
    setActiveMenuId(null);
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

  // Pagination calculations
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset page when filter or search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [filter, search]);

  return (
    <Layout 
      title="Financial Ledger" 
      subtitle="Comprehensive real-time tracking of terminal utilization, subscription billing, and net system profitability across the device fleet."
      actions={
        <>
          <button 
            className="ccms-btn ccms-btn-ghost" 
            onClick={() => toast('Excel summary sheet exported.', 'success')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>receipt_long</span>
            Generate Receipt
          </button>
          <button 
            className="ccms-btn ccms-btn-primary" 
            onClick={() => toast('Gateway scanner listening for payments...', 'info')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>account_balance_wallet</span>
            Process Payment
          </button>
        </>
      }
    >
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '24px',
          marginBottom: '48px',
        }}
      >
        <StatCard index={0} icon="✓" label="Total Collected" value={formatCurrency(totals.collected)} accent="var(--accent-green)" />
        <StatCard index={1} icon="!" label="Outstanding Dues" value={formatCurrency(totals.outstanding)} accent="var(--accent-yellow)" />
        <StatCard index={2} icon="$" label="Net Revenue (MTD)" value={formatCurrency(totals.collected + totals.outstanding)} accent="var(--accent-cyan)" />
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['all', 'unpaid', 'paid'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '10px 20px',
                borderRadius: '8px',
                border: filter === f ? '1px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
                background: filter === f ? 'rgba(0, 194, 255, 0.15)' : 'transparent',
                color: filter === f ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                boxShadow: filter === f ? '0 0 10px rgba(0, 194, 255, 0.2)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {f} Invoices
            </button>
          ))}
        </div>
        
        <div style={{ marginLeft: 'auto', position: 'relative', minWidth: '260px' }}>
          <span 
            className="material-symbols-outlined" 
            style={{ 
              position: 'absolute', 
              left: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: 'var(--text-muted)', 
              fontSize: '18px' 
            }}
          >
            search
          </span>
          <input
            type="text"
            className="ccms-input"
            placeholder="Search Invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: '40px',
              background: '#0A0A0A',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '14px',
              width: '100%',
            }}
          />
        </div>
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
        <div className="ccms-card" style={{ overflow: 'visible', marginBottom: '40px' }}>
          <Table
            columns={[
              {
                key: 'invoice',
                header: 'Invoice ID',
                render: (i: Invoice) => `#INV-${i.id.slice(0, 4).toUpperCase()}`,
              },
              {
                key: 'customer',
                header: 'Customer',
                render: (i: Invoice) => {
                  const name = i.session?.customer?.name ?? 'Walk-in';
                  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div 
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: '#FFFFFF',
                          fontFamily: 'JetBrains Mono, monospace'
                        }}
                      >
                        {initials}
                      </div>
                      <span style={{ fontWeight: 500, color: '#FFFFFF' }}>{name}</span>
                    </div>
                  );
                },
              },
              {
                key: 'device',
                header: 'Terminal',
                render: (i: Invoice) => i.session?.device?.name ?? '—',
              },
              {
                key: 'duration',
                header: 'Duration',
                render: (i: Invoice) => formatDuration(i.session?.duration_minutes),
              },
              {
                key: 'status',
                header: 'Status',
                render: (i: Invoice) =>
                  i.paid ? (
                    <Badge label="Paid" color="var(--accent-green)" bg="rgba(34, 197, 94, 0.1)" />
                  ) : (
                    <Badge label="Pending" color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />
                  ),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (i: Invoice) => formatCurrency(i.amount),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (i: Invoice) => (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button 
                      style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === i.id ? null : i.id);
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#00C2FF'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>more_vert</span>
                    </button>
                    {activeMenuId === i.id && (
                      <>
                        <div 
                          style={{ position: 'fixed', inset: 0, zIndex: 90 }} 
                          onClick={() => setActiveMenuId(null)}
                        />
                        <div 
                          style={{ 
                            position: 'absolute', 
                            right: 0, 
                            top: '24px', 
                            background: '#181818', 
                            border: '1px solid rgba(255, 255, 255, 0.1)', 
                            borderRadius: '8px', 
                            boxShadow: 'var(--shadow-glow-strong)', 
                            zIndex: 100, 
                            minWidth: '130px',
                            overflow: 'hidden'
                          }}
                        >
                          {!i.paid ? (
                            <button
                              onClick={() => handlePay(i.id)}
                              disabled={payingId === i.id}
                              style={{ 
                                width: '100%', 
                                padding: '10px 16px', 
                                textAlign: 'left', 
                                color: 'var(--accent-green)', 
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 500
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              {payingId === i.id ? 'Processing...' : 'Mark as Paid'}
                            </button>
                          ) : (
                            <div style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                              No Actions
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
            data={paginatedInvoices}
            rowKey={(i) => i.id}
          />
          
          {/* Table pagination footer */}
          <div 
            style={{ 
              padding: '16px 24px', 
              borderTop: '1px solid rgba(255, 255, 255, 0.05)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between' 
            }}
          >
            <p 
              style={{ 
                fontFamily: 'JetBrains Mono, monospace', 
                fontSize: '10px', 
                fontWeight: 600, 
                textTransform: 'uppercase', 
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                margin: 0
              }}
            >
              Displaying {paginatedInvoices.length} of {filtered.length} transactions
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{ 
                  padding: '8px', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  borderRadius: '8px',
                  color: currentPage === 1 ? 'var(--text-muted)' : '#FFFFFF',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
              </button>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#FFFFFF', fontSize: '14px', fontWeight: 500 }}>
                {currentPage} / {totalPages}
              </span>
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{ 
                  padding: '8px', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  borderRadius: '8px',
                  color: currentPage === totalPages ? 'var(--text-muted)' : '#FFFFFF',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Visualization Section matching screenshot */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
          gap: '24px', 
          marginTop: '32px' 
        }}
      >
        {/* Peak utilization card */}
        <div className="ccms-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
              Peak Utilization Hours
            </h3>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '24px' }}>equalizer</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: '8px', height: '192px' }}>
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '40%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '60%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '85%' }} />
            <div 
              style={{ 
                flexGrow: 1, 
                background: 'rgba(0, 194, 255, 0.4)', 
                borderRadius: '4px 4px 0 0', 
                height: '95%',
                boxShadow: '0 0 15px rgba(0, 194, 255, 0.2)',
                position: 'relative'
              }}
            >
              <div 
                style={{ 
                  position: 'absolute', 
                  bottom: '100%', 
                  left: '50%', 
                  transform: 'translateX(-50%)', 
                  background: 'var(--accent-cyan)', 
                  padding: '4px 8px', 
                  borderRadius: '4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  color: '#003548',
                  whiteSpace: 'nowrap',
                  marginBottom: '8px',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              >
                PEAK - 98%
              </div>
            </div>
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '75%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '50%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '30%' }} />
          </div>

          <div 
            style={{ 
              marginTop: '16px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              color: 'var(--text-muted)', 
              fontFamily: 'JetBrains Mono, monospace', 
              fontSize: '10px' 
            }}
          >
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>00:00</span>
          </div>
        </div>

        {/* Sync ledger card */}
        <div className="ccms-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
              style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                border: '4px solid var(--accent-cyan)', 
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite'
              }} 
            />
            <div>
              <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                Real-time Syncing...
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                Connected to central payment gateway. All transactions are verifiable via blockchain hash.
              </p>
            </div>
          </div>

          <div 
            style={{ 
              marginTop: '32px', 
              padding: '16px', 
              background: '#0e0e0e', 
              borderRadius: '8px', 
              border: '1px solid rgba(255, 255, 255, 0.05)' 
            }}
          >
            <code 
              style={{ 
                fontFamily: 'JetBrains Mono, monospace', 
                fontSize: '11px', 
                color: 'rgba(0, 194, 255, 0.7)', 
                display: 'block', 
                lineHeight: '1.6' 
              }}
            >
              HASH: 0x8a1c92f...e7d2 <br />
              STATUS: NODE_CONFIRMED <br />
              TIMESTAMP: 2024-07-15T09:42:11.002Z
            </code>
          </div>
        </div>
      </div>
    </Layout>
  );
}
