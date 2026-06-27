export interface LayerMask {
  type: 'full' | 'polygon' | 'fixtures';
  points?: Array<{ x: number; y: number }>; // normalized 0-1
  fixtureIds?: string[];
}

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply';

export interface SceneLayer {
  id: string;
  name: string;
  effect: string;
  effectParams: Record<string, string | number>;
  mask: LayerMask;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
}
