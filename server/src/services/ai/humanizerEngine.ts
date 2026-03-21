import { HumanizeMode } from '../../types';
import { runAI } from '../aiRouter';

type StyleProfile = 'student' | 'journalist' | 'casual-speaker' | 'academic';

interface HumanizerOptions {
  mode: HumanizeMode;
  styleProfile?: StyleProfile;
  pipelinePreset?: 'standard' | 'creative' | 'advanced';
}

interface EvaluationResult {
  score: number;
  reason: string;
}

interface TextChunk {
  id: string;
  text: string;
}

interface BlockBase {
  kind: 'heading' | 'paragraph' | 'list' | 'empty';
}

interface HeadingBlock extends BlockBase {
  kind: 'heading';
  text: string;
}

interface ParagraphBlock extends BlockBase {
  kind: 'paragraph';
  text: string;
}

interface EmptyBlock extends BlockBase {
  kind: 'empty';
}

interface ListItem {
  prefix: string;
  text: string;
}

interface ListBlock extends BlockBase {
  kind: 'list';
  items: ListItem[];
}

type Block = HeadingBlock | ParagraphBlock | EmptyBlock | ListBlock;

interface PassDef {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  variants: string[];
}

const TARGET_CHUNK_WORDS = 150;
const MIN_CHUNK_WORDS = 120;
const MAX_CHUNK_WORDS = 220;

const PASS_LIBRARY: PassDef[] = [
  {
    id: 1,
    title: 'Structural Diversification',
    variants: [
      'Rewrite with varied sentence structures. Mix short, medium, and long sentences naturally while preserving exact meaning.',
      'Diversify sentence construction and pacing. Avoid repetitive phrasing patterns and preserve original intent exactly.',
    ],
  },
  {
    id: 2,
    title: 'Rhythm And Flow',
    variants: [
      'Improve flow and rhythm with natural transitions and varied sentence openings. Keep wording clear and human.',
      'Refine pacing and readability. Add natural connective flow while keeping content faithful to the source.',
    ],
  },
  {
    id: 3,
    title: 'Human Naturalness',
    variants: [
      'Make the tone sound natural and realistic without becoming sloppy. Keep grammar readable, not robotic.',
      'Introduce subtle conversational texture where appropriate while preserving factual meaning and structure.',
    ],
  },
  {
    id: 4,
    title: 'Pattern De-Templating',
    variants: [
      'Reduce templated phrasing by diversifying syntax and vocabulary choices. Keep facts and meaning unchanged.',
      'Rewrite to avoid repetitive generated-style patterns. Keep content accurate, clear, and semantically equivalent.',
    ],
  },
  {
    id: 5,
    title: 'Final Polish',
    variants: [
      'Polish for clarity, cohesion, and readability while preserving original meaning exactly. Return only rewritten text.',
      'Final editorial pass: improve coherence and consistency of tone with no factual changes.',
    ],
  },
];

function normalizeInput(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sentenceSplit(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^[A-Z][A-Za-z0-9\s,:\-]{2,80}$/.test(t) && !/[.!?]$/.test(t)) return true;
  return false;
}

function parseListItems(block: string): ListItem[] | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const parsed = lines.map((line) => {
    const unordered = line.match(/^([-*•●▪◦‣⁃–—])\s+(.+)$/);
    if (unordered) {
      return { prefix: `${unordered[1]} `, text: unordered[2].trim() };
    }

    const ordered = line.match(/^(\d+[.)])\s+(.+)$/);
    if (ordered) {
      return { prefix: `${ordered[1]} `, text: ordered[2].trim() };
    }

    return null;
  });

  if (parsed.some((item) => item === null)) return null;
  return parsed as ListItem[];
}

