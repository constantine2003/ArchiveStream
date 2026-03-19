<script lang="ts">
  import { store } from '$lib/stores/archiveState.svelte';

  type Props = { onConfirm: () => void };
  let { onConfirm }: Props = $props();
  let showPw = $state(false);
</script>

{#if store.showPasswordModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4"
       style="background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);">
    <div class="w-full max-w-sm rounded-2xl border p-8 shadow-2xl
                {store.isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-stone-200'}">

      <!-- Icon -->
      <div class="w-11 h-11 rounded-xl flex items-center justify-center mb-5
                  {store.isDark ? 'bg-stone-900 border border-stone-800' : 'bg-stone-50 border border-stone-200'}">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
      </div>

      <h2 class="font-serif text-xl mb-1 {store.isDark ? 'text-white' : 'text-stone-900'}">Password Protect</h2>
      <p class="text-[11px] mb-5 {store.isDark ? 'text-stone-500' : 'text-stone-400'}">
        Optional — leave blank to export without protection.
      </p>

      <!-- Input -->
      <div class="relative mb-5">
        <input
          type={showPw ? 'text' : 'password'}
          placeholder="Enter password..."
          bind:value={store.exportPassword}
          onkeydown={(e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') { store.exportPassword = ''; onConfirm(); } }}
          autofocus
          class="w-full px-4 py-3 pr-11 rounded-xl border text-sm outline-none transition-all
                 {store.isDark ? 'bg-stone-900 border-stone-800 text-stone-200 placeholder-stone-600 focus:border-amber-600/50' : 'bg-stone-50 border-stone-200 text-stone-800 placeholder-stone-400 focus:border-amber-500'}"
        />
        <button onclick={() => (showPw = !showPw)}
          class="absolute right-3 top-1/2 -translate-y-1/2 transition-colors
                 {store.isDark ? 'text-stone-600 hover:text-stone-400' : 'text-stone-400 hover:text-stone-600'}">
          {#if showPw}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          {/if}
        </button>
      </div>

      <!-- Lock indicator -->
      {#if store.exportPassword.trim()}
        <div class="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg
                    {store.isDark ? 'bg-amber-600/10 border border-amber-600/20' : 'bg-amber-50 border border-amber-200'}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          <span class="text-[10px] font-bold text-amber-500 uppercase tracking-wider">PDF will be password protected</span>
        </div>
      {/if}

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          onclick={() => { store.exportPassword = ''; onConfirm(); }}
          class="flex-1 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all
                 {store.isDark ? 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700' : 'border-stone-200 text-stone-400 hover:text-stone-600'}">
          Skip
        </button>
        <button
          onclick={onConfirm}
          class="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-widest transition-all">
          {store.exportPassword.trim() ? 'Export & Lock' : 'Export PDF'}
        </button>
      </div>
    </div>
  </div>
{/if}