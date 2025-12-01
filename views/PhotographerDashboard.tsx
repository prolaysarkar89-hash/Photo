import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Share2, Trash2, Camera, QrCode, Sparkles, CheckCircle2, Loader2, Copy, Check } from 'lucide-react';
import { Photo, AppMode } from '../types';
import { generateId, resizeImage } from '../utils';
import { Button } from '../components/Button';
import { PhotoCard } from '../components/PhotoCard';

interface PhotographerDashboardProps {
  photos: Photo[];
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  onSwitchMode: (mode: AppMode) => void;
}

export const PhotographerDashboard: React.FC<PhotographerDashboardProps> = ({ photos, setPhotos, onSwitchMode }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Processing State
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const processingRef = useRef(false);

  // Simulated Event ID - Persisted via state so it doesn't change on re-renders
  const [eventId] = useState(() => "evt_" + Math.random().toString(36).substr(2, 5).toUpperCase());
  const eventLink = `https://eventlens.ai/e/${eventId}`; // Fake link for QR

  // Background Processor: Watches for unprocessed photos and generates AI-ready data
  useEffect(() => {
    const processNextBatch = async () => {
      if (processingRef.current) return;
      
      const unprocessed = photos.filter(p => !p.processed);
      if (unprocessed.length === 0) return;

      processingRef.current = true;
      const batch = unprocessed.slice(0, 3); // Process 3 at a time to keep UI responsive
      
      // Update queue for UI
      setProcessingQueue(batch.map(p => p.id));

      try {
        const updates = await Promise.all(batch.map(async (photo) => {
          // Pre-calculate the resized base64 for Gemini
          // This "indexes" the face data structure for rapid client comparison later
          const optimizedBase64 = await resizeImage(photo.file, 600);
          return { id: photo.id, optimizedBase64 };
        }));

        setPhotos(prev => prev.map(p => {
          const update = updates.find(u => u.id === p.id);
          if (update) {
            return { ...p, processed: true, optimizedBase64: update.optimizedBase64 };
          }
          return p;
        }));
      } catch (err) {
        console.error("Indexing failed for batch", err);
      } finally {
        setProcessingQueue([]);
        processingRef.current = false;
        // Re-trigger if more exist
        if (photos.some(p => !p.processed)) {
          setTimeout(processNextBatch, 100);
        }
      }
    };

    processNextBatch();
  }, [photos, setPhotos]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (files: FileList | null) => {
    if (!files) return;
    
    const newPhotos: Photo[] = Array.from(files).map(file => ({
      id: generateId(),
      url: URL.createObjectURL(file),
      file,
      timestamp: Date.now(),
      processed: false // Mark as needing indexing
    }));

    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
  };

  const clearGallery = () => {
    if(confirm("Are you sure you want to clear all photos?")) {
      setPhotos([]);
      setShowQR(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Event Photos',
          text: 'Scan your face to find your photos from the event!',
          url: eventLink,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      try {
        await navigator.clipboard.writeText(eventLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy');
      }
    }
  };

  const pendingCount = photos.filter(p => !p.processed).length;
  const processedCount = photos.length - pendingCount;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Photographer Dashboard</h1>
          <p className="text-slate-400 mt-1">Upload event photos to auto-index faces for clients.</p>
        </div>
        <div className="flex gap-3">
            {photos.length > 0 && (
                <Button variant="danger" onClick={clearGallery} icon={<Trash2 className="w-4 h-4" />}>
                    Clear
                </Button>
            )}
            <Button 
                variant={showQR ? 'primary' : 'outline'} 
                onClick={() => setShowQR(!showQR)}
                disabled={photos.length === 0}
                icon={<QrCode className="w-4 h-4" />}
            >
                {showQR ? 'Hide Code' : 'Generate QR'}
            </Button>
        </div>
      </div>

      {/* Indexing Status Bar */}
      {photos.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${pendingCount > 0 ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    <Sparkles className={`w-5 h-5 ${pendingCount > 0 ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-white">
                        {pendingCount > 0 ? 'AI Face Indexing in Progress...' : 'All Photos Indexed & Ready'}
                    </h3>
                    <p className="text-xs text-slate-400">
                        {pendingCount > 0 
                            ? `${processedCount} ready, ${pendingCount} remaining` 
                            : 'Face data optimized for instant client matching'}
                    </p>
                </div>
            </div>
            {pendingCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-indigo-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Processing...
                </div>
            )}
        </div>
      )}

      {/* QR Code Modal/Section */}
      {showQR && (
        <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-8 animate-in fade-in slide-in-from-top-4">
          <div className="bg-white p-4 rounded-xl shadow-xl shadow-black/20">
            <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(eventLink)}&color=0f172a`} 
                alt="Event QR Code" 
                className="w-48 h-48"
            />
          </div>
          <div className="flex-1 text-center md:text-left space-y-4">
            <div>
                <h3 className="text-xl font-semibold text-white">Event Ready!</h3>
                <p className="text-indigo-200">Share this code with guests to let them find their photos instantly.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
                 <Button onClick={handleShare} icon={copied ? <Check className="w-4 h-4"/> : <Share2 className="w-4 h-4" />}>
                    {copied ? 'Link Copied!' : 'Share Link'}
                 </Button>
                 
                 <Button variant="secondary" onClick={() => onSwitchMode(AppMode.CLIENT)} icon={<Camera className="w-4 h-4" />}>
                    Simulate Client Scan
                 </Button>

                 <div className="px-4 py-2 bg-slate-950 rounded-lg text-slate-400 font-mono text-sm border border-slate-800 flex items-center justify-center">
                    {eventId}
                 </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div 
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer group
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]' 
            : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          multiple 
          accept="image/*" 
          onChange={handleFileSelect}
        />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
            <Upload className="w-8 h-8 text-slate-400 group-hover:text-white" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">Drop photos here or click to upload</p>
            <p className="text-slate-400 text-sm mt-1">Supports high-res JPG, PNG</p>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      {photos.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <ImageIcon className="w-4 h-4" />
            <span>{photos.length} photos uploaded</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <PhotoCard url={photo.url} />
                {!photo.processed && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    </div>
                )}
                {photo.processed && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <CheckCircle2 className="w-3 h-3" />
                    </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
