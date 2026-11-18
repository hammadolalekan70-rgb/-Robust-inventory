import express from 'express';
import { asyncHandler } from '../lib/errors.js';
import {
  getDetailedReport,
  getSummaryReport
} from '../services/reportService.js';
import { pdfFilename, streamDetailedPdf, streamSummaryPdf } from '../services/pdfService.js';
import { requireAuth, requireBoss } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rangeQuery } from '../validation/schemas.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireBoss);

router.get(
  '/summary',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getSummaryReport({ from, to });
    res.json(report);
  })
);

router.get(
  '/detailed',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getDetailedReport({ from, to });
    res.json(report);
  })
);

router.get(
  '/summary.pdf',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getSummaryReport({ from, to });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdfFilename('summary', from, to)}"`
    );
    streamSummaryPdf(res, report);
  })
);

router.get(
  '/detailed.pdf',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const report = await getDetailedReport({ from, to });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdfFilename('detailed', from, to)}"`
    );
    streamDetailedPdf(res, report);
  })
);

export default router;
