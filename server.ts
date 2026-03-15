import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initDb } from './server/db/index.js';
import { seedDb } from './server/db/seed.js';
import app from './server/app.js';

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize Database
  initDb();
  await seedDb();

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
