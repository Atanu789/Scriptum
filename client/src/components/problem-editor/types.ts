export type ViewMode = 'split' | 'editor' | 'preview';

export interface TestCase {
  id: string;
  input: string;
  output: string;
  explanation: string;
}

export interface MetadataForm {
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  timeLimit: string;
  memoryLimit: string;
}

export interface AssetItem {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  content: string;
}
