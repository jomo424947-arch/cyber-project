import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActiveShiftResult {
  id: string;
  total_revenue?: number;
  [key: string]: any;
}

/**
 * Finds the currently active shift for the user, falling back to any active shift
 * in the tenant/branch if the specific user has not opened an individual shift.
 */
export async function getActiveShiftForUserOrTenant(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  selectFields = 'id, total_revenue'
): Promise<ActiveShiftResult | null> {
  const { data: userShift, error: userErr } = await supabase
    .from('shifts')
    .select(selectFields)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (userErr) throw userErr;
  if (userShift) return userShift as unknown as ActiveShiftResult;

  const { data: tenantShift, error: tenantErr } = await supabase
    .from('shifts')
    .select(selectFields)
    .eq('status', 'active')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .maybeSingle();

  if (tenantErr) throw tenantErr;
  return tenantShift ? (tenantShift as unknown as ActiveShiftResult) : null;
}
