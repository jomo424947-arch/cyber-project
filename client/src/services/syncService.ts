import { localDb } from './localDb';
import { http } from './http';

/**
 * Background Sync Service
 * Monitors online/offline network state and syncs queued offline changes
 * to the backend API server.
 */

class SyncService {
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[sync] Internet connection restored. Processing offline sync queue...');
        this.processSyncQueue();
      });
    }
  }

  public isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Trigger manual cloud sync on the backend.
   * Calls POST /api/auth/sync which runs the server-side sync engine.
   */
  public async triggerServerSync(): Promise<void> {
    try {
      await http.post('/api/auth/sync');
      console.log('[sync] Server cloud sync triggered successfully.');
    } catch (err) {
      console.warn('[sync] Server cloud sync request failed:', err);
    }
  }

  public async processSyncQueue(): Promise<void> {
    if (this.isSyncing || !this.isOnline()) return;

    this.isSyncing = true;
    try {
      const pendingItems = await localDb.getPendingSyncItems();
      if (pendingItems.length === 0) return;

      console.log(`[sync] Processing ${pendingItems.length} queued offline actions...`);

      for (const item of pendingItems) {
        item.status = 'syncing';
        await localDb.setItem('sync_queue', item);

        try {
          // Route each queued action to the appropriate API endpoint
          if (item.action === 'create_session') {
            await http.post('/api/sessions', item.payload);
          } else if (item.action === 'end_session') {
            const { id, ...rest } = item.payload as Record<string, any>;
            await http.post(`/api/sessions/${id}/end`, rest);
          } else if (item.action === 'create_invoice') {
            await http.post('/api/invoices', item.payload);
          } else if (item.action === 'create_order') {
            const { session_id, ...rest } = item.payload as Record<string, any>;
            await http.post(`/api/sessions/${session_id}/orders`, rest);
          } else if (item.action === 'update_device') {
            const { id, ...rest } = item.payload as Record<string, any>;
            await http.patch(`/api/devices/${id}`, rest);
          }

          console.log(`[sync] Synced ${item.action} (${item.id}) successfully.`);
          await localDb.deleteItem('sync_queue', item.id);
        } catch (err) {
          console.error(`[sync] Failed to sync ${item.id}:`, err);
          item.status = 'failed';
          await localDb.setItem('sync_queue', item);
        }
      }

      // After processing all queue items, trigger server-side cloud sync
      await this.triggerServerSync();
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
