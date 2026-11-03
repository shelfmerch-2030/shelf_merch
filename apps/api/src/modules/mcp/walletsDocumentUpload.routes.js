import { Router } from 'express';
import { uploader, DOCUMENT_TYPES } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { completeWalletDocumentUpload } from './walletsDocumentUpload.js';

const router = Router();
const upload = uploader({ allow: DOCUMENT_TYPES, maxSizeMb: 25 });

/**
 * Authenticated by one-time MCP upload ticket token (not session JWT).
 * Used when an AI client cannot transfer binary files through MCP tools.
 */
router.post(
  '/:ticketId',
  upload.single('document'),
  asyncHandler(async (req, res) => {
    const uploadToken = String(
      req.get('x-mcp-upload-token')
      || req.get('x-upload-token')
      || req.body?.uploadToken
      || req.query?.uploadToken
      || '',
    ).trim();
    const result = await completeWalletDocumentUpload({
      ticketId: req.params.ticketId,
      uploadToken,
      file: req.file,
    });
    res.status(201).json(result);
  }),
);

export default router;
