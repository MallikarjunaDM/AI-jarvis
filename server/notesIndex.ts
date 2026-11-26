import fs from 'fs';
import path from 'path';
import type { KnowledgeGraph, NoteLink, NoteNode } from '../shared/types.ts';
import { ensureSeedNotes } from './seedNotes.ts';

const NOTES_DIR = path.resolve(process.cwd(), 'notes');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
  'on', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's',
  't', 'can', 'will', 'just', 'don', 'should', 'now', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it',
  'its', 'they', 'them', 'their', 'how', 'why', 'where', 'tell', 'give', 'show',
  'much', 'many', 'know', 'jarvis', 'sir', 'please', 'could', 'would',
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function filenameToLabel(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWikilinks(content: string): string[] {
  const matches: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].split('|')[0].trim();
    if (raw) matches.push(raw);
  }
  return Array.from(new Set(matches));
}

function buildExcerpt(content: string, maxLen = 700): string {
  const cleaned = content
    .replace(/^#\s+.*$/m, '')
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner: string) => inner.split('|')[0].replace(/[-_]+/g, ' '))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length <= maxLen) return cleaned;
  const sliced = cleaned.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 400 ? sliced.slice(0, lastSpace) : sliced).trim() + '…';
}

function collectMarkdownFiles(dir: string, baseDir: string): Array<{ fullPath: string; relPath: string; group: string }> {
  if (!fs.existsSync(dir)) return [];
  const results: Array<{ fullPath: string; relPath: string; group: string }> = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const parts = relPath.split('/');
      const group = parts.length > 1 ? parts[0] : 'general';
      results.push({ fullPath, relPath, group });
    }
  }

  return results;
}

let cachedGraph: KnowledgeGraph | null = null;

