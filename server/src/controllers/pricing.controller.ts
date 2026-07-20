import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, forbidden } from '../lib/errors';

/**
 * GET /api/pricing — returns current pricing per device type.
 * Groups devices by type and returns the dominant hourly_rate and hourly_rate_multi for each.
 */
export async function getPricing(req: Request, res: Response) {
  const { data: devices, error } = await supabase
    .from('devices')
    .select('id, name, type, hourly_rate, hourly_rate_multi')
    .eq('archived', false)
    .order('name', { ascending: true });

  if (error) throw error;

  // Group by type
  const typeMap: Record<string, { devices: typeof devices; rates: number[]; ratesMulti: number[] }> = {};
  for (const d of devices ?? []) {
    if (!typeMap[d.type]) {
      typeMap[d.type] = { devices: [], rates: [], ratesMulti: [] };
    }
    typeMap[d.type].devices.push(d);
    typeMap[d.type].rates.push(Number(d.hourly_rate));
    typeMap[d.type].ratesMulti.push(Number(d.hourly_rate_multi));
  }

  // Build pricing tiers
  const tiers: Array<{
    type: string;
    hourly_rate: number;
    hourly_rate_multi: number;
    device_count: number;
    devices: Array<{ id: string; name: string; hourly_rate: number; hourly_rate_multi: number }>;
    all_same: boolean;
    all_same_multi: boolean;
  }> = [];

  for (const [type, info] of Object.entries(typeMap)) {
    const allSame = info.rates.every((r) => r === info.rates[0]);
    const allSameMulti = info.ratesMulti.every((r) => r === info.ratesMulti[0]);
    tiers.push({
      type,
      hourly_rate: info.rates[0] ?? 0,
      hourly_rate_multi: info.ratesMulti[0] ?? 0,
      device_count: info.devices.length,
      devices: info.devices.map((d: any) => ({
        id: d.id,
        name: d.name,
        hourly_rate: Number(d.hourly_rate),
        hourly_rate_multi: Number(d.hourly_rate_multi),
      })),
      all_same: allSame,
      all_same_multi: allSameMulti,
    });
  }

  res.json({ data: tiers });
}

/**
 * PATCH /api/pricing/bulk — update hourly rates for all devices of a given type.
 * Body: { type: 'pc' | 'console' | 'vr', hourly_rate?: number, hourly_rate_multi?: number }
 */
export async function updateBulkPricing(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can update pricing');
  }

  const { type, hourly_rate, hourly_rate_multi } = req.body;

  if (!type || !['pc', 'console', 'vr'].includes(type)) {
    throw badRequest('Valid type required (pc, console, vr)');
  }

  const patch: Record<string, any> = {};
  if (hourly_rate !== undefined && hourly_rate !== null) {
    if (Number(hourly_rate) < 0) throw badRequest('Valid hourly_rate required (>= 0)');
    patch.hourly_rate = Number(hourly_rate);
  }
  if (hourly_rate_multi !== undefined && hourly_rate_multi !== null) {
    if (Number(hourly_rate_multi) < 0) throw badRequest('Valid hourly_rate_multi required (>= 0)');
    patch.hourly_rate_multi = Number(hourly_rate_multi);
  }

  if (Object.keys(patch).length === 0) {
    throw badRequest('No rate update provided');
  }

  const { data, error } = await supabase
    .from('devices')
    .update(patch)
    .eq('type', type)
    .eq('archived', false)
    .select('id, name, type, hourly_rate, hourly_rate_multi');

  if (error) throw error;

  res.json({
    data: data ?? [],
    message: `Updated ${(data ?? []).length} ${type} device(s) pricing`,
  });
}

/**
 * PATCH /api/pricing/device/:id — update hourly rates for a single device.
 * Body: { hourly_rate?: number, hourly_rate_multi?: number }
 */
export async function updateDevicePricing(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can update pricing');
  }

  const { id } = req.params;
  const { hourly_rate, hourly_rate_multi } = req.body;

  const patch: Record<string, any> = {};
  if (hourly_rate !== undefined && hourly_rate !== null) {
    if (Number(hourly_rate) < 0) throw badRequest('Valid hourly_rate required (>= 0)');
    patch.hourly_rate = Number(hourly_rate);
  }
  if (hourly_rate_multi !== undefined && hourly_rate_multi !== null) {
    if (Number(hourly_rate_multi) < 0) throw badRequest('Valid hourly_rate_multi required (>= 0)');
    patch.hourly_rate_multi = Number(hourly_rate_multi);
  }

  if (Object.keys(patch).length === 0) {
    throw badRequest('No rate update provided');
  }

  const { data, error } = await supabase
    .from('devices')
    .update(patch)
    .eq('id', id)
    .select('id, name, type, hourly_rate, hourly_rate_multi')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw badRequest('Device not found');

  res.json({ data });
}
