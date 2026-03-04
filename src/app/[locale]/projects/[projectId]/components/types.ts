// Shared types for workspace tab components

export interface ProjectData {
  id: string;
  title: string;
  sourceText?: string;
  style: string;
  aspectRatio: string;
  status: string;
  episodes?: EpisodeData[];
  characters?: CharacterData[];
  locations?: LocationData[];
}

export interface EpisodeData {
  id: string;
  title: string;
  synopsis?: string;
  sortOrder: number;
  status: string;
  clips: ClipData[];
  composition?: CompositionData;
}

export interface ClipData {
  id: string;
  title?: string;
  description?: string;
  dialogue?: string;
  sortOrder: number;
  panels: PanelData[];
}

export interface PanelData {
  id: string;
  sceneDescription?: string;
  cameraAngle?: string;
  imagePrompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  durationMs: number;
  sortOrder: number;
  voiceLines: VoiceLineData[];
}

export interface VoiceLineData {
  id: string;
  text: string;
  audioUrl?: string;
  startMs: number;
  endMs: number;
  characterId?: string;
  character?: CharacterData;
}

export interface CharacterData {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  voiceProvider?: string;
  voiceId?: string;
  voiceSample?: string;
}

export interface LocationData {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
}

export interface CompositionData {
  id: string;
  episodeId: string;
  bgmUrl?: string;
  bgmVolume: number;
  subtitleEnabled: boolean;
  subtitleStyle: string;
  transition: string;
  outputUrl?: string;
  srtContent?: string;
  status: string;
  progress: number;
  error?: string;
}
