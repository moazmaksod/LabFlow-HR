import express from 'express';
import authRoutes from './routes/authRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userRoutes from './routes/userRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('public/uploads'));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LabFlow API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/settings', settingsRoutes);

export default app;
