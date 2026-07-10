import type { DataService } from './api';
import { realService } from './real/realService';

/**
 * The single data service used across the app.
 *
 * It always talks to the real Express API, which reads live data from Supabase.
 * (The old in-memory mock store has been removed — the app now shows only real
 * data.)
 */
export const dataService: DataService = realService;

export type { DataService };
