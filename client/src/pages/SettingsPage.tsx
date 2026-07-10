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
      title="Settings"
      subtitle="Admin — manage devices and pricing"
      actions={<Button onClick={() => setCreating(true)}>+ Add Device</Button>}
    >
      {loading ? (
        <LoadingSpinner label="Loading settings…" />
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
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Device Registry
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {allDevices.length} device{allDevices.length === 1 ? '' : 's'} registered
              </p>
            </div>
            <Table
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  render: (d: Device) => (
                    <strong>
                      {DEVICE_TYPE_META[d.type].icon} {d.name}
                    </strong>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  render: (d: Device) => DEVICE_TYPE_META[d.type].label,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (d: Device) => <StatusBadge status={d.status} />,
                },
                {
                  key: 'rate',
                  header: 'Hourly Rate',
                  align: 'right',
                  render: (d: Device) => (
                    <span style={{ fontFamily: 'Audiowide, sans-serif' }}>
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
                        style={{ padding: '6px 14px', fontSize: '13px' }}
                      >
                        Edit
                      </Button>
                      {d.status !== 'in_use' && (
                        <Button
                          variant="danger"
                          onClick={() => setDeleting(d)}
                          style={{ padding: '6px 14px', fontSize: '13px' }}
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
          title={`Edit · ${editing.name}`}
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
          title="Add New Device"
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
          title="Remove Device"
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Remove <strong>{deleting.name}</strong>? This device will be permanently deleted.
            Any active sessions will need to be ended first.
          </p>
        </Modal>
      )}
    </Layout>
  );
}

// ─── Device form modal (shared for create & edit) ──────────────────────
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
            {initial ? 'Save' : 'Add Device'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input label="Name" placeholder="e.g. PC-05" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
          <option value="pc">PC</option>
          <option value="console">Console</option>
          <option value="vr">VR</option>
        </Select>
        <Input
          label="Hourly Rate ($)"
          type="number"
          step="0.5"
          min="0"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
        />
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
          <span className="ccms-eyebrow">Hardware Specs (optional)</span>
        </div>
        <Input label="CPU" placeholder="e.g. i5-12400F" value={specsCpu} onChange={(e) => setSpecsCpu(e.target.value)} />
        <Input label="GPU" placeholder="e.g. RTX 3060" value={specsGpu} onChange={(e) => setSpecsGpu(e.target.value)} />
        <Input label="RAM" placeholder="e.g. 16GB" value={specsRam} onChange={(e) => setSpecsRam(e.target.value)} />
      </div>
    </Modal>
  );
}
