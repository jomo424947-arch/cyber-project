import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { DEVICE_TYPE_META } from '../utils/constants';
import { formatCurrency } from '../utils/format';
import type { Device, DeviceType } from '../types';

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: devices, loading, refetch } = useAsync(() => dataService.listDevices(), []);
  const [editing, setEditing] = useState<Device | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);

  const allDevices = devices ?? [];

  return (
    <Layout
      title="Security Settings"
      subtitle="Admin control console — manage terminal nodes, rates, and fleet permissions"
      actions={
        <Button 
          onClick={() => setCreating(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          Add Device
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner label="Loading node configurations…" />
      ) : allDevices.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="⚙"
            title="No devices configured"
            description="Add your first device to start managing the café."
            action={<Button onClick={() => setCreating(true)}>Add Device</Button>}
          />
        </div>
      ) : (
        <>
          <Card style={{ overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Node Registry
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                {allDevices.length} node{allDevices.length === 1 ? '' : 's'} registered in the active fleet
              </p>
            </div>
            <Table
              columns={[
                {
                  key: 'name',
                  header: 'Node Identifier',
                  render: (d: Device) => (
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                        {d.type === 'pc' ? 'desktop_windows' : d.type === 'console' ? 'sports_esports' : 'smart_display'}
                      </span>
                      {d.name}
                    </strong>
                  ),
                },
                {
                  key: 'type',
                  header: 'Category',
                  render: (d: Device) => DEVICE_TYPE_META[d.type].label,
                },
                {
                  key: 'status',
                  header: 'Encryption Link',
                  render: (d: Device) => <StatusBadge status={d.status} />,
                },
                {
                  key: 'rate',
                  header: 'Base Rate ($/hr)',
                  align: 'right',
                  render: (d: Device) => (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatCurrency(d.hourly_rate)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (d: Device) => (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing(d)}
                        style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                      >
                        Edit
                      </Button>
                      {d.status !== 'in_use' && (
                        <Button
                          variant="danger"
                          onClick={() => setDeleting(d)}
                          style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={allDevices}
              rowKey={(d) => d.id}
            />
          </Card>
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <DeviceFormModal
          title={`Edit Node · ${editing.name}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={async (patch) => {
            try {
              await dataService.updateDevice(editing.id, patch);
              toast('Device updated', 'success');
              refetch();
              setEditing(null);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not update'), 'error');
            }
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <DeviceFormModal
          title="Register Node"
          initial={null}
          onClose={() => setCreating(false)}
          onDone={async (patch) => {
            try {
              await dataService.createDevice(patch as { name: string; type: DeviceType; hourly_rate: number; specs?: Record<string, string> });
              toast('Device added', 'success');
              refetch();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create device'), 'error');
            }
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal
          open
          title="Remove Node"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await dataService.deleteDevice(deleting.id);
                    toast('Device removed', 'success');
                    refetch();
                    setDeleting(null);
                  } catch (err) {
                    toast(apiErrorMessage(err, 'Could not delete'), 'error');
                  }
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Are you sure you want to remove node <strong>{deleting.name}</strong>? This device will be permanently deleted from the database.
            Any active sessions will need to be ended first.
          </p>
        </Modal>
      )}
    </Layout>
  );
}

function DeviceFormModal({
  title,
  initial,
  onClose,
  onDone,
}: {
  title: string;
  initial: Device | null;
  onClose: () => void;
  onDone: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<DeviceType>(initial?.type ?? 'pc');
  const [hourlyRate, setHourlyRate] = useState(String(initial?.hourly_rate ?? '5'));
  const [specsCpu, setSpecsCpu] = useState((initial?.specs as Record<string, string>)?.CPU ?? '');
  const [specsGpu, setSpecsGpu] = useState((initial?.specs as Record<string, string>)?.GPU ?? '');
  const [specsRam, setSpecsRam] = useState((initial?.specs as Record<string, string>)?.RAM ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const specs: Record<string, string> = {};
      if (specsCpu) specs.CPU = specsCpu;
      if (specsGpu) specs.GPU = specsGpu;
      if (specsRam) specs.RAM = specsRam;
      const rate = parseFloat(hourlyRate);
      if (Number.isNaN(rate) || rate < 0) {
        throw new Error('Invalid hourly rate');
      }
      const patch: Record<string, unknown> = {
        name,
        type,
        hourly_rate: rate,
        specs: Object.keys(specs).length > 0 ? specs : null,
      };
      await onDone(patch);
    } catch (err) {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const isValid = name.trim() && !Number.isNaN(parseFloat(hourlyRate));

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={!isValid} onClick={handleSubmit}>
            {initial ? 'Save' : 'Add Node'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input label="Node Identifier" placeholder="e.g. PC-05" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select label="Category" value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
          <option value="pc">PC</option>
          <option value="console">Console</option>
          <option value="vr">VR</option>
        </Select>
        <Input
          label="Base Hourly Rate ($)"
          type="number"
          step="0.5"
          min="0"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
        />
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
          <span className="ccms-eyebrow">Hardware Specifications (optional)</span>
        </div>
        <Input label="CPU" placeholder="e.g. i5-12400F" value={specsCpu} onChange={(e) => setSpecsCpu(e.target.value)} />
        <Input label="GPU" placeholder="e.g. RTX 3060" value={specsGpu} onChange={(e) => setSpecsGpu(e.target.value)} />
        <Input label="RAM" placeholder="e.g. 16GB" value={specsRam} onChange={(e) => setSpecsRam(e.target.value)} />
      </div>
    </Modal>
  );
}
