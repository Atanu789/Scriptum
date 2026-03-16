import mongoose, { Document, Schema, Model } from 'mongoose';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const narrationSegmentSchema = new Schema(
  {
    text: { type: String, required: true },
    audioUrl: { type: String, default: null },
    duration: { type: Number, default: null },
  },
  { _id: false }
);

const documentSectionSchema = new Schema(
  {
    title: { type: String, required: true },
    paragraphs: [{ type: String }],
    narrationSegments: [narrationSegmentSchema],
  },
  { _id: true }
);

const grammarIssueSchema = new Schema(
  {
    message: String,
    shortMessage: String,
    severity: {
      type: String,
      enum: ['error', 'warning', 'suggestion'],
      default: 'warning',
    },
    offset: Number,
    length: Number,
    replacements: [String],
    context: String,
    rule: {
      id: String,
      description: String,
      category: String,
    },
  },
  { _id: false }
);

const suggestionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['rewrite', 'simplify', 'expand', 'tone', 'clarity', 'vocabulary', 'structure', 'concise'],
    },
    original: String,
    suggested: String,
    reason: String,
  },
  { _id: false }
);

// ─── Main Document Interface ──────────────────────────────────────────────────

export interface IDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  originalFileName: string;
  sourceType: 'docx' | 'pdf' | 'txt' | 'youtube' | 'website' | 'pptx' | 'ppt' | 'image' | 'audio' | 'video';
  youtubeUrl?: string;
  websiteUrl?: string;
  mediaUrl?: string;        // stored URL for uploaded image/audio/video files
  rawText: string;
  cleanedText: string;
  editorHtml: string;
  editorModel?: {
    content: unknown[];
  } | null;
  structuredContent: {
    sections: Array<{
      _id?: mongoose.Types.ObjectId;
      title: string;
      paragraphs: string[];
      narrationSegments: Array<{
        text: string;
        audioUrl?: string;
        duration?: number;
      }>;
    }>;
  };
  presentationContent?: {
    totalSlides: number;
    hasMedia: boolean;
    hasAudio: boolean;
    slides: Array<{
      slideNumber: number;
      title: string;
      text: string;
      paragraphs: Array<{
        level?: number;
        alignment?: string;
        spacingBeforePt?: number;
        spacingAfterPt?: number;
        lineSpacingPt?: number;
        runs: Array<{
          text: string;
          style?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            fontFamily?: string;
            fontSizePt?: number;
            colorHex?: string;
          };
        }>;
      }>;
      media: Array<{
        relationshipId: string;
        target: string;
        url?: string;
        type: 'image' | 'audio' | 'video' | 'other';
      }>;
    }>;
  };
  wordCount: number;
  aiScore: number | null;
  grammarScore: number | null;
  plagiarismScore: number | null;
  readabilityScore: number | null;
  grammarIssues: Array<{
    message: string;
    shortMessage?: string;
    severity?: 'error' | 'warning' | 'suggestion';
    offset: number;
    length: number;
    replacements: string[];
    context: string;
    rule: { id: string; description: string; category: string };
  }>;
  suggestions: Array<{
    type: string;
    original: string;
    suggested: string;
    reason: string;
  }>;
  // ── Cached analysis fields ──────────────────────────────────────────────
  contentHash:        string | null;
  sentenceCount:      number | null;
  readingTimeMinutes: number | null;
  fleschGradeLevel:   string | null;
  avgSentenceLength:  number | null;
  longSentences:      string[];
  claimFlags:         string[];
  tone: {
    dominantTone: string;
    confidence:   number;
    breakdown:    Record<string, number>;
    biasFlags:    string[];
  } | null;
  aiReasoning:        string | null;
  humanizationTips:   string[];
  humanizationSuggestions: Array<{ original: string; suggestion: string; reason: string }>;
  analysisRunAt:      Date | null;
  status: 'pending' | 'processing' | 'analyzed' | 'ready';
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const documentSchema = new Schema<IDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ['docx', 'pdf', 'txt', 'youtube', 'website', 'pptx', 'ppt', 'image', 'audio', 'video'],
      required: true,
    },
    youtubeUrl: {
      type: String,
      default: null,
    },
    websiteUrl: {
      type: String,
      default: null,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    rawText: {
      type: String,
      default: '',
    },
    cleanedText: {
      type: String,
      default: '',
    },
    editorHtml: {
      type: String,
      default: '',
    },
    editorModel: {
      type: Schema.Types.Mixed,
      default: null,
    },
    structuredContent: {
      sections: [documentSectionSchema],
    },
    presentationContent: {
      type: Schema.Types.Mixed,
      default: null,
    },
    wordCount: {
      type: Number,
      default: 0,
    },
    aiScore: {
      type: Number,
      default: null,
    },
    grammarScore: {
      type: Number,
      default: null,
    },
    plagiarismScore: {
      type: Number,
      default: null,
    },
    readabilityScore: {
      type: Number,
      default: null,
    },
    grammarIssues: [grammarIssueSchema],
    // ── Analysis cache fields ─────────────────────────────────────────────
    contentHash: { type: String, default: null },
    sentenceCount: { type: Number, default: null },
    readingTimeMinutes: { type: Number, default: null },
    fleschGradeLevel: { type: String, default: null },
    avgSentenceLength: { type: Number, default: null },
    longSentences: { type: [String], default: [] },
    claimFlags: { type: [String], default: [] },
    tone: {
      type: new Schema(
        {
          dominantTone: { type: String },
          confidence:   { type: Number },
          breakdown:    { type: Schema.Types.Mixed },
          biasFlags:    { type: [String], default: [] },
        },
        { _id: false }
      ),
      default: null,
    },
    aiReasoning: { type: String, default: null },
    humanizationTips: { type: [String], default: [] },
    humanizationSuggestions: {
      type: [
        new Schema(
          {
            original:   { type: String },
            suggestion: { type: String },
            reason:     { type: String },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    analysisRunAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'processing', 'analyzed', 'ready'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Text index for search
documentSchema.index({ cleanedText: 'text', originalFileName: 'text' });

const DocumentModel: Model<IDocument> = mongoose.model<IDocument>('Document', documentSchema);
export default DocumentModel;
