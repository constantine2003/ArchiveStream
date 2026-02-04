import { writable } from 'svelte/store';

export interface FileItem {
    id: string;
    name: string;
    url: string;
}

export const files = writable<FileItem[]>([]);
export const activeFileId = writable<string>('');