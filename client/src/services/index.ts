import type { DataService } from './api';
import { offlineFirstService } from './offlineFirstService';

/**
 * The single data service used across the app.
 * Offline-first DB layer with local IndexedDB persistence + background sync.
 */
export const dataService: DataService = offlineFirstService;

export type { DataService };

