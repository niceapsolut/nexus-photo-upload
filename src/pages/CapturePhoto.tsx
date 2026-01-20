import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, CheckCircle, XCircle, RotateCcw, Upload, AlertCircle, Image, Video, X } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';
import { supabase } from '../lib/supabase';
import { applyOverlay } from '../utils/imageOverlay';

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

  // Detect desktop (Windows/Mac) vs mobile
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android|webos|blackberry|windows phone/i.test(userAgent);
    setIsDesktop(!isMobile);
  }, []);

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

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

  const captureFromWebcam = useCallback(() => {
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
  }, [stopWebcam]);

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
    reader.onload = (event) => {
      setCapturedImage(event.target?.result as string);
      setError(null);
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
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!capturedImage || !token) return;

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
      const overlayConfig = tokenData.overlay_config;
      let manipulatedBlob = originalBlob;
      let manipulatedDataUrl = capturedImage; // For showing to user
      
      if (overlayConfig?.enabled) {
        try {
          console.log('[Upload] Applying overlay...', overlayConfig);
          manipulatedBlob = await applyOverlay(originalBlob, overlayConfig.url, {
            position: overlayConfig.position,
            opacity: overlayConfig.opacity,
            scale: overlayConfig.scale,
          });
          console.log('[Upload] Overlay applied successfully');
          
          // Create data URL of manipulated version to show user
          manipulatedDataUrl = URL.createObjectURL(manipulatedBlob);
        } catch (overlayError) {
          console.warn('[Upload] Failed to apply overlay:', overlayError);
          // Continue with original if overlay fails
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
            has_overlay: overlayConfig?.enabled || false,
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
