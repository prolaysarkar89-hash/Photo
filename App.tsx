import React, { useState } from 'react';
import { Camera, Users } from 'lucide-react';
import { PhotographerDashboard } from './views/PhotographerDashboard';
import { ClientPortal } from './views/ClientPortal';
import { Photo, AppMode } from './types';

function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.LANDING);
  const [eventPhotos, setEventPhotos] = useState<Photo[]>([]);

  const handleSwitchMode = (newMode: AppMode) => {
    setMode(newMode);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 selection:bg-indigo-500/30">
      
      {/* Landing / Mode Selection Screen */}
      {mode === AppMode.LANDING && (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
          {/* Background Decor */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px]"></div>
          </div>

          <div className="relative z-10 text-center space-y-12 max-w-2xl">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                EventLens AI
              </h1>
              <p className="text-xl text-slate-400">
                The intelligent photo distribution platform. Match faces instantly with Gemini AI.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              <button 
                onClick={() => setMode(AppMode.PHOTOGRAPHER)}
                className="group relative p-8 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-2xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-indigo-500/10 rounded-full text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white">I'm a Photographer</h3>
                    <p className="text-sm text-slate-400">Upload albums & generate codes</p>
                  </div>
                </div>
              </button>

              <button 
                onClick={() => setMode(AppMode.CLIENT)}
                className="group relative p-8 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-2xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-blue-500/10 rounded-full text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Users className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white">I'm a Guest</h3>
                    <p className="text-sm text-slate-400">Find & download my photos</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
          
          <footer className="absolute bottom-8 text-slate-600 text-sm">
            Powered by Google Gemini 2.5 Flash
          </footer>
        </div>
      )}

      {/* Photographer View */}
      {mode === AppMode.PHOTOGRAPHER && (
        <>
          <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
               <span className="font-bold text-xl tracking-tight cursor-pointer" onClick={() => setMode(AppMode.LANDING)}>EventLens AI</span>
               <button onClick={() => setMode(AppMode.LANDING)} className="text-sm text-slate-400 hover:text-white transition-colors">Exit Dashboard</button>
            </div>
          </nav>
          <PhotographerDashboard 
            photos={eventPhotos} 
            setPhotos={setEventPhotos} 
            onSwitchMode={handleSwitchMode} 
          />
        </>
      )}

      {/* Client View */}
      {mode === AppMode.CLIENT && (
        <ClientPortal 
          eventPhotos={eventPhotos} 
          onBack={() => setMode(AppMode.LANDING)} 
        />
      )}

    </div>
  );
}

export default App;