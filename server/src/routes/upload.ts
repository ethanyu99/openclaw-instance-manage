import { Router } from 'express';
import multer from 'multer';
import { getUploadProvider } from '../upload';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_TYPES.includes(file.mimetype));
  },
});

export const uploadRouter = Router();

uploadRouter.post('/', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const provider = getUploadProvider();
    const results = await Promise.all(
      files.map(f => provider.upload(f.buffer, f.originalname, f.mimetype)),
    );

    res.json({ files: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});
