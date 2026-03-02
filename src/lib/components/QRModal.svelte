<script lang="ts">
  import { store } from '$lib/stores/archiveState.svelte';

  type Props = { onShred: () => void };
  let { onShred }: Props = $props();

  function handleBackdropKey(e: KeyboardEvent) {
    if (e.key === 'Escape') store.showQRModal = false;
  }
</script>

{#if store.showQRModal}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm
           {store.isDark ? 'bg-stone-950/90' : 'bg-stone-950/80'}"
    role="presentation"
    onclick={() => (store.showQRModal = false)}
    onkeydown={handleBackdropKey}
  >
    <!-- Modal panel — use a native <dialog> to satisfy all a11y rules automatically -->
    <dialog
      open
      class="rounded-3xl p-8 max-w-sm w-full shadow-2xl border bg-transparent m-0
             {store.isDark ? 'bg-stone-900 border-stone-800 text-stone-300' : 'bg-white border-stone-200 text-stone-950'}"
      style="background: {store.isDark ? 'rgb(28 25 23)' : 'white'};"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex flex-col items-center text-center space-y-6">

        <div class="space-y-1">
          <h3 class="font-black text-xs tracking-[0.3em] uppercase {store.isDark ? 'text-stone-200' : 'text-stone-950'}">
            Digital Archive Bridge
          </h3>
          <div class="flex items-center justify-center gap-1.5 py-1 px-3 border rounded-full
                      {store.isDark ? 'bg-red-950/30 border-red-900/50' : 'bg-red-50 border-red-100'}">
            <div class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
            <span class="text-[9px] font-bold text-red-600 uppercase tracking-tighter">
              QR will expire in {store.timeLeft}
            </span>
          </div>
        </div>

        <div class="p-4 rounded-2xl border {store.isDark ? 'bg-stone-950 border-stone-800' : 'bg-stone-50 border-stone-100'}">
          {#if store.qrModalImage}
            <img src={store.qrModalImage} alt="QR Code for archive download" class="w-64 h-64 {store.isDark ? 'brightness-90 contrast-125' : ''}" />
          {:else}
            <div class="w-64 h-64 flex items-center justify-center text-stone-400 text-[10px] italic">
              Generate an export first to activate link.
            </div>
          {/if}
        </div>

        <div class="space-y-2 w-full">
          <p class="text-[10px] font-medium {store.isDark ? 'text-stone-400' : 'text-stone-500'}">
            Scan to download your archive directly to any mobile device.
          </p>
          <p class="text-[9px] break-all font-mono opacity-60 uppercase {store.isDark ? 'text-stone-500' : 'text-stone-400'}">
            {store.globalTheme.qrUrl || 'No link generated yet'}
          </p>
        </div>

        <p class="text-[8px] italic {store.isDark ? 'text-stone-600' : 'text-stone-400'}">
          Files are permanently shredded from the bridge after 5 hours for your privacy.
        </p>

        {#if store.currentSessionId}
          <button
            onclick={() => { if (confirm('ATELIER SECURITY: Permanently shred the cloud archive now?')) onShred(); }}
            class="w-full py-2 border rounded-xl font-bold text-[9px] tracking-[0.2em] uppercase transition-colors
                   {store.isDark ? 'bg-stone-900/50 text-red-400 border-red-900/30 hover:bg-red-950/20' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}"
          >
            🗑️ Shred Cloud Archive
          </button>
        {/if}

        <button
          onclick={() => (store.showQRModal = false)}
          class="w-full py-4 rounded-xl font-bold text-[10px] tracking-widest uppercase transition-colors
                 {store.isDark ? 'bg-stone-100 text-stone-900 hover:bg-white' : 'bg-stone-900 text-white hover:bg-black'}"
        >
          Close
        </button>
      </div>
    </dialog>
  </div>
{/if}

<style>
  /* Reset browser's default <dialog> styling */
  dialog {
    position: static;
    padding: 0;
    border: none;
    max-width: none;
    width: 100%;
  }
  dialog::backdrop {
    display: none; /* We use our own backdrop div */
  }
</style>