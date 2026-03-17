// ─── User & Auth ──────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro';

export interface PlanLimits {
  aiUsagePerMonth:  number;   // -1 = unlimited
  uploadsPerMonth:  number;   // -1 = unlimited
  teleprompterAI:   boolean;
  exportPPT:        boolean;
  ttsNarration:     boolean;
  grammarFix:       boolean;
  humanizeText:     boolean;
}

export interface PlanConfig {
  name:       string;
  priceINR:   number;
  priceLabel: string;
  limits:     PlanLimits;
}

export interface SubscriptionInfo {
  plan:                 Plan;
  planStartDate:        string | null;
  planExpiryDate:       string | null;
  isActive:             boolean;
  aiUsageThisMonth:     number;
  uploadUsageThisMonth: number;
  limits:               PlanLimits;
}

export interface PaymentRecord {
  _id:                string;
  plan:               Plan;
  amount:             number;
  currency:           string;
  razorpayOrderId:    string;
  razorpayPaymentId:  string | null;
  status:             'created' | 'captured' | 'failed' | 'refunded';
  createdAt:          string;
}

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
  url?: string;
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
  editorHtml: string;
  editorModel?: StructuredDocumentModel | null;
  structuredContent: StructuredContent;
  presentationContent?: PptPresentationContent | null;
  wordCount: number;
  aiScore: number | null;
  grammarScore: number | null;
  readabilityScore: number | null;
  grammarIssues: GrammarIssue[];
  claimFlags: string[];
  longSentences: string[];
  humanizationTips: string[];
  humanizationSuggestions: HumanizationSuggestion[];
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

export type DocumentSummary = Omit<Document, 'rawText' | 'cleanedText' | 'editorHtml' | 'structuredContent'>;

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface ToneResult {
  dominantTone: string;
  confidence:   number;
  breakdown:    Record<string, number>;
  biasFlags:    string[];
}

export interface HumanizationSuggestion {
  original:   string;
  suggestion: string;
  reason:     string;
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
  humanizationTips?:           string[];
  humanizationSuggestions?:    HumanizationSuggestion[];
  claimFlags?:                 string[];
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

export interface HumanizeResult {
  documentId: string;
  appliedCount: number;
  appliedRewrites: Array<{ original: string; replacement: string }>;
  cleanedText: string;
  analysis?: {
    aiScore: number | null;
    analyzedAt: string;
  };
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
  editorHtml?: string;
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
