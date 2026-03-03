<script lang="ts">
  import { store } from '$lib/stores/archiveState.svelte';

  type Props = { onShred: () => void };
  let { onShred }: Props = $props();
</script>

{#if store.showQRModal}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-100 flex items-center justify-center p-4 backdrop-blur-sm
           {store.isDark ? 'bg-stone-950/90' : 'bg-stone-950/80'}"
    role="presentation"
    onclick={() => (store.showQRModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (store.showQRModal = false)}
  >
    <!-- Modal panel -->
    <div
      class="relative w-full max-w-sm rounded-3xl p-8 shadow-2xl border flex flex-col items-center text-center gap-6
             {store.isDark ? 'bg-stone-900 border-stone-800 text-stone-300' : 'bg-white border-stone-200 text-stone-950'}"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >

      <!-- Title + expiry badge -->
      <div class="flex flex-col items-center gap-2">
        <h3 class="font-black text-xs tracking-[0.3em] uppercase {store.isDark ? 'text-stone-200' : 'text-stone-950'}">
          Digital Archive Bridge
        </h3>
        <div class="flex items-center gap-1.5 py-1 px-3 border rounded-full
                    {store.isDark ? 'bg-red-950/30 border-red-900/50' : 'bg-red-50 border-red-100'}">
          <div class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0"></div>
          <span class="text-[9px] font-bold text-red-600 uppercase tracking-tighter whitespace-nowrap">
            QR will expire in {store.timeLeft}
          </span>
        </div>
      </div>

      <!-- QR image -->
      <div class="p-4 rounded-2xl border shrink-0
                  {store.isDark ? 'bg-stone-950 border-stone-800' : 'bg-stone-50 border-stone-100'}">
        {#if store.qrModalImage}
          <img
            src={store.qrModalImage}
            alt="QR Code for archive download"
            class="w-56 h-56 {store.isDark ? 'brightness-90 contrast-125' : ''}"
          />
        {:else}
          <div class="w-56 h-56 flex items-center justify-center text-stone-400 text-[10px] italic px-4">
            Generate an export first to activate link.
          </div>
        {/if}
      </div>

      <!-- URL info -->
      <div class="w-full flex flex-col gap-1">
        <p class="text-[10px] font-medium {store.isDark ? 'text-stone-400' : 'text-stone-500'}">
          Scan to download your archive on any mobile device.
        </p>
        <p class="text-[9px] break-all font-mono opacity-50 {store.isDark ? 'text-stone-500' : 'text-stone-400'}">
          {store.globalTheme.qrUrl || 'No link generated yet'}
        </p>
      </div>

      <!-- Privacy note -->
      <p class="text-[8px] italic {store.isDark ? 'text-stone-600' : 'text-stone-400'}">
        Files are permanently shredded after 5 hours for your privacy.
      </p>

      <!-- Shred button (only if session active) -->
      {#if store.currentSessionId}
        <button
          onclick={() => { if (confirm('ATELIER SECURITY: Permanently shred the cloud archive now?')) onShred(); }}
          class="w-full py-2.5 border rounded-xl font-bold text-[9px] tracking-[0.2em] uppercase transition-colors
                 {store.isDark ? 'bg-stone-900/50 text-red-400 border-red-900/30 hover:bg-red-950/20' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}"
        >
          🗑️ Shred Cloud Archive
        </button>
      {/if}

      <!-- Close button -->
      <button
        onclick={() => (store.showQRModal = false)}
        class="w-full py-4 rounded-xl font-bold text-[10px] tracking-widest uppercase transition-colors
               {store.isDark ? 'bg-stone-100 text-stone-900 hover:bg-white' : 'bg-stone-900 text-white hover:bg-black'}"
      >
        Close
      </button>

    </div>
  </div>
{/if}