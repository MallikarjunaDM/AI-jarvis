import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { generateRememberConfirmation, handleChat } from './server/geminiBrain.ts';
import { attachLiveWebSocket } from './server/liveBridge.ts';
import { buildGraphFromNotes, createRememberNote, getGraph } from './server/notesIndex.ts';
import {
  getLatestScreenshotPath,
  nextDriverStep,
  planDriverTask,
  pointOnScreen,
} from './server/screenGuide.ts';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Ensure the 25 realistic sample notes are seeded and indexed on startup
  const initialGraph = buildGraphFromNotes();
  console.log(`[JARVIS] Indexed ${initialGraph.nodes.length} notes and ${initialGraph.links.length} links.`);

  app.get('/api/health', (_req, res) => {
    const graph = getGraph();
    res.json({ ok: true, notes: graph.nodes.length, links: graph.links.length });
  });

  app.get('/api/graph', (_req, res) => {
    res.json(getGraph());
  });

  app.post('/api/notes/rebuild', (_req, res) => {
    res.json(buildGraphFromNotes());
  });

  app.post('/api/chat', async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : 'default';

    if (!message) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    try {
      const result = await handleChat(sessionId, message);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process chat request.';
      console.error('[JARVIS /api/chat error]', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/remember', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
    if (!text && !title) {
      res.status(400).json({ error: 'Remember text cannot be empty.' });
      return;
    }

    try {
      const created = createRememberNote(text || title || '', title);
      const answer = await generateRememberConfirmation(created.node.label, created.node.content);
      res.json({
        answer,
        node: created.node,
        relatedNodeId: created.relatedNodeId,
        links: created.links,
        graph: created.graph,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to capture note.';
      console.error('[JARVIS /api/remember error]', msg);
      res.status(500).json({ error: msg });
    }
  });

  // Universal Screen Pack endpoints (Eyes & Hands)
  app.get('/api/screen/latest.png', (_req, res) => {
    const p = getLatestScreenshotPath();
    res.sendFile(p, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'No screenshot captured yet.' });
      }
    });
  });

  app.post('/api/screen/point', async (req, res) => {
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const previousPoint = req.body?.previousPoint ?? null;

    if (!image || !query) {
      res.status(400).json({ error: 'Screenshot image and query are required.' });
      return;
    }

    try {
      const result = await pointOnScreen(image, query, previousPoint);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Vision pointer failed.';
      console.error('[JARVIS /api/screen/point error]', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/screen/plan', async (req, res) => {
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';

    if (!image || !task) {
      res.status(400).json({ error: 'Screenshot image and task are required.' });
      return;
    }

    try {
      const result = await planDriverTask(image, task);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Driver planning failed.';
      console.error('[JARVIS /api/screen/plan error]', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/screen/step', async (req, res) => {
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';
    const planSteps = Array.isArray(req.body?.planSteps) ? (req.body.planSteps as string[]) : [];
    const stepIndex = Number(req.body?.stepIndex ?? 0);
    const completedHistory = Array.isArray(req.body?.completedHistory)
      ? (req.body.completedHistory as string[])
      : [];

    if (!image || !task) {
      res.status(400).json({ error: 'Screenshot image and task are required.' });
      return;
    }

    try {
      const result = await nextDriverStep(image, task, planSteps, stepIndex, completedHistory);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Driver step failed.';
      console.error('[JARVIS /api/screen/step error]', msg);
      res.status(500).json({ error: msg });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachLiveWebSocket(httpServer);

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[JARVIS] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[JARVIS] Fatal startup error:', err);
  process.exit(1);
});
