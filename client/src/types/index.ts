// ─── User & Auth ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthTokens {
  token: string;
  user: User;
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface NarrationSegment {
  text: string;
  audioUrl?: string;
  duration?: number;
}

export interface DocumentSection {
  _id?: string;
  title: string;
  paragraphs: string[];
  narrationSegments: NarrationSegment[];
}

export interface StructuredContent {
  sections: DocumentSection[];
}

export interface GrammarIssue {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: string[];
  context: string;
  severity?: 'error' | 'warning' | 'suggestion';
  rule: {
    id: string;
    description: string;
    category: string;
  };
}

export interface AISuggestion {
  type: 'rewrite' | 'simplify' | 'expand' | 'tone' | 'clarity' | 'vocabulary' | 'structure' | 'concise';
  original: string;
  suggested: string;
  reason: string;
}

export interface Document {
  _id: string;
  userId: string;
  originalFileName: string;
  sourceType: 'docx' | 'pdf' | 'txt' | 'youtube' | 'website' | 'pptx' | 'ppt' | 'image' | 'audio' | 'video';
  youtubeUrl?: string;
  websiteUrl?: string;
  mediaUrl?: string;
  rawText: string;
  cleanedText: string;
  structuredContent: StructuredContent;
  wordCount: number;
  aiScore: number | null;
  grammarScore: number | null;
  readabilityScore: number | null;
  grammarIssues: GrammarIssue[];
  claimFlags: string[];
  longSentences: string[];
  humanizationTips: string[];
  aiReasoning: string | null;
  tone: ToneResult | null;
  sentenceCount: number | null;
  readingTimeMinutes: number | null;
  fleschGradeLevel: string | null;
  avgSentenceLength: number | null;
  analysisRunAt: string | null;
  status: 'pending' | 'processing' | 'analyzed' | 'ready';
  createdAt: string;
  updatedAt: string;
}

export type DocumentSummary = Omit<Document, 'rawText' | 'cleanedText' | 'structuredContent'>;

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface ToneResult {
  dominantTone: string;
  confidence:   number;
  breakdown:    Record<string, number>;
  biasFlags:    string[];
}

export interface AnalysisProgress {
  step:  number;
  total: number;
  label: string;
}

export interface AnalysisResult {
  documentId:          string;
  aiScore:             number | null;
  aiReasoning?:        string;
  humanizationTips?:   string[];
  claimFlags?:         string[];
  grammarScore:        number;
  grammarIssues:       GrammarIssue[];
  readabilityScore:    number;
  wordCount:           number;
  sentenceCount:       number;
  analyzedAt:          string;
  readingTimeMinutes?: number;
  fleschGradeLevel?:   string;
  avgSentenceLength?:  number;
  longSentences?:      string[];
  tone?:               ToneResult;
}

// ─── Audio ───────────────────────────────────────────────────────────────────

export interface AudioSegment {
  _id: string;
  documentId: string;
  sentenceIndex: number;
  sentenceText: string;
  audioUrl: string;
  duration: number;
  provider: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  total?: number;
  page?: number;
  totalPages?: number;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadResult {
  documentId: string;
  originalFileName: string;
  rawText: string;
  cleanedText: string;
  wordCount: number;
  sourceType: string;
}

// ─── Teleprompter ────────────────────────────────────────────────────────────

export interface TeleprompterSettings {
  speed: number;        // chars per second, 1–20
  fontSize: number;     // px, 16–72
  theme: 'dark' | 'light';
  isPlaying: boolean;
}

// ─── Usage Metering ──────────────────────────────────────────────────────────

export interface UsageStats {
  geminiCallsThisHour: number;
  maxCallsPerHour: number;
  remaining: number;
  totalGeminiCalls: number;
  totalAnalyses: number;
  resetsAt: string;
}