function toBlocks(input: string): Block[] {
  const rawBlocks = input.split(/\n{2,}/);
  const blocks: Block[] = [];

  for (const raw of rawBlocks) {
    const trimmed = raw.trim();
    if (!trimmed) {
      blocks.push({ kind: 'empty' });
      continue;
    }

    if (isHeading(trimmed)) {
      blocks.push({ kind: 'heading', text: trimmed });
      continue;
    }

    const listItems = parseListItems(trimmed);
    if (listItems) {
      blocks.push({ kind: 'list', items: listItems });
      continue;
    }

    blocks.push({ kind: 'paragraph', text: trimmed });
  }

  return blocks;
}

function splitIntoChunks(text: string): TextChunk[] {
  const sentences = sentenceSplit(text);
  if (sentences.length === 0) return [{ id: 'chunk-0', text: text.trim() }];

  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    const overflow = currentWords + sentenceWords > MAX_CHUNK_WORDS;

    if (overflow && currentWords >= MIN_CHUNK_WORDS) {
      chunks.push({ id: `chunk-${chunks.length}`, text: current.join(' ').trim() });
      current = [];
      currentWords = 0;
    }

    current.push(sentence);
    currentWords += sentenceWords;

    if (currentWords >= TARGET_CHUNK_WORDS) {
      chunks.push({ id: `chunk-${chunks.length}`, text: current.join(' ').trim() });
      current = [];
      currentWords = 0;
    }
  }

  if (current.length > 0) {
    chunks.push({ id: `chunk-${chunks.length}`, text: current.join(' ').trim() });
  }

  return chunks.filter((c) => c.text.length > 0);
}

function styleInstruction(styleProfile?: StyleProfile): string {
  if (styleProfile === 'student') {
    return 'Style profile: student. Keep language clear, direct, and concise.';
  }
  if (styleProfile === 'journalist') {
    return 'Style profile: journalist. Keep wording precise, factual, and readable.';
  }
  if (styleProfile === 'casual-speaker') {
    return 'Style profile: casual speaker. Keep tone natural and approachable.';
  }
  if (styleProfile === 'academic') {
    return 'Style profile: academic. Keep tone formal, clear, and objective.';
  }
  return 'Style profile: balanced neutral prose.';
}

function modeInstruction(mode: HumanizeMode): string {
  if (mode === 'conservative') {
    return 'Apply subtle edits only. Keep wording very close to source.';
  }
  if (mode === 'aggressive') {
    return 'Apply stronger rewrites for natural flow while preserving meaning exactly.';
  }
  return 'Apply moderate rewrites for natural flow and readability.';
}

function chooseVariant<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function shufflePassOrder(): PassDef[] {
  const passes = [...PASS_LIBRARY];
  if (Math.random() < 0.35) {
    const idx2 = passes.findIndex((p) => p.id === 2);
    const idx3 = passes.findIndex((p) => p.id === 3);
    if (idx2 >= 0 && idx3 >= 0) {
      const temp = passes[idx2];
      passes[idx2] = passes[idx3];
      passes[idx3] = temp;
    }
  }
  return passes;
}

function selectPasses(preset: 'standard' | 'creative' | 'advanced'): PassDef[] {
  if (preset === 'standard') {
    return [PASS_LIBRARY[0], PASS_LIBRARY[4]];
  }
  if (preset === 'creative') {
    return [PASS_LIBRARY[0], PASS_LIBRARY[1], PASS_LIBRARY[2], PASS_LIBRARY[4]];
  }
  return shufflePassOrder();
}

function buildPassPrompt(chunk: string, pass: PassDef, mode: HumanizeMode, styleProfile?: StyleProfile): string {
  const variant = chooseVariant(pass.variants);
  return [
    'You are an expert human editor.',
    modeInstruction(mode),
    styleInstruction(styleProfile),
    `Pass: ${pass.title}`,
    variant,
    'Hard rules:',
    '- Preserve meaning exactly.',
    '- Do not add new facts, numbers, or claims.',
    '- Keep paragraph and list-safe prose style.',
    '- Return plain text only (no markdown fences).',
    '',
    'Text:',
    chunk,
  ].join('\n');
}

