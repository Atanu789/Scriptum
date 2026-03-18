import { Response } from 'express';
import { param, body, validationResult } from 'express-validator';
import DocumentModel from '../models/Document';
import { extractPlainTextFromHtml, htmlToStructuredModel, plainTextToEditorHtml, structureDocument } from '../services/documentStructure';
import { sanitizeText, sanitizeMediaContent } from '../utils/sanitize';
import { AuthenticatedRequest } from '../types';
import { cleanExtractedText } from '../utils/textClean';

function cleanZerosFromDocument(doc: any) {
  if (!doc) return doc;
  if (doc.cleanedText) doc.cleanedText = cleanExtractedText(doc.cleanedText).replace(/0+(?=[A-Za-z])/g, '');
  if (doc.rawText) doc.rawText = cleanExtractedText(doc.rawText).replace(/0+(?=[A-Za-z])/g, '');
  if (doc.editorHtml) doc.editorHtml = cleanExtractedText(doc.editorHtml).replace(/0+(?=[A-Za-z])/g, '');
  return doc;
}

// ─── Get single document ──────────────────────────────────────────────────────

export const getDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid document ID'),
];

export const getDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  try {
    const doc = await DocumentModel.findOne({
      _id: req.params.id,
      userId: req.user!.userId,
    });
      cleanZerosFromDocument(doc);

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    console.error('getDocument error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch document' });
  }
};

// ─── List user documents ──────────────────────────────────────────────────────

export const listDocuments = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      DocumentModel.find({ userId: req.user!.userId })
        .select('-rawText -cleanedText -structuredContent -presentationContent')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      DocumentModel.countDocuments({ userId: req.user!.userId }),
    ]);

    res.json({
      success: true,
      data: documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('listDocuments error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch documents' });
  }
};

// ─── Update document content ──────────────────────────────────────────────────

export const updateDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid document ID'),
  body('cleanedText').optional().isString(),
  body('editorHtml').optional().isString(),
  body('structuredContent').optional().isObject(),
  body('fixedGrammarIssueKeys').optional().isArray(),
];

function grammarIssueKey(issue: {
  rule?: { id?: string };
  offset?: number;
  length?: number;
  message?: string;
}): string {
  return `${issue.rule?.id || 'rule'}|${issue.offset ?? -1}|${issue.length ?? -1}|${issue.message || ''}`;
}

export const updateDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  try {
    const doc = await DocumentModel.findOne({
      _id: req.params.id,
      userId: req.user!.userId,
    });

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const { cleanedText, editorHtml, structuredContent } = req.body as {
      cleanedText?: string;
      editorHtml?: string;
      structuredContent?: { sections: unknown[] };
      fixedGrammarIssueKeys?: string[];
    };

    const fixedKeys = new Set(
      Array.isArray((req.body as { fixedGrammarIssueKeys?: unknown[] }).fixedGrammarIssueKeys)
        ? ((req.body as { fixedGrammarIssueKeys?: string[] }).fixedGrammarIssueKeys || []).filter(Boolean)
        : []
    );

    if (typeof editorHtml === 'string') {
      doc.editorHtml = sanitizeMediaContent(editorHtml);
      doc.cleanedText = sanitizeText(extractPlainTextFromHtml(doc.editorHtml));
      doc.editorModel = htmlToStructuredModel(doc.editorHtml);
      doc.structuredContent = structureDocument(doc.cleanedText);
    } else if (cleanedText) {
      // Use sanitizeMediaContent so embedded media (img/video/audio) from /uploads/ is preserved
      doc.cleanedText = sanitizeText(cleanedText);
      doc.editorHtml = plainTextToEditorHtml(doc.cleanedText);
      doc.editorModel = htmlToStructuredModel(doc.editorHtml);
      // Re-structure when text changes (use plain text for structure analysis)
      const newStructure = structureDocument(doc.cleanedText);
      doc.structuredContent = newStructure;
    }

    if (structuredContent) {
      doc.structuredContent = structuredContent as typeof doc.structuredContent;
    }

    if (fixedKeys.size > 0 && Array.isArray(doc.grammarIssues)) {
      doc.grammarIssues = doc.grammarIssues.map((issue) => {
        const key = grammarIssueKey(issue);
        if (fixedKeys.has(key)) {
          return { ...issue, fixed: true };
        }
        return issue;
      }) as typeof doc.grammarIssues;
    }

    await doc.save();

    res.json({
      success: true,
      data: {
        _id: doc._id,
        cleanedText: doc.cleanedText,
        editorHtml: doc.editorHtml,
        editorModel: doc.editorModel,
        structuredContent: doc.structuredContent,
        updatedAt: doc.updatedAt,
      },
      message: 'Document updated successfully',
    });
  } catch (err) {
    console.error('updateDocument error:', err);
    res.status(500).json({ success: false, error: 'Failed to update document' });
  }
};

// ─── Delete document ──────────────────────────────────────────────────────────

export const deleteDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const doc = await DocumentModel.findOneAndDelete({
      _id: req.params.id,
      userId: req.user!.userId,
    });

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    console.error('deleteDocument error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
};

// ─── Re-structure document ────────────────────────────────────────────────────

export const structureDocumentRoute = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({
      _id: req.params.id,
      userId: req.user!.userId,
    });

    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const structured = structureDocument(doc.cleanedText);
    doc.structuredContent = structured;
    await doc.save();

    res.json({
      success: true,
      data: doc.structuredContent,
      message: 'Document re-structured successfully',
    });
  } catch (err) {
    console.error('structureDocument error:', err);
    res.status(500).json({ success: false, error: 'Failed to structure document' });
  }
};
