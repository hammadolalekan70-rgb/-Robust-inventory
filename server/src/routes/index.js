import express from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import userRoutes from './users.routes.js';
import productRoutes from './products.routes.js';
import supplierRoutes from './suppliers.routes.js';
import purchaseRoutes from './purchases.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import reportRoutes from './reports.routes.js';
import attachmentRoutes from './attachments.routes.js';
import auditRoutes from './audit.routes.js';

const router = express.Router();

router.get('/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    database: states[mongoose.connection.readyState] || 'unknown',
    time: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/attachments', attachmentRoutes);
router.use('/audit', auditRoutes);

export default router;
