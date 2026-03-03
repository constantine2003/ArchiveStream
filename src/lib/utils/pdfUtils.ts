/**
 * Resample an image to ~150 DPI (max 1200px on long side), keeping aspect ratio.
 */
export async function resampleImage(
  imageBytes: Uint8Array | ArrayBuffer,
  mimeType: string
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let arrayBuffer: ArrayBuffer;
    if (imageBytes instanceof Uint8Array) {
      arrayBuffer = imageBytes.buffer as ArrayBuffer;
    } else {
      arrayBuffer = imageBytes;
    }

    const blob = new Blob([arrayBuffer], { type: mimeType });
    const img = new Image();

    img.onload = () => {
      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas 2D context'));

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        async (result) => {
          if (!result) return reject(new Error('Canvas export failed'));
          const buf = await result.arrayBuffer();
          resolve(new Uint8Array(buf));
        },
        'image/jpeg',
        0.7
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Shrink an image File to maxWidth px at the given JPEG quality.
 * Returns an ArrayBuffer of the compressed JPEG.
 */
export async function shrinkImage(
  file: File,
  maxWidth = 1600,
  quality = 0.75
): Promise<ArrayBuffer> {
  const originalSizeKB = Math.round(file.size / 1024);
  console.group(`%c ArchiveStream Optimizer: ${file.name} `, 'background: #222; color: #bada55');
  console.log(`Original Size: ${originalSizeKB} KB`);

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        console.log(`Original Dimensions: ${width}px x ${height}px`);

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
          console.log(`%c Resizing to: ${Math.round(width)}px x ${Math.round(height)}px`, 'color: #ffa500');
        } else {
          console.log('%c Image width within limits. No resizing needed.', 'color: #888');
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            const newSizeKB = Math.round(blob!.size / 1024);
            const ratio = Math.round((1 - blob!.size / file.size) * 100);
            console.log(`New Size: ${newSizeKB} KB`);
            if (ratio > 0) {
              console.log(`%c Efficiency: Reduced by ${ratio}%`, 'color: #00ff00; font-weight: bold');
            } else {
              console.log(`%c Note: File is ${Math.abs(ratio)}% larger after optimization.`, 'color: #ff4444');
            }
            console.groupEnd();
            resolve(blob!.arrayBuffer());
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Converts strings like "1, 3-5" into [1, 3, 4, 5]
 */
export function parsePageRanges(input: string, maxPages: number): number[] {
  if (!input || input.toLowerCase() === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>();
  input.split(',').forEach((part) => {
    const range = part.trim().split('-');
    if (range.length === 2) {
      const start = Math.max(1, parseInt(range[0]));
      const end = Math.min(maxPages, parseInt(range[1]));
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const page = parseInt(part.trim());
      if (page > 0 && page <= maxPages) pages.add(page);
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Set PDF metadata. Pass shouldOptimize=true to enable future compression hooks.
 */
export async function optimizeMetadataAndImages(pdfDoc: any, shouldOptimize: boolean) {
  pdfDoc.setTitle('ArchiveStream Unified Document');
  pdfDoc.setAuthor('ArchiveStream Workstation');
  pdfDoc.setSubject('Consolidated Digital Archive');
  pdfDoc.setProducer('ArchiveStream (Atelier Engine)');
  pdfDoc.setCreator('ArchiveStream Cloud Bridge');
  // shouldOptimize hook: image resampling can be wired here in a future phase
  void shouldOptimize;
}