function cleanGeminiText(raw: string): string {
  return raw
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function runPass(chunk: string, pass: PassDef, mode: HumanizeMode, styleProfile: StyleProfile | undefined, keyOffset: number): Promise<string> {
  const prompt = buildPassPrompt(chunk, pass, mode, styleProfile);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ai = await runAI({
        prompt,
        temperature: pass.id === 5 ? 0.5 : 0.8,
        maxTokens: 900,
        forceFresh: attempt > 0,
      });
      if (!ai.success || !ai.text) continue;
      const cleaned = cleanGeminiText(ai.text);
      if (cleaned && cleaned.length >= Math.max(16, Math.floor(chunk.length * 0.5))) {
        return cleaned;
      }
    } catch {
      // Try one more time.
    }
  }
  return chunk;
}

function parseEvaluation(raw: string): EvaluationResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { score: 50, reason: 'Evaluation format invalid; used fallback score.' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; reason?: unknown };
    const scoreNum = Number(parsed.score);
    const score = Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : 50;
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 220)
      : 'No reason returned by evaluator.';
    return { score, reason };
  } catch {
    return { score: 50, reason: 'Could not parse evaluator JSON; used fallback score.' };
  }
}

async function evaluateText(text: string, keyOffset: number): Promise<EvaluationResult> {
  const prompt = [
    'Evaluate the writing style for machine-generated signals and naturalness.',
    'Return JSON only in this schema:',
    '{ "score": number, "reason": "..." }',
    'Where score means estimated machine-like writing likelihood from 0 to 100.',
    'Keep reason brief and specific.',
    '',
    'Text:',
    text.slice(0, 12000),
  ].join('\n');

  try {
    const ai = await runAI({
      prompt,
      temperature: 0.2,
      maxTokens: 300,
      forceFresh: keyOffset > 0,
    });
    if (!ai.success || !ai.text) {
      return { score: 50, reason: 'Evaluation failed; fallback score applied.' };
    }
    return parseEvaluation(ai.text);
  } catch {
    return { score: 50, reason: 'Evaluation failed; fallback score applied.' };
  }
}

async function humanizeChunk(chunk: string, options: HumanizerOptions, keyOffset: number): Promise<string> {
  const preset = options.pipelinePreset ?? 'advanced';
  const passOrder = selectPasses(preset);
  let current = chunk;

  for (let i = 0; i < passOrder.length; i += 1) {
    current = await runPass(current, passOrder[i], options.mode, options.styleProfile, keyOffset + i);
  }

  return current;
}

function qualityFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score <= 25) return 'high';
  if (score <= 45) return 'medium';
  return 'low';
}

function blockToText(block: Block): string {
  if (block.kind === 'empty') return '';
  if (block.kind === 'heading') return block.text;
  if (block.kind === 'paragraph') return block.text;
  return block.items.map((item) => `${item.prefix}${item.text}`).join('\n');
}

function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.kind === 'heading') return { kind: 'heading', text: block.text } as HeadingBlock;
    if (block.kind === 'paragraph') return { kind: 'paragraph', text: block.text } as ParagraphBlock;
    if (block.kind === 'empty') return { kind: 'empty' } as EmptyBlock;
    return {
      kind: 'list',
      items: block.items.map((item) => ({ prefix: item.prefix, text: item.text })),
    } as ListBlock;
  });
}

export interface HumanizerEngineResult {
  humanizedText: string;
  aiLikelihoodScore: number;
  quality: 'high' | 'medium' | 'low';
  notes: string[];
  evaluationReason: string;
  retryCount: number;
  chunkCount: number;
  rewrittenChunkCount: number;
  appliedRewrites: Array<{ original: string; replacement: string }>;
}

