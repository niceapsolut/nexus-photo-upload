import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, CheckCircle, XCircle, RotateCcw, Upload, AlertCircle, Image, Video, X, ChevronLeft, ChevronRight, Clock, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';
import { supabase } from '../lib/supabase';
import { applyOverlay } from '../utils/imageOverlay';
import {
  OverlayConfig,
  OverlayItem,
  isLegacyOverlayConfig,
  migrateLegacyConfig,
} from '../types/overlay';
import {
  UploadHistoryItem,
  saveToHistory,
  getHistoryByToken,
  deleteFromHistory,
  formatTimestamp,
} from '../utils/uploadHistory';

interface SuccessConfig {
  show_photo: boolean;
  title: string;
  message: string;
  button_text: string;
  enable_redirect: boolean;
  redirect_url: string;
  redirect_delay: number;
}

export default function CapturePhoto() {
  const [searchParams] = useSearchParams();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [successConfig, setSuccessConfig] = useState<SuccessConfig | null>(null);
  const [isWebcamMode, setIsWebcamMode] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const MAX_FILE_SIZE = 15 * 1024 * 1024;

  // Overlay selection state
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig | null>(null);
  const [showOverlayCarousel, setShowOverlayCarousel] = useState(false);
  const [selectedOverlayIndex, setSelectedOverlayIndex] = useState<number | null>(null);
  const [availableOverlays, setAvailableOverlays] = useState<OverlayItem[]>([]);
  const [imageOrientation, setImageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const carouselRef = useRef<HTMLDivElement>(null);

  // Upload history state
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHistoryImage, setExpandedHistoryImage] = useState<UploadHistoryItem | null>(null);

  const token = searchParams.get('t');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (!token) {
      setError('No upload token provided');
      setTokenValid(false);
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Application configuration error. Please check environment variables.');
      console.error('Missing env vars:', { supabaseUrl, supabaseAnonKey });
    }
  }, [token, supabaseUrl, supabaseAnonKey]);

  // Fetch token data early to get overlay config
  useEffect(() => {
    if (!token) return;

    const fetchTokenData = async () => {
      try {
        const { data: tokenData } = await supabase
          .from('upload_tokens')
          .select('overlay_config')
          .eq('id', token)
          .maybeSingle();

        if (tokenData?.overlay_config) {
          let config: OverlayConfig;
          if (isLegacyOverlayConfig(tokenData.overlay_config)) {
            config = migrateLegacyConfig(tokenData.overlay_config);
          } else {
            config = tokenData.overlay_config as OverlayConfig;
          }
          setOverlayConfig(config);
        }
      } catch (err) {
        console.error('Error fetching token overlay config:', err);
      }
    };

    fetchTokenData();
  }, [token]);

  // Detect desktop (Windows/Mac) vs mobile
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android|webos|blackberry|windows phone/i.test(userAgent);
    setIsDesktop(!isMobile);
  }, []);

  // Load upload history for this token
  useEffect(() => {
    if (!token) return;

    const loadHistory = async () => {
      try {
        const history = await getHistoryByToken(token);
        setUploadHistory(history);
      } catch (err) {
        console.error('Failed to load upload history:', err);
      }
    };

    loadHistory();
  }, [token]);

  // Reload history after successful upload
  const reloadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const history = await getHistoryByToken(token);
      setUploadHistory(history);
    } catch (err) {
      console.error('Failed to reload history:', err);
    }
  }, [token]);

  // Delete history item
  const handleDeleteHistoryItem = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteFromHistory(id);
    setUploadHistory(prev => prev.filter(item => item.id !== id));
    if (expandedHistoryImage?.id === id) {
      setExpandedHistoryImage(null);
    }
  }, [expandedHistoryImage]);

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  // Detect image orientation from data URL - must be defined before processImageForOverlay
  const detectOrientation = useCallback((dataUrl: string): Promise<'portrait' | 'landscape'> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const orientation = img.height > img.width ? 'portrait' : 'landscape';
        resolve(orientation);
      };
      img.onerror = () => resolve('portrait'); // Default to portrait on error
      img.src = dataUrl;
    });
  }, []);

  // Filter overlays based on orientation and enabled status - must be defined before processImageForOverlay
  const getAvailableOverlays = useCallback((config: OverlayConfig, orientation: 'portrait' | 'landscape'): OverlayItem[] => {
    return config.overlays.filter(overlay => {
      const settings = overlay[orientation];
      const imageUrl = orientation === 'portrait' ? overlay.portraitUrl : overlay.landscapeUrl;
      return settings.enabled && imageUrl;
    });
  }, []);

  // Process image capture - detect orientation and show carousel if needed
  // Must be defined before captureFromWebcam which uses it
  const processImageForOverlay = useCallback(async (dataUrl: string, config: OverlayConfig | null) => {
    if (!config?.enabled || config.overlays.length === 0) {
      // No overlay config - proceed directly
      return;
    }

    // Detect orientation
    const orientation = await detectOrientation(dataUrl);
    setImageOrientation(orientation);

    // Get available overlays for this orientation
    const available = getAvailableOverlays(config, orientation);
    setAvailableOverlays(available);

    if (available.length === 0) {
      // No overlays available for this orientation
      return;
    }

    if (config.mode === 'random') {
      // Random mode - auto-select one overlay
      const randomIndex = Math.floor(Math.random() * available.length);
      setSelectedOverlayIndex(randomIndex);
    } else {
      // User choice mode - show carousel
      setShowOverlayCarousel(true);
      setSelectedOverlayIndex(0); // Default to first overlay
    }
  }, [detectOrientation, getAvailableOverlays]);

  const startWebcam = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setWebcamStream(stream);
      setIsWebcamMode(true);

      // Wait for videoRef to be available
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Webcam error:', err);
      setError('Could not access webcam. Please check permissions.');
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
    setIsWebcamMode(false);
  }, [webcamStream]);

  const captureFromWebcam = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    setCapturedImage(dataUrl);
    stopWebcam();

    // Process for overlay selection if config exists
    if (overlayConfig) {
      await processImageForOverlay(dataUrl, overlayConfig);
    }
  }, [stopWebcam, overlayConfig, processImageForOverlay]);

  const validateFile = (file: File | undefined): string | null => {
    if (!file) return 'No file selected';
    if (!file.type.startsWith('image/')) return 'Please select an image file';
    if (file.size > MAX_FILE_SIZE) return 'Image is too large (max 15MB)';
    return null;
  };

  const handleFileSelected = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setError(error);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      setError(null);

      // Process for overlay selection if config exists
      if (overlayConfig) {
        await processImageForOverlay(dataUrl, overlayConfig);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const handleRetake = () => {
    setCapturedImage(null);
    setError(null);
    setShowOverlayCarousel(false);
    setSelectedOverlayIndex(null);
    setAvailableOverlays([]);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  // Handle overlay selection and proceed to upload
  const handleOverlaySelected = useCallback((index: number | null) => {
    setSelectedOverlayIndex(index);
  }, []);

  // Navigate carousel
  const navigateCarousel = useCallback((direction: 'left' | 'right') => {
    const totalItems = availableOverlays.length + 1; // +1 for "No overlay" option
    setSelectedOverlayIndex(prev => {
      const current = prev === null ? 0 : prev + 1; // Convert to 0-based index (0 = no overlay)
      let next: number;
      if (direction === 'left') {
        next = (current - 1 + totalItems) % totalItems;
      } else {
        next = (current + 1) % totalItems;
      }
      return next === 0 ? null : next - 1;
    });
  }, [availableOverlays.length]);

  // Scroll carousel to center selected item
  useEffect(() => {
    if (carouselRef.current && showOverlayCarousel) {
      const container = carouselRef.current;
      const selectedIndex = selectedOverlayIndex === null ? 0 : selectedOverlayIndex + 1;
      const items = container.children;
      if (items[selectedIndex]) {
        const item = items[selectedIndex] as HTMLElement;
        const containerWidth = container.offsetWidth;
        const itemLeft = item.offsetLeft;
        const itemWidth = item.offsetWidth;
        const scrollTo = itemLeft - (containerWidth / 2) + (itemWidth / 2);
        container.scrollTo({ left: scrollTo, behavior: 'smooth' });
      }
    }
  }, [selectedOverlayIndex, showOverlayCarousel]);

  const handleUpload = async () => {
    if (!capturedImage || !token) return;

    // If carousel is showing and user hasn't confirmed, don't proceed
    if (showOverlayCarousel) {
      // User needs to click the upload button after selecting overlay
      setShowOverlayCarousel(false);
    }

    setUploading(true);
    setError(null);

    try {
      // Step 1: Validate token by querying database directly
      console.log('[Upload] Step 1: Validating token...');
      const { data: tokenData, error: tokenError } = await supabase
        .from('upload_tokens')
        .select('*')
        .eq('id', token)
        .maybeSingle();

      if (tokenError) {
        console.error('[Upload] Token lookup error:', tokenError);
        throw new Error('Database error validating token');
      }

      if (!tokenData) {
        throw new Error('Invalid or expired token');
      }

      console.log('[Upload] Token found:', tokenData.name);

      // Store success configuration
      if (tokenData.success_config) {
        setSuccessConfig(tokenData.success_config);
      }

      // Validate token status
      if (!tokenData.is_active) {
        throw new Error('This upload link is no longer active');
      }

      if (tokenData.expires_at) {
        const expiresAt = new Date(tokenData.expires_at);
        if (new Date() > expiresAt) {
          throw new Error('This upload link has expired');
        }
      }

      if (tokenData.upload_count >= tokenData.max_uploads) {
        throw new Error('Maximum uploads reached for this link');
      }

      // Step 2: Get original image
      console.log('[Upload] Step 2: Processing image...');
      const response = await fetch(capturedImage);
      const originalBlob = await response.blob();

      // Step 3: Apply overlay (if enabled) and compress both versions
      console.log('[Upload] Step 3: Compressing images...');

      // Handle overlay config - support both legacy and new format
      let processedOverlayConfig: OverlayConfig | null = null;
      if (tokenData.overlay_config) {
        if (isLegacyOverlayConfig(tokenData.overlay_config)) {
          processedOverlayConfig = migrateLegacyConfig(tokenData.overlay_config);
        } else {
          processedOverlayConfig = tokenData.overlay_config as OverlayConfig;
        }
      }

      let manipulatedBlob = originalBlob;
      let manipulatedDataUrl = capturedImage; // For showing to user
      let hasOverlay = false;

      // Apply overlay if enabled and an overlay is selected
      if (processedOverlayConfig?.enabled && selectedOverlayIndex !== null && availableOverlays.length > 0) {
        const selectedOverlay = availableOverlays[selectedOverlayIndex];
        if (selectedOverlay) {
          const settings = selectedOverlay[imageOrientation];
          const overlayUrl = imageOrientation === 'portrait'
            ? selectedOverlay.portraitUrl
            : selectedOverlay.landscapeUrl;

          if (overlayUrl && settings.enabled) {
            try {
              console.log('[Upload] Applying overlay...', {
                name: selectedOverlay.name,
                orientation: imageOrientation,
                url: overlayUrl,
                settings,
              });

              manipulatedBlob = await applyOverlay(originalBlob, overlayUrl, {
                position: settings.position,
                opacity: settings.opacity,
                scale: settings.scale,
              });
              console.log('[Upload] Overlay applied successfully');
              hasOverlay = true;

              // Create data URL of manipulated version to show user
              manipulatedDataUrl = URL.createObjectURL(manipulatedBlob);
            } catch (overlayError) {
              console.warn('[Upload] Failed to apply overlay:', overlayError);
              // Continue with original if overlay fails
            }
          }
        }
      }

      // Compress manipulated version (with overlay)
      const manipulatedFile = new File([manipulatedBlob], 'photo.jpg', { type: 'image/jpeg' });
      const compressedManipulated = await compressImage(manipulatedFile, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 0.85,
        mimeType: 'image/jpeg',
      });
      console.log('[Upload] Compressed manipulated size:', compressedManipulated.size, 'bytes');

      // Compress original version (no overlay)
      const originalFile = new File([originalBlob], 'photo.jpg', { type: 'image/jpeg' });
      const compressedOriginal = await compressImage(originalFile, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 0.85,
        mimeType: 'image/jpeg',
      });
      console.log('[Upload] Compressed original size:', compressedOriginal.size, 'bytes');

      // Step 4: Generate upload ID and paths
      const uploadId = crypto.randomUUID();
      const manipulatedPath = `pending/${token}/${uploadId}.jpg`;
      const originalPath = `pending/${token}/${uploadId}_original.jpg`;
      console.log('[Upload] Step 4: Uploading to storage...');

      // Upload manipulated version (this is what user sees)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('photo-uploads')
        .upload(manipulatedPath, compressedManipulated, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('[Upload] Manipulated upload failed:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Upload original version (for admin use)
      const { error: originalError } = await supabase.storage
        .from('photo-uploads')
        .upload(originalPath, compressedOriginal, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (originalError) {
        console.warn('[Upload] Original upload failed:', originalError);
        // Don't throw - manipulated version is uploaded successfully
      }

      console.log('[Upload] Storage uploads successful!');
      console.log('[Upload] Manipulated:', uploadData.path);
      console.log('[Upload] Original:', originalPath);
      
      // Update captured image to show manipulated version to user
      setCapturedImage(manipulatedDataUrl);

      // Step 5: Record upload in database
      console.log('[Upload] Step 5: Recording upload...');
      console.log('[Upload] Inserting:', {
        id: uploadId,
        token_id: token,
        storage_path: manipulatedPath,
        file_size: compressedManipulated.size,
        mime_type: 'image/jpeg',
      });
      const { error: recordError } = await supabase
        .from('pending_uploads')
        .insert({
          id: uploadId,
          token_id: token,
          storage_path: manipulatedPath,
          file_size: compressedManipulated.size,
          mime_type: 'image/jpeg',
          metadata: {
            original_name: 'photo.jpg',
            compressed: true,
            has_overlay: hasOverlay,
            overlay_name: hasOverlay && selectedOverlayIndex !== null ? availableOverlays[selectedOverlayIndex]?.name : null,
            orientation: imageOrientation,
            original_path: originalPath,
            manipulated_path: manipulatedPath,
            timestamp: new Date().toISOString(),
          },
        });

      if (recordError) {
        console.error('[Upload] Record creation failed:', recordError);
        throw new Error(`Failed to record upload: ${recordError.message}`);
      }

      // Step 6: Increment upload count
      const { error: updateError } = await supabase
        .from('upload_tokens')
        .update({ upload_count: tokenData.upload_count + 1 })
        .eq('id', token);

      if (updateError) {
        console.error('[Upload] Count update failed:', updateError);
        // Don't throw - upload already succeeded
      }

      console.log('[Upload] Upload recorded successfully!');

      // Save to local history
      try {
        const overlayName = hasOverlay && selectedOverlayIndex !== null
          ? availableOverlays[selectedOverlayIndex]?.name
          : undefined;
        await saveToHistory(manipulatedDataUrl, token, overlayName);
        await reloadHistory();
      } catch (historyErr) {
        console.warn('[Upload] Failed to save to history:', historyErr);
        // Don't fail the upload for history errors
      }

      setSuccess(true);

      // Handle redirect if enabled
      if (successConfig?.enable_redirect && successConfig.redirect_url) {
        setTimeout(() => {
          window.location.href = successConfig.redirect_url;
        }, successConfig.redirect_delay);
      }
    } catch (err) {
      console.error('[Upload] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Link</h1>
          <p className="text-slate-600">
            This upload link is invalid or has expired. Please request a new link.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    // Use config defaults if not set
    const config = successConfig || {
      show_photo: true,
      title: 'Upload Successful!',
      message: 'Your photo has been uploaded and is awaiting approval.',
      button_text: '📸 DO IT AGAIN!',
      enable_redirect: false,
      redirect_url: '',
      redirect_delay: 3000,
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4 animate-bounce" />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{config.title}</h1>
          <p className="text-slate-600 mb-6">
            {config.message}
          </p>
          
          {/* Show uploaded photo if enabled */}
          {config.show_photo && capturedImage && (
            <div className="mb-6 rounded-lg overflow-hidden shadow-lg">
              <img 
                src={capturedImage} 
                alt="Uploaded" 
                className="w-full h-auto"
              />
            </div>
          )}
          
          {/* Only show button if not redirecting */}
          {!config.enable_redirect && (
            <>
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setSuccess(false);
                  setError(null);
                }}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg animate-pulse-scale text-xl"
              >
                {config.button_text}
              </button>
              
              <p className="text-slate-500 text-sm mt-4">
                Upload another photo with the same link
              </p>
            </>
          )}

          {/* Show redirect message if enabled */}
          {config.enable_redirect && (
            <p className="text-slate-500 text-sm mt-4 animate-pulse">
              Redirecting in {Math.ceil(config.redirect_delay / 1000)} seconds...
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Photo Upload</h1>
          <p className="text-sm text-slate-600 mt-1">Capture and upload your photo</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full">
          {/* Hidden canvas for webcam capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Webcam live preview mode */}
          {isWebcamMode && !capturedImage && (
            <div className="space-y-6">
              <div className="relative rounded-xl overflow-hidden bg-slate-900">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto max-h-96 object-contain transform scale-x-[-1]"
                />
                <button
                  onClick={stopWebcam}
                  className="absolute top-3 right-3 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-2 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <button
                onClick={captureFromWebcam}
                className="w-full flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition-colors"
              >
                <Camera className="w-6 h-6" />
                <span>Snap Photo</span>
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Photo selection mode */}
          {!isWebcamMode && !capturedImage && (
            <div className="space-y-6">
              <div className="text-center">
                <Camera className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Add a Photo</h2>
                <p className="text-slate-600">
                  Take a photo or choose from your gallery
                </p>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture
                onChange={handleCameraCapture}
                className="hidden"
                id="camera-input"
              />

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleGallerySelect}
                className="hidden"
                id="gallery-input"
              />

              <div className="grid gap-4 grid-cols-2">
                {/* Take Photo - mobile only */}
                {!isDesktop && (
                  <button
                    type="button"
                    onClick={openCamera}
                    className="flex flex-col items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-6 px-4 rounded-xl transition-colors"
                  >
                    <Camera className="w-8 h-8" />
                    <span className="text-sm">Take Photo</span>
                  </button>
                )}

                {/* Webcam - desktop only */}
                {isDesktop && (
                  <button
                    type="button"
                    onClick={startWebcam}
                    className="flex flex-col items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-6 px-4 rounded-xl transition-colors"
                  >
                    <Video className="w-8 h-8" />
                    <span className="text-sm">Webcam</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={openGallery}
                  className="flex flex-col items-center justify-center gap-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-6 px-4 rounded-xl transition-colors"
                >
                  <Image className="w-8 h-8" />
                  <span className="text-sm">Gallery</span>
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {/* Upload History Section */}
              {uploadHistory.length > 0 && (
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">
                        Recent Uploads ({uploadHistory.length})
                      </span>
                    </div>
                    {showHistory ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </button>

                  {showHistory && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {uploadHistory.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setExpandedHistoryImage(item)}
                          className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 cursor-pointer group"
                        >
                          <img
                            src={item.thumbnailData}
                            alt={`Upload from ${formatTimestamp(item.timestamp)}`}
                            className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <button
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                          <span className="absolute bottom-1 left-1 text-[10px] text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            {formatTimestamp(item.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Expanded History Image Modal */}
          {expandedHistoryImage && (
            <div
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
              onClick={() => setExpandedHistoryImage(null)}
            >
              <div className="relative max-w-2xl w-full bg-white rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setExpandedHistoryImage(null)}
                  className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors z-10"
                >
                  <X className="w-5 h-5" />
                </button>
                <img
                  src={expandedHistoryImage.imageData}
                  alt="Full size"
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
                <div className="p-4 bg-white border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">
                        {formatTimestamp(expandedHistoryImage.timestamp)}
                      </p>
                      {expandedHistoryImage.overlayName && (
                        <p className="text-xs text-slate-500">
                          Overlay: {expandedHistoryImage.overlayName}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        handleDeleteHistoryItem(expandedHistoryImage.id, e);
                        setExpandedHistoryImage(null);
                      }}
                      className="flex items-center gap-1 text-red-600 hover:text-red-700 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Captured image preview */}
          {capturedImage && (
            <div className="space-y-6">
              <div className="relative rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full h-auto max-h-96 object-contain"
                />
              </div>

              {/* Overlay Carousel */}
              {showOverlayCarousel && availableOverlays.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-700 text-center">
                    Choose an overlay style
                  </p>

                  <div className="relative">
                    {/* Left Arrow */}
                    <button
                      type="button"
                      onClick={() => navigateCarousel('left')}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg rounded-full p-2 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5 text-slate-700" />
                    </button>

                    {/* Carousel Container */}
                    <div
                      ref={carouselRef}
                      className="flex gap-3 overflow-x-auto scrollbar-hide px-10 py-2 snap-x snap-mandatory"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {/* No Overlay Option */}
                      <div
                        onClick={() => handleOverlaySelected(null)}
                        className={`flex-shrink-0 snap-center cursor-pointer transition-all ${
                          selectedOverlayIndex === null
                            ? 'ring-2 ring-blue-500 ring-offset-2'
                            : 'hover:opacity-80'
                        }`}
                      >
                        <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center">
                          <X className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-xs text-center mt-1 text-slate-600 truncate w-20">
                          No overlay
                        </p>
                      </div>

                      {/* Overlay Options */}
                      {availableOverlays.map((overlay, index) => {
                        const previewUrl = imageOrientation === 'portrait'
                          ? overlay.portraitUrl
                          : overlay.landscapeUrl;

                        return (
                          <div
                            key={overlay.id}
                            onClick={() => handleOverlaySelected(index)}
                            className={`flex-shrink-0 snap-center cursor-pointer transition-all ${
                              selectedOverlayIndex === index
                                ? 'ring-2 ring-blue-500 ring-offset-2'
                                : 'hover:opacity-80'
                            }`}
                          >
                            <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden">
                              <img
                                src={previewUrl}
                                alt={overlay.name || `Overlay ${index + 1}`}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
                                }}
                              />
                            </div>
                            <p className="text-xs text-center mt-1 text-slate-600 truncate w-20">
                              {overlay.name || `Style ${index + 1}`}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Arrow */}
                    <button
                      type="button"
                      onClick={() => navigateCarousel('right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg rounded-full p-2 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5 text-slate-700" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 text-center">
                    Swipe or use arrows to browse • Tap to select
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleRetake}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  Retake
                </button>

                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                  {uploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-500">
            By uploading, you confirm you have the rights to this photo
          </p>
        </div>
      </footer>
    </div>
  );
}
