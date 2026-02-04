import { writable, type Writable } from 'svelte/store';

export interface ArchiveItem {
    id: string;
    title: string;
    pageCount?: number;
    color?: string;
}

// Single source of truth for your PDF stream
export const items: Writable<ArchiveItem[]> = writable([
    { id: 'pdf-1', title: 'Document Alpha', color: '#6366f1' },
    { id: 'pdf-2', title: 'Report Beta', color: '#ec4899' },
    { id: 'pdf-3', title: 'Invoice Gamma', color: '#10b981' }
]);

// Track the active ID for Sidebar-Canvas highlighting
export const activeId: Writable<string | null> = writable(null);