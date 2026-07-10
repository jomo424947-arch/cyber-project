import { Badge } from './ui/Badge';
import { DEVICE_STATUS_META } from '../utils/constants';
import type { DeviceStatus } from '../types';

interface StatusBadgeProps {
  status: DeviceStatus;
}

/** Convenience wrapper: badge for a device status, using the spec's color mapping. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = DEVICE_STATUS_META[status];
  return <Badge label={meta.label} color={meta.color} bg={meta.bg} pulse={meta.pulse} />;
}