export function buildGraphFromNotes(): KnowledgeGraph {
  ensureSeedNotes(NOTES_DIR);
  const files = collectMarkdownFiles(NOTES_DIR, NOTES_DIR).sort((a, b) => {
    // Keep non-captures deterministic first, then captures sorted by path
    const aCap = a.group === 'captures' ? 1 : 0;
    const bCap = b.group === 'captures' ? 1 : 0;
    if (aCap !== bCap) return aCap - bCap;
    return a.relPath.localeCompare(b.relPath);
  });

  const nodes: NoteNode[] = files.map((file, index) => {
    const content = fs.readFileSync(file.fullPath, 'utf8');
    const filename = path.basename(file.fullPath);
    const label = filenameToLabel(filename);
    const wikilinks = extractWikilinks(content);
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    return {
      id: index,
      label,
      group: file.group,
      excerpt: buildExcerpt(content, 700),
      content,
      path: file.relPath,
      wordCount,
      wikilinks,
    };
  });

  const linkKeys = new Set<string>();
  const links: NoteLink[] = [];

  const addLink = (a: number, b: number, reason: NoteLink['reason']) => {
    if (a === b) return;
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const key = `${min}:${max}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ source: min, target: max, reason });
  };

  // Lookup map for normalized label and filename stem
  const labelMap = new Map<string, number>();
  nodes.forEach((n) => {
    labelMap.set(normalizeText(n.label), n.id);
    const stem = path.basename(n.path, '.md');
    labelMap.set(normalizeText(stem.replace(/[-_]+/g, ' ')), n.id);
  });

  // 1. Direct wikilinks + shared wikilinks
  const wikilinkHolders = new Map<string, number[]>();
  for (const node of nodes) {
    for (const wl of node.wikilinks) {
      const normWl = normalizeText(wl);
      const targetId = labelMap.get(normWl);
      if (targetId !== undefined) {
        addLink(node.id, targetId, 'wikilink');
      } else {
        const list = wikilinkHolders.get(normWl) ?? [];
        list.push(node.id);
        wikilinkHolders.set(normWl, list);
      }
    }
  }

  for (const holders of wikilinkHolders.values()) {
    if (holders.length > 1) {
      for (let i = 0; i < holders.length; i++) {
        for (let j = i + 1; j < holders.length; j++) {
          addLink(holders[i], holders[j], 'wikilink');
        }
      }
    }
  }

  // 2. Title mentions across note bodies
  for (const node of nodes) {
    const normContent = normalizeText(node.content);
    for (const candidate of nodes) {
      if (candidate.id === node.id) continue;
      const normTitle = normalizeText(candidate.label);
      if (normTitle.length >= 6 && normContent.includes(normTitle)) {
        addLink(node.id, candidate.id, 'mention');
      }
    }
  }

  // 3. Ensure captures notes with no explicit wikilinks connect to their closest semantic neighbor
  for (const node of nodes) {
    const hasLink = links.some((l) => l.source === node.id || l.target === node.id);
    if (!hasLink && nodes.length > 1) {
      const scored = scoreNotes(node.label + ' ' + node.content, { nodes, links, exampleQuestions: [] })
        .filter((s) => s.node.id !== node.id);
      if (scored.length > 0) {
        addLink(node.id, scored[0].node.id, 'semantic');
      }
    }
  }

  const exampleQuestions = [
    'What is our wholesale margin target for boutique hotels?',
    'Which espresso machine had boiler pressure issues and who fixed it?',
    'Who is leading the Q4 holiday blend launch and what is the budget?',
  ];

  cachedGraph = { nodes, links, exampleQuestions };
  return cachedGraph;
}

export function getGraph(): KnowledgeGraph {
  if (!cachedGraph) {
    return buildGraphFromNotes();
  }
  return cachedGraph;
}

export interface ScoredNote {
  node: NoteNode;
  score: number;
}

export function scoreNotes(query: string, graph: KnowledgeGraph = getGraph(), limit = 6): ScoredNote[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const normQuery = normalizeText(query);
  const scored: ScoredNote[] = [];

  for (const node of graph.nodes) {
    const normTitle = normalizeText(node.label);
    const normGroup = normalizeText(node.group);
    const normBody = normalizeText(node.content);

    let score = 0;

    // Exact phrase bonus
    if (normQuery.length >= 5 && normTitle.includes(normQuery)) {
      score += 12;
    }

    for (const token of tokens) {
      if (normTitle.includes(token)) {
        score += 4.5; // Title matches weigh extra
      }
      if (normGroup.includes(token)) {
        score += 2.0;
      }
      if (normBody.includes(token)) {
        // Count occurrences up to 4
        let occurrences = 0;
        let idx = 0;
        while ((idx = normBody.indexOf(token, idx)) !== -1 && occurrences < 4) {
          occurrences++;
          idx += token.length;
        }
        score += 1.0 + (occurrences - 1) * 0.4;
      }
    }

    if (score > 0) {
      scored.push({ node, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function slugifyTitle(text: string): { title: string; filename: string } {
  const cleaned = text
    .replace(/^(?:jarvis[,:]?\s*)?remember\s+that\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6);
  const title = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Captured Note';

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'capture';

  const capturesDir = path.join(NOTES_DIR, 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });

  let filename = `${slug}.md`;
  let counter = 2;
  while (fs.existsSync(path.join(capturesDir, filename))) {
    filename = `${slug}-${counter}.md`;
    counter++;
  }

  return { title, filename };
}

export function createRememberNote(rawText: string, explicitTitle?: string): {
  node: NoteNode;
  relatedNodeId: number | null;
  links: NoteLink[];
  graph: KnowledgeGraph;
} {
  ensureSeedNotes(NOTES_DIR);
  const previousGraph = getGraph();
  const bodyText = rawText.replace(/^(?:jarvis[,:]?\s*)?remember\s+that\s+/i, '').trim() || explicitTitle || 'Captured note';
  const { title, filename } = slugifyTitle(explicitTitle?.trim() ? explicitTitle.trim() : rawText);

  // Find most related existing node BEFORE writing so we can add a wikilink too
  const related = scoreNotes(bodyText, previousGraph, 2);
  const relatedNode = related.length > 0 ? related[0].node : previousGraph.nodes[0] ?? null;

  const mdContent = [
    `# ${title}`,
    '',
    bodyText.charAt(0).toUpperCase() + bodyText.slice(1),
    '',
    `Captured: ${new Date().toISOString().slice(0, 10)}`,
    relatedNode ? `Related: [[${relatedNode.label}]]` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const capturesDir = path.join(NOTES_DIR, 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });
  const filePath = path.join(capturesDir, filename);
  fs.writeFileSync(filePath, mdContent, 'utf8');

  const updatedGraph = buildGraphFromNotes();
  const relPath = `captures/${filename}`;
  const createdNode =
    updatedGraph.nodes.find((n) => n.path === relPath) ??
    updatedGraph.nodes[updatedGraph.nodes.length - 1];

  createdNode.isNewborn = true;

  const newLinks = updatedGraph.links.filter(
    (l) => l.source === createdNode.id || l.target === createdNode.id,
  );

  // If no explicit link was formed, fall back to relatedNodeId
  if (newLinks.length === 0 && relatedNode) {
    const fallbackLink: NoteLink = {
      source: Math.min(createdNode.id, relatedNode.id),
      target: Math.max(createdNode.id, relatedNode.id),
      reason: 'semantic',
    };
    updatedGraph.links.push(fallbackLink);
    newLinks.push(fallbackLink);
  }

  return {
    node: createdNode,
    relatedNodeId: relatedNode ? relatedNode.id : null,
    links: newLinks,
    graph: updatedGraph,
  };
}