export async function humanizeDocumentText(inputText: string, options: HumanizerOptions): Promise<HumanizerEngineResult> {
  const normalized = normalizeInput(inputText);
  if (!normalized) {
    return {
      humanizedText: '',
      aiLikelihoodScore: 0,
      quality: 'high',
      notes: ['No text to process.'],
      evaluationReason: 'Empty input.',
      retryCount: 0,
      chunkCount: 0,
      rewrittenChunkCount: 0,
      appliedRewrites: [],
    };
  }

  const originalBlocks = toBlocks(normalized);
  const workingBlocks = cloneBlocks(originalBlocks);
  const appliedRewrites: Array<{ original: string; replacement: string }> = [];

  let chunkCount = 0;
  let rewrittenChunkCount = 0;
  let keyOffset = 0;

  for (let i = 0; i < workingBlocks.length; i += 1) {
    const block = workingBlocks[i];
    if (block.kind === 'heading' || block.kind === 'empty') continue;

    if (block.kind === 'paragraph') {
      const chunks = splitIntoChunks(block.text);
      chunkCount += chunks.length;

      const rewrittenChunks: string[] = [];
      for (const chunk of chunks) {
        const rewritten = await humanizeChunk(chunk.text, options, keyOffset);
        keyOffset += 3;
        rewrittenChunks.push(rewritten);
        if (rewritten.trim() !== chunk.text.trim()) {
          rewrittenChunkCount += 1;
          appliedRewrites.push({ original: chunk.text, replacement: rewritten });
        }
      }

      block.text = rewrittenChunks.join(' ');
      continue;
    }

    // list block
    for (let j = 0; j < block.items.length; j += 1) {
      const item = block.items[j];
      const chunks = splitIntoChunks(item.text);
      chunkCount += chunks.length;

      const rewrittenChunks: string[] = [];
      for (const chunk of chunks) {
        const rewritten = await humanizeChunk(chunk.text, options, keyOffset);
        keyOffset += 3;
        rewrittenChunks.push(rewritten);
        if (rewritten.trim() !== chunk.text.trim()) {
          rewrittenChunkCount += 1;
          appliedRewrites.push({ original: chunk.text, replacement: rewritten });
        }
      }

      item.text = rewrittenChunks.join(' ');
    }
  }

  let assembled = workingBlocks
    .map(blockToText)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let evaluation = await evaluateText(assembled, keyOffset);
  let retryCount = 0;

  const allowRetry = (options.pipelinePreset ?? 'advanced') === 'advanced';
  while (allowRetry && evaluation.score > 40 && retryCount < 2) {
    const retryBlocks = toBlocks(assembled);
    for (let i = 0; i < retryBlocks.length; i += 1) {
      const block = retryBlocks[i];
      if (block.kind !== 'paragraph') continue;

      const chunks = splitIntoChunks(block.text);
      const retried: string[] = [];
      for (const chunk of chunks) {
        let current = chunk.text;
        current = await runPass(current, PASS_LIBRARY[1], options.mode, options.styleProfile, keyOffset + 1);
        current = await runPass(current, PASS_LIBRARY[3], options.mode, options.styleProfile, keyOffset + 2);
        keyOffset += 2;
        retried.push(current);
      }
      block.text = retried.join(' ');
    }

    assembled = retryBlocks
      .map(blockToText)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    retryCount += 1;
    evaluation = await evaluateText(assembled, keyOffset + retryCount);
  }

  const quality = qualityFromScore(evaluation.score);

  return {
    humanizedText: assembled,
    aiLikelihoodScore: evaluation.score,
    quality,
    notes: [
      'Applied multi-pass structure and rhythm rewrites.',
      'Preserved headings, lists, and paragraph spacing.',
      retryCount > 0 ? `Performed ${retryCount} adaptive refinement pass(es).` : 'No adaptive retry was required.',
    ],
    evaluationReason: evaluation.reason,
    retryCount,
    chunkCount,
    rewrittenChunkCount,
    appliedRewrites,
  };
}
