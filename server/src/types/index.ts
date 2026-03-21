import { Request } from 'express';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role?: 'user' | 'admin';
  username?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  aiLimited?: boolean;
  aiLimitReason?: string;
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
  url?: string;
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

export interface StructuredInlineText {
  type: 'text';
  value: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface StructuredInlineLink {
  type: 'link';
  text: string;
  url: string;
}

export type StructuredInlineNode = StructuredInlineText | StructuredInlineLink;

export type StructuredBlockNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; content: StructuredInlineNode[] }
  | { type: 'image'; src: string; alt?: string; alignment?: 'left' | 'center' | 'right' }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'slide'; title: string; content: StructuredInlineNode[] };

export interface StructuredDocumentModel {
  content: StructuredBlockNode[];
}

export interface RichIngestionResult {
  editorHtml: string;
}

export interface GrammarIssue {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: string[];
  context: string;
  fixed?: boolean;
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
  sentenceIndex?: number;
  originalSentence?: string;
  rewrittenSentence?: string;
  original:   string;
  suggestion: string;
  reason:     string;
}

export type HumanizeMode = 'conservative' | 'balanced' | 'aggressive';

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
  editorHtml: string;
  editorModel?: StructuredDocumentModel;
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
