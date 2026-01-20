# Photo Overlay Setup

## How It Works

Photos uploaded through the app will have a PNG overlay (watermark/logo) automatically applied before upload.

## Setup Instructions

### 1. Prepare Your Overlay Image

- Create or obtain a PNG image with transparency
- Recommended: Logo or watermark on transparent background
- Size: Any size (will be automatically scaled)

### 2. Add Overlay to Project

Place your overlay PNG in the `public` folder:
```
fotoportal/
  public/
    overlay.png  <-- Put your image here
```

### 3. Configure Overlay Settings

In `src/pages/CapturePhoto.tsx`, adjust these settings:

```typescript
const overlayUrl = '/overlay.png'; // Your overlay filename
const overlayEnabled = true;       // Toggle on/off
```

### 4. Customize Overlay Appearance

In the `applyOverlay` call (around line 135), you can customize:

```typescript
processedBlob = await applyOverlay(processedBlob, overlayUrl, {
  position: 'bottom-right',  // Options: 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'
  opacity: 0.8,              // 0-1 (0 = invisible, 1 = fully opaque)
  scale: 0.15,               // 0-1 (percentage of image size, 0.15 = 15%)
});
```

## Advanced: Dynamic Overlay Configuration

To make overlay configurable per upload token:

1. Add `overlay_config` JSONB column to `upload_tokens` table
2. Store overlay settings in the token
3. Fetch and apply during upload

Example:
```sql
ALTER TABLE upload_tokens ADD COLUMN overlay_config JSONB DEFAULT '{
  "enabled": true,
  "url": "/overlay.png",
  "position": "bottom-right",
  "opacity": 0.8,
  "scale": 0.15
}'::jsonb;
```

Then use these settings from `tokenData.overlay_config` in the upload flow.

## Testing

1. Place `overlay.png` in the `public` folder
2. Restart dev server: `npm run dev`
3. Capture a photo
4. Check browser console for: `[Upload] Applying overlay...` and `[Upload] Overlay applied successfully`
5. The uploaded photo will have your overlay

## Troubleshooting

- **Overlay not showing**: Check browser console for errors
- **CORS errors**: Ensure overlay is in `public` folder or hosted with CORS enabled
- **Wrong position**: Adjust `position` parameter
- **Too small/large**: Adjust `scale` parameter
- **Too faint/bold**: Adjust `opacity` parameter
