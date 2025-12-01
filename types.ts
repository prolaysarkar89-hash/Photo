export interface Photo {
  id: string;
  url: string;
  file: File;
  timestamp: number;
  optimizedBase64?: string; // Pre-calculated resized string for AI
  processed: boolean;       // Whether indexing is complete
}

export interface MatchResult {
  photoId: string;
  confidence: number;
}

export enum AppMode {
  LANDING = 'LANDING',
  PHOTOGRAPHER = 'PHOTOGRAPHER',
  CLIENT = 'CLIENT',
}