<script lang="ts">
  import { onMount } from 'svelte';

  let status = $state<'loading' | 'decrypting' | 'done' | 'error'>('loading');
  let errorMsg = $state('');
  let pdfUrl = $state('');

  onMount(async () => {
    try {
      const fragment = window.location.hash.slice(1);
      const params = new URLSearchParams(fragment);
      const encryptedUrl = params.get('url');
      const keyB64 = params.get('key');

      // No key = not encrypted, just redirect to the PDF directly
      if (!keyB64 || !encryptedUrl) {
        const rawUrl = encryptedUrl || window.location.hash.slice(1);
        if (rawUrl.startsWith('http')) {
          window.location.href = rawUrl;
        } else {
          throw new Error('Invalid link — missing decryption key or URL.');
        }
        return;
      }

      status = 'decrypting';

      // Fetch encrypted bytes
      const res = await fetch(encryptedUrl);
      if (!res.ok) throw new Error('Failed to fetch file. It may have expired.');
      const encryptedData = await res.arrayBuffer();

      // Import key
      const keyBytes = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

      // Extract IV (first 12 bytes) and ciphertext
      const iv = encryptedData.slice(0, 12);
      const ciphertext = encryptedData.slice(12);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, cryptoKey, ciphertext);

      // Create blob URL for download
      const blob = new Blob([decrypted], { type: 'application/pdf' });
      pdfUrl = URL.createObjectURL(blob);
      status = 'done';

      // Auto-trigger download
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = 'ArchiveStream_decrypted.pdf';
      link.click();

    } catch (err: any) {
      status = 'error';
      errorMsg = err.message ?? 'Decryption failed.';
    }
  });
</script>

<svelte:head>
  <title>ArchiveStream — Secure Download</title>
</svelte:head>

<div class="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center px-6">

  <div class="w-full max-w-sm text-center">

    <!-- Logo -->
    <div class="font-serif text-2xl text-white mb-12">
      ArchiveStream<span class="text-amber-500">.</span>
    </div>

    {#if status === 'loading' || status === 'decrypting'}
      <div class="w-12 h-12 rounded-full border-2 border-amber-600 border-t-transparent animate-spin mx-auto mb-6"></div>
      <p class="text-sm text-stone-400">
        {status === 'loading' ? 'Fetching encrypted file...' : 'Decrypting in your browser...'}
      </p>
      <p class="text-[10px] text-stone-700 mt-3 uppercase tracking-widest">Your key never leaves this device</p>

    {:else if status === 'done'}
      <div class="w-12 h-12 rounded-full bg-amber-600/20 border border-amber-600/40 flex items-center justify-center mx-auto mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-white font-bold mb-2">Download started</p>
      <p class="text-sm text-stone-400 mb-8">Decrypted entirely in your browser — the server never saw your file.</p>
      {#if pdfUrl}
        <a href={pdfUrl} download="ArchiveStream_decrypted.pdf"
           class="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-widest rounded-full transition-all">
          Download Again
        </a>
      {/if}

    {:else if status === 'error'}
      <div class="w-12 h-12 rounded-full bg-red-600/20 border border-red-600/40 flex items-center justify-center mx-auto mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-white font-bold mb-2">Decryption failed</p>
      <p class="text-sm text-red-400 mb-8">{errorMsg}</p>
      <a href="/" class="text-[11px] text-stone-600 hover:text-amber-500 uppercase tracking-widest transition-colors">
        Back to ArchiveStream
      </a>
    {/if}

  </div>
</div>