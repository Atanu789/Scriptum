import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ─── Document types ───────────────────────────────────────────────────────────
const DOCUMENT_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/pdf',
  'text/plain',
  // PowerPoint
  'application/vnd.ms-powerpoint',                                            // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
]);

const DOCUMENT_EXTENSIONS = new Set(['.docx', '.pdf', '.txt', '.ppt', '.pptx']);

// ─── Media types (image / audio / video) ─────────────────────────────────────
const MEDIA_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',           // .mp3
  'audio/mp4',            // .m4a
  'audio/x-m4a',
  'audio/m4a',
  'video/mp4',
  'video/quicktime',      // .mov
  'video/webm',
  'video/x-msvideo',      // .avi
]);

const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp3', '.m4a',
  '.mp4', '.mov', '.webm', '.avi',
]);

// Combined for the single upload middleware
const ALLOWED_MIME_TYPES = new Set([...DOCUMENT_MIME_TYPES, ...MEDIA_MIME_TYPES]);
const ALLOWED_EXTENSIONS = new Set([...DOCUMENT_EXTENSIONS, ...MEDIA_EXTENSIONS]);

const ALLOWED_EXT_LIST = [...DOCUMENT_EXTENSIONS, ...MEDIA_EXTENSIONS].join(', ');

// ─── Size limits ──────────────────────────────────────────────────────────────
const DOC_MAX_BYTES   = parseInt(process.env.MAX_FILE_SIZE_MB  || '25', 10) * 1024 * 1024;
const MEDIA_MAX_BYTES = parseInt(process.env.MAX_MEDIA_SIZE_MB || '100', 10) * 1024 * 1024;

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Accept if either the MIME type OR the extension is in the allowed sets
  // (some browsers report generic MIME types for less-common formats)
  if (ALLOWED_EXTENSIONS.has(ext) || ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: "${ext}". Allowed: ${ALLOWED_EXT_LIST}`
      )
    );
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Use the larger of the two limits — per-type checks happen in the controller
    fileSize: MEDIA_MAX_BYTES,
    files: 1,
  },
});

export const isMediaFile = (ext: string): boolean =>
  MEDIA_EXTENSIONS.has(ext.toLowerCase());

export const isDocumentFile = (ext: string): boolean =>
  DOCUMENT_EXTENSIONS.has(ext.toLowerCase());

export const DOC_SIZE_LIMIT  = DOC_MAX_BYTES;
export const MEDIA_SIZE_LIMIT = MEDIA_MAX_BYTES;

export const deleteFile = (filePath: string): void => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export { uploadDir };
