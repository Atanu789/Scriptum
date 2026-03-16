import { Request } from 'express';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface NarrationSegment {
  text: string;
  audioUrl?: string;
  duration?: number;
}

export interface DocumentSection {
  title: string;
  paragraphs: string[];
  narrationSegments: NarrationSegment[];
}

export interface PptTextRunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
  fontSizePt?: number;
  colorHex?: string;
}

export interface PptTextRun {
  text: string;
  style?: PptTextRunStyle;
}

export interface PptParagraph {
  level?: number;
  alignment?: string;
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  lineSpacingPt?: number;
  runs: PptTextRun[];
}

export interface PptMediaReference {
  relationshipId: string;
  target: string;
  type: 'image' | 'audio' | 'video' | 'other';
}

export interface PptSlideContent {
  slideNumber: number;
  title: string;
  text: string;
  paragraphs: PptParagraph[];
  media: PptMediaReference[];
}

export interface PptPresentationContent {
  totalSlides: number;
  hasMedia: boolean;
  hasAudio: boolean;
  slides: PptSlideContent[];
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

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface ToneResult {
  dominantTone: string;
  confidence: number;
  breakdown: Record<string, number>;
  biasFlags: string[];
}

export interface HumanizationSuggestion {
  original:   string;
  suggestion: string;
  reason:     string;
}

export interface AnalysisResult {
  aiScore:                   number | null;
  aiReasoning:               string;
  humanizationTips:          string[];
  humanizationSuggestions:   HumanizationSuggestion[];
  claimFlags:                string[];
  grammarIssues:             GrammarIssue[];
  grammarScore:              number;
  readabilityScore:          number;
  fleschGradeLevel:          string;
  avgSentenceLength:         number;
  readingTimeMinutes:        number;
  longSentences:             string[];
  wordCount:                 number;
  sentenceCount:             number;
  tone:                      ToneResult | null;
  analyzedAt:                Date;
}

export interface ExtractedContent {
  rawText: string;
  cleanedText: string;
  structuredSections: DocumentSection[];
  wordCount: number;
  sourceType: 'docx' | 'pdf' | 'txt' | 'youtube' | 'website' | 'pptx' | 'ppt' | 'image' | 'audio' | 'video';
  presentationContent?: PptPresentationContent;
  pageTitle?: string;   // populated for website scrapes
  pageUrl?:   string;   // populated for website scrapes
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

// ─── Audio ───────────────────────────────────────────────────────────────────

export interface AudioSegmentData {
  documentId: string;
  sentenceText: string;
  audioUrl: string;
  duration: number;
}

export interface NarrationJob {
  documentId: string;
  text: string;
  voice?: string;
  provider: 'elevenlabs' | 'google';
}

// ─── Export ──────────────────────────────────────────────────────────────────

export interface PPTExportOptions {
  title: string;
  theme?: 'light' | 'dark' | 'professional';
  includeNotes?: boolean;
}

export interface VideoExportOptions {
  resolution: '720p' | '1080p';
  fps: number;
  includeAudio: boolean;
  voiceId?: string;
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
