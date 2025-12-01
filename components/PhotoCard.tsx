import React from 'react';
import { Download, X } from 'lucide-react';

interface PhotoCardProps {
  url: string;
  onDownload?: () => void;
  onDeselect?: () => void;
  selected?: boolean;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ url, onDownload, onDeselect, selected }) => {
  return (
    <div className={`group relative aspect-square rounded-xl overflow-hidden bg-slate-800 border-2 transition-all ${selected ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-transparent hover:border-slate-600'}`}>
      <img src={url} alt="Event" className="w-full h-full object-cover" />
      
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        {onDownload && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="p-3 bg-white/10 hover:bg-emerald-500/90 backdrop-blur-md rounded-full text-white transition-colors shadow-lg"
            title="Download"
          >
            <Download className="w-6 h-6" />
          </button>
        )}
        
        {onDeselect && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDeselect();
            }}
            className="p-3 bg-white/10 hover:bg-red-500/90 backdrop-blur-md rounded-full text-white transition-colors shadow-lg"
            title="Not me / Remove"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};