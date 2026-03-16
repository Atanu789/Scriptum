import path from 'path';
import { Response } from 'express';
import { body, validationResult } from 'express-validator';
import DocumentModel from '../models/Document';
import { extractContent } from '../services/textExtraction';
import { extractFromWebsite } from '../services/webScraper';
import { htmlToStructuredModel, structureDocument } from '../services/documentStructure';
import { deleteFile, isMediaFile, DOC_SIZE_LIMIT } from '../utils/fileFilter';
import { sanitizeMediaContent, sanitizeText } from '../utils/sanitize';
import { AuthenticatedRequest, ApiResponse, UploadResult } from '../types';

const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp3', '.m4a',
  '.mp4', '.mov', '.webm', '.avi',
]);

// ─── Upload File ──────────────────────────────────────────────────────────────

export const uploadFile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const isMedia = MEDIA_EXTENSIONS.has(ext);

  // Enforce tighter size limit for documents
  if (!isMedia && file.size > DOC_SIZE_LIMIT) {
    deleteFile(file.path);
    res.status(413).json({
      success: false,
      error: `Document files must be under ${Math.round(DOC_SIZE_LIMIT / 1024 / 1024)} MB`,
    });
    return;
  }

  try {
    // ── Media files: skip all extraction, just store on disk ──────────────────
    if (isMedia) {
      const uploadRelDir = process.env.UPLOAD_DIR || 'uploads';
      const mediaUrl = `/${uploadRelDir}/${path.basename(file.path)}`;

      // Build a minimal HTML embed so the editor renders the media immediately
      const safeUrl  = mediaUrl.replace(/"/g, '%22');
      const safeName = sanitizeText(file.originalname)
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');

      let embedHtml = '';
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        embedHtml = `<figure><img src="${safeUrl}" alt="${safeName}" style="max-width:100%;border-radius:8px;" /></figure><p></p>`;
      } else if (['.mp4', '.mov', '.webm', '.avi'].includes(ext)) {
        embedHtml = `<figure><video src="${safeUrl}" controls style="max-width:100%;border-radius:8px;"></video></figure><p></p>`;
      } else if (['.mp3', '.m4a'].includes(ext)) {
        embedHtml = `<figure><audio src="${safeUrl}" controls style="width:100%;"></audio></figure><p></p>`;
      }

      const sourceTypeMap: Record<string, string> = {
        '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image',
        '.mp3': 'audio', '.m4a': 'audio',
        '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.avi': 'video',
      };

      const doc = await DocumentModel.create({
        userId:           req.user!.userId,
        originalFileName: sanitizeText(file.originalname),
        sourceType:       sourceTypeMap[ext] ?? 'image',
        rawText:          '',
        cleanedText:      embedHtml,
        editorHtml:       embedHtml,
        editorModel:      htmlToStructuredModel(embedHtml),
        structuredContent: { sections: [] },
        wordCount:        0,
        mediaUrl,
        status:           'ready',
      });

      const response: ApiResponse<UploadResult> = {
        success: true,
        data: {
          documentId:       doc._id.toString(),
          originalFileName: doc.originalFileName,
          rawText:          doc.rawText,
          cleanedText:      doc.cleanedText,
          wordCount:        doc.wordCount,
          sourceType:       doc.sourceType,
        },
        message: 'Media file imported successfully',
      };

      res.status(201).json(response);
      return;
    }

    // ── Document files: extract text and structure content ────────────────────
    const extracted = await extractContent({
      filePath: file.path,
      mimeType: file.mimetype,
      originalname: file.originalname,
    });

    // Sanitize extracted text to strip any embedded HTML/scripts
    extracted.rawText = sanitizeText(extracted.rawText);
    extracted.cleanedText = sanitizeText(extracted.cleanedText);
    extracted.editorHtml = sanitizeMediaContent(extracted.editorHtml);

    const structured = structureDocument(extracted.cleanedText, extracted.structuredSections);
    deleteFile(file.path);

    const doc = await DocumentModel.create({
      userId: req.user!.userId,
      originalFileName: sanitizeText(file.originalname),
      sourceType: extracted.sourceType,
      rawText: extracted.rawText,
      cleanedText: extracted.cleanedText,
      editorHtml: extracted.editorHtml,
      editorModel: extracted.editorModel ?? htmlToStructuredModel(extracted.editorHtml),
      structuredContent: structured,
      presentationContent: extracted.presentationContent ?? null,
      wordCount: extracted.wordCount,
      mediaUrl: null,
      status: 'pending',
    });

    const response: ApiResponse<UploadResult> = {
      success: true,
      data: {
        documentId: doc._id.toString(),
        originalFileName: doc.originalFileName,
        rawText: doc.rawText,
        cleanedText: doc.cleanedText,
        wordCount: doc.wordCount,
        sourceType: doc.sourceType,
      },
      message: 'File uploaded and processed successfully',
    };

    res.status(201).json(response);
  } catch (err) {
    if (file?.path) deleteFile(file.path);
    console.error('Upload error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Upload processing failed',
    });
  }
};

// ─── Upload Website URL ───────────────────────────────────────────────────────

export const uploadWebsiteValidation = [
  body('websiteUrl')
    .trim()
    .notEmpty()
    .withMessage('Website URL is required')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Please enter a valid URL starting with http:// or https://'),
];

export const uploadWebsite = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { websiteUrl } = req.body as { websiteUrl: string };

  try {
    const extracted = await extractFromWebsite(websiteUrl);

    // Sanitize scraped content aggressively — web pages may contain XSS payloads
    extracted.rawText = sanitizeText(extracted.rawText);
    extracted.cleanedText = sanitizeText(extracted.cleanedText);
    extracted.editorHtml = sanitizeMediaContent(extracted.editorHtml);

    const structured = structureDocument(extracted.cleanedText, extracted.structuredSections);

    const doc = await DocumentModel.create({
      userId:           req.user!.userId,
      originalFileName: sanitizeText(extracted.pageTitle ?? websiteUrl),
      sourceType:       'website',
      websiteUrl,
      rawText:          extracted.rawText,
      cleanedText:      extracted.cleanedText,
      editorHtml:       extracted.editorHtml,
      editorModel:      extracted.editorModel ?? htmlToStructuredModel(extracted.editorHtml),
      structuredContent: structured,
      wordCount:        extracted.wordCount,
      status:           'pending',
    });

    res.status(201).json({
      success: true,
      data: {
        documentId:       doc._id.toString(),
        originalFileName: doc.originalFileName,
        rawText:          doc.rawText,
        cleanedText:      doc.cleanedText,
        wordCount:        doc.wordCount,
        sourceType:       'website',
      },
      message: 'Website content scraped and processed successfully',
    });
  } catch (err) {
    console.error('Website upload error:', err);
    const message = err instanceof Error ? err.message : 'Website scraping failed';
    const isUserError =
      message.includes('blocked') ||
      message.includes('login') ||
      message.includes('JavaScript') ||
      message.includes('Invalid URL') ||
      message.includes('readable text') ||
      message.includes('http');
    res.status(isUserError ? 400 : 500).json({ success: false, error: message });
  }
};
