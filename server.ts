import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initDb } from './server/db/index.js';
import { seedDb } from './server/db/seed.js';
import authRoutes from './server/routes/authRoutes.js';
import jobRoutes from './server/routes/jobRoutes.js';
import userRoutes from './server/routes/userRoutes.js';
import attendanceRoutes from './server/routes/attendanceRoutes.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize Database
  initDb();
  await seedDb();

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'LabFlow API is running' });
  });
  
  app.use('/api/auth', authRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/attendance', attendanceRoutes);

  // Vite middleware for development (React Web Dashboard)
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
