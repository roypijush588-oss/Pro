const MAX_IMAGE_DIMENSION = 1600;
const MAX_PASSTHROUGH_DATA_URL_LENGTH = 1_200_000; // ~900 KB binary, well within Vercel 4.5 MB limit
const SUPPORTED_GEMINI_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image file.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read the selected image file. Please try another image.'));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image format cannot be processed in your browser. Please use JPG, PNG, or WebP.'));
    img.src = src;
  });
}

export async function prepareImageDataUrl(file: File): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (JPG, PNG, or WebP).');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const normalizedType = file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();

  try {
    const img = await loadImageElement(rawDataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    const needsResize = width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;
    const needsCompression = rawDataUrl.length > MAX_PASSTHROUGH_DATA_URL_LENGTH;
    const needsFormatConversion = !SUPPORTED_GEMINI_IMAGE_TYPES.has(normalizedType);

    if (!needsResize && !needsCompression && !needsFormatConversion) {
      return rawDataUrl;
    }

    const scale = needsResize ? Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height) : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return rawDataUrl;
    }

    // Fill white background so transparent PNGs convert cleanly to JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let compressed = canvas.toDataURL('image/jpeg', 0.85);
    if (compressed.length > 2_500_000) {
      compressed = canvas.toDataURL('image/jpeg', 0.7);
    }
    return compressed;
  } catch (err) {
    // Allow HEIC/HEIF files that some desktop browsers can't decode into <img> if they are small enough
    if ((normalizedType === 'image/heic' || normalizedType === 'image/heif') && rawDataUrl.length <= 3_500_000) {
      return rawDataUrl;
    }
    throw err instanceof Error ? err : new Error('Failed to process the selected image.');
  }
}
