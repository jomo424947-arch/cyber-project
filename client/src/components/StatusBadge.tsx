import { Badge } from './ui/Badge';
import { DEVICE_STATUS_META } from '../utils/constants';
import { useLanguage } from '../context/LanguageContext';
import type { DeviceStatus } from '../types';

interface StatusBadgeProps {
  status: DeviceStatus;
}

/** Convenience wrapper: badge for a device status, using the spec's color mapping. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { language } = useLanguage();
  const meta = DEVICE_STATUS_META[status];

  let label = meta.label;
  if (language === 'ar') {
    if (status === 'in_use') label = 'نشط الآن';
    else if (status === 'available') label = 'متاح';
    else if (status === 'reserved') label = 'محجوز';
    else if (status === 'offline') label = 'غير متصل';
  }

  return <Badge label={label} color={meta.color} bg={meta.bg} pulse={meta.pulse} />;
}
