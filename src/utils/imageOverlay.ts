/**
 * Apply PNG overlay to an image
 * @param imageFile - The base image file
 * @param overlayUrl - URL to the overlay PNG image
 * @param options - Overlay positioning options
 * @returns Promise<Blob> - The composited image as a blob
 */
export interface OverlayOptions {
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number; // 0-1
  scale?: number; // Overlay size relative to image (0-1)
}

export async function applyOverlay(
  imageFile: File | Blob,
  overlayUrl: string,
  options: OverlayOptions = {}
): Promise<Blob> {
  const {
    position = 'bottom-right',
    opacity = 1,
    scale = 0.2, // Overlay will be 20% of image size
  } = options;

  // Load the base image
  const baseImage = await loadImage(imageFile);
  
  // Load the overlay image
  const overlayImage = await loadImageFromUrl(overlayUrl);

  // Create canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Set canvas size to match base image
  canvas.width = baseImage.width;
  canvas.height = baseImage.height;

  // Draw base image
  ctx.drawImage(baseImage, 0, 0);

  // Calculate overlay dimensions
  // Scale determines how much of the image the overlay covers
  // At scale=1.0 (100%), overlay covers entire image
  let overlayWidth: number;
  let overlayHeight: number;
  
  if (scale >= 0.95) {
    // At 95%+ scale, cover the entire image (ignore aspect ratio)
    overlayWidth = baseImage.width;
    overlayHeight = baseImage.height;
  } else {
    // Below 95%, scale proportionally based on image dimensions (cover mode)
    // This ensures the overlay always covers the scaled area
    const imageAspect = baseImage.width / baseImage.height;
    const overlayAspect = overlayImage.width / overlayImage.height;
    
    if (overlayAspect > imageAspect) {
      // Overlay is wider - scale based on height
      overlayHeight = baseImage.height * scale;
      overlayWidth = overlayHeight * overlayAspect;
    } else {
      // Overlay is taller - scale based on width
      overlayWidth = baseImage.width * scale;
      overlayHeight = overlayWidth / overlayAspect;
    }
  }

  // Calculate overlay position (no padding - goes to edges)
  let x = 0;
  let y = 0;

  switch (position) {
    case 'center':
      x = (baseImage.width - overlayWidth) / 2;
      y = (baseImage.height - overlayHeight) / 2;
      break;
    case 'top-left':
      x = 0;
      y = 0;
      break;
    case 'top-right':
      x = baseImage.width - overlayWidth;
      y = 0;
      break;
    case 'bottom-left':
      x = 0;
      y = baseImage.height - overlayHeight;
      break;
    case 'bottom-right':
      x = baseImage.width - overlayWidth;
      y = baseImage.height - overlayHeight;
      break;
  }

  // Apply opacity and draw overlay
  ctx.globalAlpha = opacity;
  ctx.drawImage(overlayImage, x, y, overlayWidth, overlayHeight);
  ctx.globalAlpha = 1; // Reset

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Load image from File/Blob
 */
function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Load image from URL
 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Allow CORS if overlay is from different origin
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load overlay from ${url}`));
    
    img.src = url;
  });
}
