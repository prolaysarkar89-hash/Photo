import React, { useState, useRef, useEffect } from 'react';
import { Camera, Search, ArrowLeft, CheckCircle, AlertCircle, ScanFace, MessageCircle, Send, Upload, X, Play, RefreshCw } from 'lucide-react';
import { Photo } from '../types';
import { resizeImage } from '../utils';
import { findFaceMatches } from '../services/geminiService';
import { Button } from '../components/Button';
import { PhotoCard } from '../components/PhotoCard';

interface ClientPortalProps {
  eventPhotos: Photo[];
  onBack: () => void;
}

type RecordingStep = 'IDLE' | 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'SMILE' | 'COMPLETED';

export const ClientPortal: React.FC<ClientPortalProps> = ({ eventPhotos, onBack }) => {
  const [referenceFrames, setReferenceFrames] = useState<string[]>([]); // All captured angles
  const [displaySelfie, setDisplaySelfie] = useState<string | null>(null); // Main avatar to show
  
  const [isScanning, setIsScanning] = useState(false);
  const [matchedPhotoIds, setMatchedPhotoIds] = useState<string[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Camera & Recording State
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recordingStep, setRecordingStep] = useState<RecordingStep>('IDLE');
  const [stepProgress, setStepProgress] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // WhatsApp State
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [waSent, setWaSent] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop camera when component unmounts
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Attach stream to video element when camera is shown
  useEffect(() => {
    if (showCamera && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [showCamera, cameraStream]);

  const startCamera = async () => {
    setError(null);
    setReferenceFrames([]);
    setRecordingStep('IDLE');
    setStepProgress(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      setCameraStream(stream);
      setShowCamera(true);
    } catch (err) {
      console.error(err);
      setError("Unable to access camera. Please allow permissions or use the upload option.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
    setRecordingStep('IDLE');
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current) return null;
    
    // Resize for AI processing
    const maxWidth = 600;
    const scale = maxWidth / videoRef.current.videoWidth;
    const width = maxWidth;
    const height = videoRef.current.videoHeight * scale;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.85);
    }
    return null;
  };

  const runRecordingSequence = () => {
    // Increased duration to 4.5 seconds per step to allow client to position properly
    const STEP_DURATION = 4500; 
    const frames: string[] = [];
    
    // Helper to run a step
    const runStep = (step: RecordingStep, next: () => void) => {
      setRecordingStep(step);
      setStepProgress(0);
      
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const prog = Math.min(100, (elapsed / STEP_DURATION) * 100);
        setStepProgress(prog);
        
        if (elapsed >= STEP_DURATION) {
            clearInterval(interval);
            const frame = captureFrame();
            if (frame) frames.push(frame);
            next();
        }
      }, 50);
    };

    // Sequence: Straight -> Left -> Right -> Smile
    runStep('STRAIGHT', () => {
      runStep('LEFT', () => {
        runStep('RIGHT', () => {
          runStep('SMILE', () => {
            setRecordingStep('COMPLETED');
            finishRecording(frames);
          });
        });
      });
    });
  };

  const finishRecording = (frames: string[]) => {
    if (frames.length > 0) {
      // Use the first frame (Straight) as the display avatar
      setDisplaySelfie(frames[0]);
      
      // Store all frames (base64 stripped) for the AI
      const cleanFrames = frames.map(f => f.split(',')[1]);
      setReferenceFrames(cleanFrames);
      
      // Reset match states
      setMatchedPhotoIds([]);
      setError(null);
      setWaSent(false);
      
      // Close camera after a brief success delay
      setTimeout(() => {
        stopCamera();
      }, 1000);
    } else {
        setError("Failed to capture video frames.");
        stopCamera();
    }
  };

  const handleSelfieSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setDisplaySelfie(url);
      
      try {
        const base64 = await resizeImage(file, 600); // Resize for faster processing
        // Wrap in array for compatibility with new service
        setReferenceFrames([base64]);
        
        setMatchedPhotoIds([]); // Reset matches
        setError(null);
        setWaSent(false); // Reset WA status
      } catch (err) {
        setError("Failed to process photo. Please try again.");
      }
    }
  };

  const startScan = async () => {
    if (referenceFrames.length === 0 || eventPhotos.length === 0) return;
    
    setIsScanning(true);
    setScanProgress(0);
    setMatchedPhotoIds([]);
    setError(null);
    setWaSent(false);

    // Filter out photos that haven't been indexed/processed by the photographer yet, or process on fly if needed
    const photosToScan = eventPhotos;
    const BATCH_SIZE = 4; // Process in small batches
    const totalPhotos = photosToScan.length;
    let foundMatches: string[] = [];

    try {
        // Chunk the photos
        for (let i = 0; i < totalPhotos; i += BATCH_SIZE) {
            const chunk = photosToScan.slice(i, i + BATCH_SIZE);
            
            // OPTIMIZATION: Use pre-computed "ID" (optimizedBase64) if available to skip client-side resizing
            const candidateBase64s = await Promise.all(
                chunk.map(async (p) => {
                    if (p.optimizedBase64) return p.optimizedBase64;
                    // Fallback if photographer dashboard hasn't finished indexing
                    return await resizeImage(p.file, 600); 
                })
            );

            // Call Gemini with ARRAY of reference frames
            const indices = await findFaceMatches(referenceFrames, candidateBase64s);
            
            // Map relative indices back to global IDs
            const chunkMatchIds = indices.map(idx => chunk[idx].id);
            foundMatches = [...foundMatches, ...chunkMatchIds];
            
            // Update UI progressively
            setMatchedPhotoIds(prev => [...prev, ...chunkMatchIds]);
            setScanProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / totalPhotos) * 100)));
        }
    } catch (err) {
        setError("AI service unavailable or interrupted. Please try again.");
        console.error(err);
    } finally {
        setIsScanning(false);
        setScanProgress(100);
    }
  };

  const handleDeselect = (photoId: string) => {
    setMatchedPhotoIds(prev => prev.filter(id => id !== photoId));
  };

  const handleSendWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappNumber || matchedPhotos.length === 0) return;

    setIsSendingWa(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsSendingWa(false);
    setWaSent(true);
    setWhatsappNumber('');
    
    // Optional: Reset success message after some time
    setTimeout(() => setWaSent(false), 8000);
  };

  const matchedPhotos = eventPhotos.filter(p => matchedPhotoIds.includes(p.id));

  // Render Overlay Content based on Step
  const getOverlayContent = () => {
    switch (recordingStep) {
        case 'IDLE':
            return (
                <div className="text-center space-y-4">
                    <p className="text-white text-lg font-medium drop-shadow-md">Position your face in the center</p>
                    <button 
                        onClick={runRecordingSequence}
                        className="w-20 h-20 rounded-full border-4 border-white bg-red-500/80 backdrop-blur-sm flex items-center justify-center hover:bg-red-500 transition-all active:scale-95 shadow-lg mx-auto"
                    >
                        <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
                    </button>
                    <p className="text-white/70 text-sm">Tap to Start Scan</p>
                </div>
            );
        case 'COMPLETED':
             return (
                <div className="flex flex-col items-center justify-center text-green-400 animate-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center backdrop-blur-md mb-4">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <span className="text-2xl font-bold text-white drop-shadow-md">Scan Complete!</span>
                </div>
             );
        default:
            const instructions: Record<string, string> = {
                'STRAIGHT': 'Look Straight',
                'LEFT': 'Turn Head Left',
                'RIGHT': 'Turn Head Right',
                'SMILE': 'Smile!',
            };
            return (
                <div className="flex flex-col items-center justify-center w-full max-w-xs space-y-6 animate-in fade-in slide-in-from-bottom-8">
                     <h3 className="text-3xl font-bold text-white drop-shadow-lg text-center">{instructions[recordingStep]}</h3>
                     
                     <div className="w-full h-4 bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/20 relative">
                        <div 
                            className="h-full bg-indigo-500 transition-all duration-75 ease-linear shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                            style={{ width: `${stepProgress}%` }}
                        ></div>
                     </div>
                     <p className="text-white/80 font-mono text-sm tracking-wide">Hold position...</p>
                </div>
            );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-20 space-y-8">
      {/* Navbar */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-white">Find My Photos</h1>
      </div>

      {!displaySelfie ? (
        // Initial State: Choose Selfie Method
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-[60px] opacity-20 rounded-full"></div>
                <div className="relative w-32 h-32 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-700 shadow-2xl">
                    <ScanFace className="w-16 h-16 text-indigo-400" />
                </div>
            </div>
            
            <div className="text-center space-y-2 max-w-md">
                <h2 className="text-2xl font-bold text-white">Smart Face Registration</h2>
                <p className="text-slate-400">Record a short video to capture your face from multiple angles for maximum accuracy.</p>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                <Button 
                    onClick={startCamera}
                    className="h-16 text-lg flex flex-col gap-1 items-center justify-center"
                    icon={<Camera className="w-6 h-6 mb-0.5" />}
                >
                    Start Face Scan
                </Button>
                
                <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    variant="outline"
                    className="h-16 text-lg flex flex-col gap-1 items-center justify-center bg-slate-800/50 hover:bg-slate-800 border-slate-700"
                    icon={<Upload className="w-6 h-6 mb-0.5" />}
                >
                    Upload Photo
                </Button>
            </div>
            
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleSelfieSelect}
            />
        </div>
      ) : (
        // Scanning & Results State
        <div className="space-y-8 animate-in fade-in">
            
            {/* Selfie Preview & Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-slate-800/50 rounded-2xl border border-slate-700 gap-6">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <img src={displaySelfie} alt="Me" className="w-20 h-20 rounded-full object-cover border-4 border-slate-600 shadow-lg" />
                        {referenceFrames.length > 1 && (
                            <div className="absolute -bottom-1 -right-1 bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full border border-slate-800">
                                {referenceFrames.length} angles
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Face Data Ready</h3>
                        <div className="flex gap-3 text-sm">
                            <button onClick={startCamera} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> Rescan
                            </button>
                            <span className="text-slate-600">|</span>
                            <button onClick={() => fileInputRef.current?.click()} className="text-indigo-400 hover:text-indigo-300">Upload Photo</button>
                        </div>
                    </div>
                </div>
                
                {!isScanning && matchedPhotoIds.length === 0 && !scanProgress ? (
                     <Button onClick={startScan} className="w-full sm:w-auto" icon={<Search className="w-4 h-4" />}>
                        Find Matches
                     </Button>
                ) : isScanning ? (
                    <div className="flex flex-col items-end w-full sm:w-auto">
                        <span className="text-indigo-400 font-medium flex items-center gap-2">
                             <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></span>
                             Comparing with Indexed IDs... {scanProgress}%
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-green-400 font-medium bg-green-400/10 px-4 py-2 rounded-lg">
                        <CheckCircle className="w-5 h-5" />
                        <span>Analysis Complete</span>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Results Grid */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    Matches Found 
                    <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">
                        {matchedPhotos.length}
                    </span>
                </h3>
                
                {matchedPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {matchedPhotos.map(photo => (
                            <PhotoCard 
                                key={photo.id} 
                                url={photo.url} 
                                selected 
                                onDownload={() => {
                                    const a = document.createElement('a');
                                    a.href = photo.url;
                                    a.download = `event-photo-${photo.id}.jpg`;
                                    a.click();
                                }}
                                onDeselect={() => handleDeselect(photo.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl">
                        {isScanning ? (
                            <div className="space-y-4">
                                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                <p className="text-slate-500">Matching face data against gallery...</p>
                            </div>
                        ) : scanProgress === 100 ? (
                            <div className="space-y-2">
                                <p className="text-slate-300 font-medium">No matches found.</p>
                                <p className="text-slate-500 text-sm">Try scanning again in better lighting.</p>
                            </div>
                        ) : (
                            <p className="text-slate-500">Click "Find Matches" to start searching.</p>
                        )}
                    </div>
                )}
            </div>

            {/* WhatsApp Integration */}
            {matchedPhotos.length > 0 && (
                <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 mt-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1 space-y-2">
                            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                                <MessageCircle className="w-6 h-6 text-[#25D366]" />
                                Get photos on WhatsApp
                            </h3>
                            <p className="text-slate-400">
                                Enter your WhatsApp number to receive the <span className="text-white font-bold">{matchedPhotos.length}</span> selected HD photos instantly.
                            </p>
                        </div>
                        
                        {waSent ? (
                            <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-6 py-4 rounded-xl flex items-center gap-3 w-full md:w-auto justify-center">
                                 <CheckCircle className="w-6 h-6 flex-shrink-0" />
                                 <div className="text-left">
                                    <p className="font-bold">Sent Successfully!</p>
                                    <p className="text-sm opacity-80">Check your messages.</p>
                                 </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSendWhatsapp} className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                                <input 
                                    type="tel" 
                                    placeholder="+1 234 567 890"
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full md:w-64"
                                    value={whatsappNumber}
                                    onChange={(e) => setWhatsappNumber(e.target.value)}
                                    required
                                />
                                <Button 
                                    type="submit" 
                                    isLoading={isSendingWa}
                                    className="bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-lg shadow-green-900/20 whitespace-nowrap"
                                    icon={<Send className="w-4 h-4" />}
                                >
                                    Send Photos
                                </Button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center animate-in fade-in duration-200">
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-20">
                <button 
                    onClick={stopCamera}
                    className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-slate-800 transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>
            
            {/* Camera Feed */}
            <div className="relative w-full h-full">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className={`w-full h-full object-cover md:object-contain transition-all duration-300 ${recordingStep === 'COMPLETED' ? 'blur-md scale-95' : ''}`}
                />
                
                {/* Face Frame Guide (Only in IDLE) */}
                {recordingStep === 'IDLE' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-64 h-80 border-2 border-white/50 rounded-[40%] relative">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-4 bg-white/50"></div>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-4 bg-white/50"></div>
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-1 bg-white/50"></div>
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-1 bg-white/50"></div>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Control Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 bg-gradient-to-t from-black/90 to-transparent flex flex-col items-center justify-end h-1/2">
               {getOverlayContent()}
            </div>
        </div>
      )}

      {/* Hidden inputs for file selection re-use */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleSelfieSelect}
      />
    </div>
  );
};