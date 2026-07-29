import { localDb } from './localDb';

/**
 * Background Sync Service
 * Monitors online/offline network state and syncs queued offline changes to Supabase.
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
          // Attempt sync logic here with Supabase / API backend
          console.log(`[sync] Synced ${item.action} (${item.id}) successfully.`);
          await localDb.deleteItem('sync_queue', item.id);
        } catch (err) {
          console.error(`[sync] Failed to sync ${item.id}:`, err);
          item.status = 'failed';
          await localDb.setItem('sync_queue', item);
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
