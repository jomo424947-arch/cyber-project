/**
 * Local DB Service (IndexedDB)
 * Offline-first local database for storing operational data locally
 * and queuing mutations when internet is disconnected.
 */

const DB_NAME = 'ccms_local_db';
const DB_VERSION = 1;

export interface SyncQueueItem {
  id: string;
  action: 'create_session' | 'end_session' | 'create_invoice' | 'create_order' | 'update_device';
  entity: string;
  payload: Record<string, unknown>;
  created_at: string;
  status: 'pending' | 'syncing' | 'failed';
}

class LocalDb {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private initDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Key-Value stores for local offline cache
        if (!db.objectStoreNames.contains('devices')) {
          db.createObjectStore('devices', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('invoices')) {
          db.createObjectStore('invoices', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async getItem<T>(storeName: string, id: string): Promise<T | null> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve((request.result as T) || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setItem<T>(storeName: string, item: T): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteItem(storeName: string, id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async enqueueSync(item: Omit<SyncQueueItem, 'id' | 'created_at' | 'status'>): Promise<SyncQueueItem> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    await this.setItem('sync_queue', queueItem);
    return queueItem;
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    const all = await this.getAll<SyncQueueItem>('sync_queue');
    return all.filter((i) => i.status === 'pending');
  }
}

export const localDb = new LocalDb();
