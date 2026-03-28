// ─── User & Auth ──────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanLimits {
  aiUsagePerMonth:  number;   // -1 = unlimited
  uploadsPerMonth:  number;   // -1 = unlimited
  ttsRequestsPerDay: number;  // -1 = unlimited
  teleprompterAI:   boolean;
  exportPPT:        boolean;
  ttsNarration:     boolean;
  grammarFix:       boolean;
  humanizeText:     boolean;
}

export interface PlanConfig {
  name:       string;
  priceINR:   number;
  yearlyPriceINR?: number;
  priceLabel: string;
  enabled?: boolean;
  discountPercent?: number;
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
  trials: {
    ttsNarration: { used: boolean; available: boolean };
    export: { used: boolean; available: boolean };
    aiOverage: { used: boolean; available: boolean };
    uploadOverage: { used: boolean; available: boolean };
  };
}

export interface PaymentRecord {
  _id:                string;
  plan:               Plan;
  pricingTier?:       'pro' | 'advanced';
  billingCycle:       BillingCycle;
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

export interface AdminAuthResult {
  token: string;
  username: string;
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  planStartDate: string | null;
  planExpiryDate: string | null;
  aiUsageThisMonth: number;
  uploadUsageThisMonth: number;
  aiUsageLimitOverride: number | null;
  uploadUsageLimitOverride: number | null;
  trialTtsNarrationUsed: boolean;
  documentCount: number;
  totalAnalyses: number;
  totalGeminiCalls: number;
  lastActiveAt: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  activeUsersLast7Days: number;
  proUsers: number;
  activeSubscriptions: number;
  freeUsers: number;
  totalDocuments: number;
  totalPayments: number;
  totalRevenueINR: number;
  monthlyRevenueINR: number;
  revenuePerUserINR: number;
  totalAnalyses: number;
  trends: {
    userGrowth30dPct: number;
    revenueGrowth30dPct: number;
    proSharePct: number;
    activeSharePct: number;
  };
}

export type AdminMetrics = Omit<AdminOverview, 'totalPayments'>;

export interface AdminRevenue {
  totalRevenueINR: number;
  monthlyRevenueINR: number;
  activeSubscriptions: number;
  revenuePerUserINR: number;
  subscriptionDistribution: {
    free: number;
    pro: number;
  };
  monthlyRevenue: Array<{
    key: string;
    label: string;
    revenueINR: number;
    payments: number;
  }>;
}

export interface AdminAuditLogItem {
  adminUsername: string;
  action: string;
  targetUserEmail: string;
  reason: string;
  timestamp: string;
}

export interface AdminPricingPlanConfig {
  _id?: string;
  planId: 'pro' | 'advanced';
  displayName: string;
  monthlyPriceINR: number;
  yearlyPriceINR: number;
  enabled: boolean;
  discountPercent: number;
  updatedAt?: string | null;
}

export interface DiscountRequestItem {
  _id: string;
  email: string;
  reason: string;
  requestedPlan: 'pro' | 'advanced';
  status: 'pending' | 'approved' | 'rejected';
  offeredDiscountPercent: number | null;
  assignedPlan: 'free' | 'pro' | 'advanced' | null;
  adminNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  sentenceIndex?: number;
  originalSentence?: string;
  rewrittenSentence?: string;
  original:   string;
  suggestion: string;
  reason:     string;
}

export type HumanizeMode = 'conservative' | 'balanced' | 'aggressive';

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
  toneScore?:          number;
  wordCount:           number;
  sentenceCount:       number;
  analyzedAt:          string;
  readingTimeMinutes?: number;
  fleschGradeLevel?:   string;
  avgSentenceLength?:  number;
  longSentences?:      string[];
  tone?:               ToneResult;
  limited?:            boolean;
  limitReason?:        string;
  likelihoodBreakdown?: {
    humanPercentage: number;
    aiPercentage: number;
    mixedPercentage: number;
    dominantType: 'human' | 'ai' | 'mixed';
  };
}

export interface HumanizeResult {
  documentId: string;
  appliedCount: number;
  totalSentences?: number;
  rewrittenPercent?: number;
  averageLengthSimilarity?: number;
  mode?: HumanizeMode;
  styleProfile?: 'student' | 'journalist' | 'casual-speaker' | 'academic' | 'balanced-neutral';
  originalText?: string;
  appliedRewrites: Array<{ original: string; replacement: string }>;
  cleanedText: string;
  aiLikelihoodScore?: number;
  quality?: 'high' | 'medium' | 'low';
  notes?: string[];
  retryCount?: number;
  evaluationReason?: string;
  limited?: boolean;
  limitReason?: string;
  analysis?: {
    aiScore: number | null;
    analyzedAt: string;
  };
}

export interface DocumentHumanizeJobStart {
  jobId: string;
  status: 'processing' | 'done';
  progress: number;
  chunksDone: number;
  totalChunks: number;
  limited?: boolean;
  limitReason?: string;
}

export interface DocumentHumanizeJobStatus {
  jobId: string;
  status: 'processing' | 'done' | 'failed';
  progress: number;
  chunksDone: number;
  totalChunks: number;
  partialText?: string;
  result?: HumanizeResult | null;
  error?: string;
  limited?: boolean;
  limitReason?: string;
}

export interface DocumentAbstractResult {
  documentId: string;
  abstract: string;
  keyPoints: string[];
}

export type HumanizerUiMode = 'standard' | 'creative' | 'advanced';

export interface HumanizerPlanLimits {
  maxWordsPerRequest: number;
  maxRequestsPerDay: number;
  maxWordsPerDay: number;
}

export interface HumanizerPlans {
  free: HumanizerPlanLimits;
  pro: HumanizerPlanLimits;
  advanced: HumanizerPlanLimits;
}

export interface HumanizerUsageToday {
  requestsUsed: number;
  wordsProcessed: number;
}

export interface HumanizerProcessResult {
  id?: string;
  originalText: string;
  humanizedText: string;
  wordCount: number;
  mode: HumanizerUiMode;
  quality: 'high' | 'medium' | 'low';
  aiLikelihoodScore: number;
  likelihoodBreakdown?: {
    humanPercentage: number;
    aiPercentage: number;
    mixedPercentage: number;
    dominantType: 'human' | 'ai' | 'mixed';
  };
  notes: string[];
  cached: boolean;
  processingMs?: number;
  planTier: 'free' | 'pro' | 'advanced';
  limits: HumanizerPlanLimits;
  usageToday: HumanizerUsageToday;
}

export interface HumanizerHistoryRecord {
  _id: string;
  mode: HumanizerUiMode;
  originalText: string;
  humanizedText: string;
  wordCount: number;
  quality: 'high' | 'medium' | 'low';
  aiLikelihoodScore: number;
  notes: string[];
  processingMs: number;
  createdAt: string;
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
