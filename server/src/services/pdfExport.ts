import PDFDocument from 'pdfkit';
import { ExportSource, buildExportBlocks, resolveImage } from './exportUtils';

export interface PdfExportOptions {
  title: string;
  author?: string;
  includePageNumbers?: boolean;
}

export async function generatePdf(
  source: ExportSource,
  options: PdfExportOptions
): Promise<Buffer> {
  const blocks = buildExportBlocks(source);
  const imageCache = new Map<number, Awaited<ReturnType<typeof resolveImage>>>();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'image') {
      imageCache.set(i, await resolveImage(block.src));
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 55, right: 55 },
        info: {
          Title: options.title,
          Author: options.author || 'Ultimoversio',
          Creator: 'Ultimoversio',
        },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const minBottomY = doc.page.height - doc.page.margins.bottom;

      const ensureRoom = (height: number) => {
        if (doc.y + height > minBottomY) {
          doc.addPage();
        }
      };

      doc.fontSize(26).font('Helvetica-Bold').fillColor('#0F172A')
        .text(options.title, { width: pageWidth });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#64748B')
        .text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
      doc.moveDown(1);

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (block.type === 'heading') {
          ensureRoom(48);
          const sizeByLevel = { 1: 24, 2: 20, 3: 17, 4: 15, 5: 13, 6: 12 } as const;
          doc.font('Helvetica-Bold').fontSize(sizeByLevel[block.level]).fillColor('#0F172A')
            .text(block.text, { width: pageWidth, lineGap: 2 });
          doc.moveDown(0.5);
          continue;
        }

        if (block.type === 'paragraph') {
          ensureRoom(32);
          doc.font('Helvetica').fontSize(12).fillColor('#1F2937')
            .text(block.text, { width: pageWidth, align: 'left', lineGap: 4 });
          doc.moveDown(0.45);
          continue;
        }

        if (block.type === 'blockquote') {
          ensureRoom(36);
          const startY = doc.y;
          doc.rect(doc.page.margins.left, startY, 3, 26).fill('#94A3B8');
          doc.fillColor('#374151').font('Helvetica-Oblique').fontSize(11)
            .text(block.text, doc.page.margins.left + 10, startY, { width: pageWidth - 10, lineGap: 4 });
          doc.moveDown(0.5);
          continue;
        }

        if (block.type === 'list') {
          for (let idx = 0; idx < block.items.length; idx++) {
            ensureRoom(24);
            const marker = block.ordered ? `${idx + 1}.` : '•';
            doc.font('Helvetica').fontSize(12).fillColor('#1F2937')
              .text(`${marker} ${block.items[idx]}`, { width: pageWidth, lineGap: 3 });
            doc.moveDown(0.2);
          }
          doc.moveDown(0.35);
          continue;
        }

        if (block.type === 'table') {
          ensureRoom(28);
          for (const row of block.rows) {
            ensureRoom(20);
            doc.font('Helvetica').fontSize(11).fillColor('#334155')
              .text(row.join(' | '), { width: pageWidth, lineGap: 3 });
          }
          doc.moveDown(0.45);
          continue;
        }

        if (block.type === 'image') {
          const image = imageCache.get(i);
          if (!image) continue;

          const maxHeight = 320;
          ensureRoom(maxHeight + 24);

          const startX = doc.page.margins.left;
          const startY = doc.y;
          const opened = (doc as unknown as { openImage: (data: Buffer) => { width: number; height: number } }).openImage(image.buffer);
          const ratio = Math.min(pageWidth / opened.width, maxHeight / opened.height, 1);
          const renderWidth = Math.round(opened.width * ratio);
          const renderHeight = Math.round(opened.height * ratio);
          const offsetX = startX + Math.max(0, (pageWidth - renderWidth) / 2);

          doc.image(image.buffer, offsetX, startY, {
            width: renderWidth,
            height: renderHeight,
          });

          doc.y = startY + renderHeight + 10;
          doc.moveDown(0.3);
        }
      }

      // ── Page numbers ─────────────────────────────────────────────────────
      if (options.includePageNumbers !== false) {
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(9).font('Helvetica').fillColor('#94A3B8')
            .text(
              `${i + 1}`,
              0, doc.page.height - 40,
              { align: 'center', width: doc.page.width }
            );
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
