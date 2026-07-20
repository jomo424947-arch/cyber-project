import { useEffect, useState, useMemo } from 'react';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import type { Session, SessionOrder } from '../types';

interface Props {
  session: Session;
  /** Whether this row is expanded */
  expanded: boolean;
  /** Called when the user clicks "End Session" */
  onEndSession?: (session: Session) => void;
}

/**
 * Renders inline beneath a session table row showing all café orders
 * for that session with a sleek animated expandable panel.
 */
export function SessionOrdersRow({ session, expanded, onEndSession }: Props) {
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    setError('');
    dataService
      .listSessionOrders(session.id)
      .then(setOrders)
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [expanded, session.id]);

  const total = useMemo(() => {
    if (!orders) return 0;
    return orders.reduce((sum, o) => sum + Number(o.total_price), 0);
  }, [orders]);

  if (!expanded) return null;

  return (
    <tr>
      <td
        colSpan={99}
        style={{ padding: 0, border: 'none', background: 'transparent' }}
      >
        <div
          style={{
            overflow: 'hidden',
            animation: 'orders-slide-down 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        >
          <div
            style={{
              margin: '0 24px 16px 24px',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.03) 0%, rgba(54, 38, 206, 0.03) 100%)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 194, 255, 0.12)',
              position: 'relative',
            }}
          >
            {/* Top accent line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '20px',
                right: '20px',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(0, 194, 255, 0.3), transparent)',
              }}
            />

            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '16px',
                  color: 'var(--accent-cyan)',
                  opacity: 0.8,
                }}
              >
                local_cafe
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                }}
              >
                Session Café Orders
              </span>
              {orders && orders.length > 0 && (
                <span
                  style={{
                    marginLeft: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--accent-cyan)',
                    background: 'rgba(0, 194, 255, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {orders.length}
                </span>
              )}
            </div>

            {/* Content */}
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 0',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(0, 194, 255, 0.2)',
                    borderTopColor: 'var(--accent-cyan)',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
                Loading orders…
              </div>
            ) : error ? (
              <div
                style={{
                  color: 'var(--accent-red)',
                  fontSize: '13px',
                  padding: '8px 0',
                }}
              >
                {error}
              </div>
            ) : !orders || orders.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 0',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                    fontStyle: 'italic',
                  }}
                >
                  <span style={{ fontSize: '16px', opacity: 0.5 }}>☕</span>
                  No café orders yet — click "+ Café" to add drinks & snacks
                </div>
                {onEndSession && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEndSession(session);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#fff',
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9))',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 0 12px rgba(239, 68, 68, 0.15)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 1), rgba(220, 38, 38, 1))';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.3)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9))';
                        e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.15)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>stop_circle</span>
                      End Session
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Orders grid */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  {orders.map((order, i) => (
                    <div
                      key={order.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        animation: `fade-in-up 0.25s ease-out ${i * 0.05}s both`,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 194, 255, 0.06)';
                        e.currentTarget.style.borderColor = 'rgba(0, 194, 255, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                      }}
                    >
                      {/* Product emoji/icon */}
                      <span
                        style={{
                          fontSize: '18px',
                          lineHeight: 1,
                          filter: 'drop-shadow(0 0 4px rgba(0,194,255,0.2))',
                        }}
                      >
                        {getProductEmoji(order.product?.name ?? '')}
                      </span>

                      {/* Name & price details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            lineHeight: 1.2,
                          }}
                        >
                          {order.product?.name ?? 'Item'}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          {formatCurrency(order.unit_price)} × {order.quantity}
                        </span>
                      </div>

                      {/* Total for this order */}
                      <span
                        style={{
                          marginLeft: '6px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--accent-green)',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        {formatCurrency(order.total_price)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {onEndSession ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEndSession(session);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#fff',
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9))',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 0 12px rgba(239, 68, 68, 0.15)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 1), rgba(220, 38, 38, 1))';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.3)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9))';
                        e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.15)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>stop_circle</span>
                      End Session
                    </button>
                  ) : <div />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Café Total
                    </span>
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--accent-cyan)',
                        textShadow: '0 0 12px rgba(0, 194, 255, 0.3)',
                      }}
                    >
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/** Maps product name keywords to relevant emoji for visual flair. */
function getProductEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('coffee') || n.includes('قهو')) return '☕';
  if (n.includes('tea') || n.includes('شاي') || n.includes('شاى')) return '🍵';
  if (n.includes('pepsi') || n.includes('cola') || n.includes('بيبسي') || n.includes('كولا')) return '🥤';
  if (n.includes('sprite') || n.includes('سبرايت')) return '🍋';
  if (n.includes('water') || n.includes('مي') || n.includes('ماء')) return '💧';
  if (n.includes('energy') || n.includes('طاقة') || n.includes('fury')) return '⚡';
  if (n.includes('chip') || n.includes('شيبس')) return '🍟';
  if (n.includes('juice') || n.includes('عصير')) return '🧃';
  if (n.includes('sandwich') || n.includes('ساندوتش')) return '🥪';
  if (n.includes('chocolate') || n.includes('شوكولا')) return '🍫';
  if (n.includes('ice') || n.includes('ايس')) return '🧊';
  return '🧋';
}
