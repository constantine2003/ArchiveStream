import { supabase } from '$lib/supabaseClient';
import type { FileItem, ExportHistoryItem, GlobalTheme, WatermarkType } from '$lib/types';
import { defaultTheme } from '$lib/utils/themeUtils';

// ─── Svelte 5 shared state via class ─────────────────────────────────────────
// Exporting $state primitives directly from a module makes them read-only at
// the import site. Wrapping everything in a class fixes this — properties on
// an imported object ARE assignable.

class ArchiveState {
  // Files
  files = $state<FileItem[]>([]);

  // UI
  activeFileId = $state<string | null>(null);
  searchQuery = $state('');
  isDragging = $state(false);
  isExporting = $state(false);
  exportProgress = $state(0);
  showSuccess = $state(false);
  isDark = $state(false);
  sidebarOpen = $state(false);
  compressEnabled = $state(true);
  settingsExpanded = $state(false);
  viewMode = $state<'stream' | 'grid'>('stream');

  // Drag & context menu
  draggedIndex = $state<number | null>(null);
  dragOverIndex = $state<number | null>(null);
  menuVisible = $state(false);
  menuPos = $state({ x: 0, y: 0 });
  activeFileIndex = $state<number | null>(null);

  // Export history
  exportHistory = $state<ExportHistoryItem[]>([]);

  // Watermark
  activeWatermark = $state<WatermarkType>('NONE');

  // Theme
  globalTheme = $state<GlobalTheme>({ ...defaultTheme });

  // Session / QR
  currentSessionId = $state('');
  showQRModal = $state(false);
  qrModalImage = $state('');
  timeLeft = $state('05h 00m');
  activeSessionTimestamp = $state<string | null>(null);

  // Derived
  filteredFiles = $derived(
    this.files.filter((f) =>
      f.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    )
  );

  // ─── Helpers ───────────────────────────────────────────────────────────────
  async syncSortOrder() {
    // Only sync items that have a numeric DB id (skip chapters and locally-added files)
    const updates = this.files
      .filter((f) => typeof f.id === 'number')
      .map((f, index) => ({
        id: f.id,
        file_name: f.name,
        sort_order: index,
      }));
    if (updates.length === 0) return;
    await supabase.from('document_queue').upsert(updates);
  }
}

export const store = new ArchiveState();

// ─── Watermark metadata (static, not reactive) ───────────────────────────────
export const watermarkStyles: Record<string, { text: string; opacity: number }> = {
  DRAFT:        { text: 'DRAFT',        opacity: 0.3 },
  CONFIDENTIAL: { text: 'CONFIDENTIAL', opacity: 0.3 },
  APPROVED:     { text: 'APPROVED',     opacity: 0.3 },
};