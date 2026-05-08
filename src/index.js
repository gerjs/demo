const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient, Prisma } = require('@prisma/client');

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Bad token' });
  }
}

function prismaError(res, err, fallback = 'Server error') {
  console.error(err);

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(400).json({ message: 'Unique constraint failed', code: err.code });
    if (err.code === 'P2003') return res.status(400).json({ message: 'Foreign key constraint failed', code: err.code });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Record not found', code: err.code });
  }

  return res.status(500).json({ message: fallback, code: err?.code || null });
}

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Fill all fields' });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ message: 'Email exists' });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, password: hash } });

    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (e) {
    prismaError(res, e, 'Server error');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    prismaError(res, e, 'Server error');
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { albums: { include: { photos: true }, orderBy: { createdAt: 'desc' } } }
    });
    res.json(user);
  } catch (e) {
    prismaError(res, e, 'Failed to load dashboard');
  }
});

app.post('/api/albums', auth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ message: 'Title required' });

    const shareToken = Math.random().toString(36).slice(2, 12);

    const album = await prisma.album.create({
      data: {
        title: title.trim(),
        shareToken,
        userId: req.user.id
      }
    });

    res.json(album);
  } catch (e) {
    prismaError(res, e, 'Failed to create album');
  }
});

app.patch('/api/albums/:id', auth, async (req, res) => {
  try {
    const { title } = req.body;

    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id }
    });

    if (!album) return res.status(404).json({ message: 'Not found' });

    const updated = await prisma.album.update({
      where: { id: album.id },
      data: {
        ...(title !== undefined ? { title } : {})
      }
    });

    res.json(updated);
  } catch (e) {
    prismaError(res, e, 'Failed to update album');
  }
});

app.delete('/api/albums/:id', auth, async (req, res) => {
  try {
    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id }
    });

    if (!album) return res.status(404).json({ message: 'Not found' });

    await prisma.photo.deleteMany({ where: { albumId: album.id } });
    await prisma.album.delete({ where: { id: album.id } });

    res.json({ ok: true });
  } catch (e) {
    prismaError(res, e, 'Failed to delete album');
  }
});

app.get('/api/albums/:id', auth, async (req, res) => {
  try {
    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id },
      include: { photos: true }
    });

    if (!album) return res.status(404).json({ message: 'Not found' });
    res.json(album);
  } catch (e) {
    prismaError(res, e, 'Server error');
  }
});

app.post('/api/albums/:id/photos', auth, upload.single('photo'), async (req, res) => {
  try {
    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id }
    });

    if (!album) return res.status(404).json({ message: 'Not found' });
    if (!req.file) return res.status(400).json({ message: 'File required' });

    const url = `http://localhost:${PORT}/uploads/${req.file.filename}`;
    const photo = await prisma.photo.create({
      data: { url, albumId: album.id }
    });

    res.json(photo);
  } catch (e) {
    prismaError(res, e, 'Failed to upload photo');
  }
});

app.delete('/api/photos/:id', auth, async (req, res) => {
  try {
    const photo = await prisma.photo.findUnique({
      where: { id: Number(req.params.id) },
      include: { album: true }
    });

    if (!photo || photo.album.userId !== req.user.id) {
      return res.status(404).json({ message: 'Not found' });
    }

    try {
      fs.unlinkSync(path.join(uploadDir, path.basename(photo.url)));
    } catch {}

    await prisma.photo.delete({ where: { id: photo.id } });
    res.json({ ok: true });
  } catch (e) {
    prismaError(res, e, 'Failed to delete photo');
  }
});

app.patch('/api/photos/:id/favorite', auth, async (req, res) => {
  try {
    const { favorite } = req.body;

    const photo = await prisma.photo.findUnique({
      where: { id: Number(req.params.id) },
      include: { album: true }
    });

    if (!photo || photo.album.userId !== req.user.id) {
      return res.status(404).json({ message: 'Not found' });
    }

    const updated = await prisma.photo.update({
      where: { id: photo.id },
      data: { favorite: !!favorite }
    });

    res.json(updated);
  } catch (e) {
    prismaError(res, e, 'Failed to update favorite');
  }
});

app.post('/api/albums/:id/share', auth, async (req, res) => {
  try {
    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id }
    });

    if (!album) return res.status(404).json({ message: 'Not found' });

    await prisma.album.update({
      where: { id: album.id },
      data: { isShared: true }
    });

    res.json({ link: `http://localhost:5173/share/${album.shareToken}` });
  } catch (e) {
    prismaError(res, e, 'Failed to share album');
  }
});

app.post('/api/albums/:id/unshare', auth, async (req, res) => {
  try {
    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id }
    });

    if (!album) return res.status(404).json({ message: 'Not found' });

    await prisma.album.update({
      where: { id: album.id },
      data: { isShared: false }
    });

    res.json({ ok: true });
  } catch (e) {
    prismaError(res, e, 'Failed to unshare album');
  }
});

app.get('/api/share/:token', async (req, res) => {
  try {
    const album = await prisma.album.findUnique({
      where: { shareToken: req.params.token },
      include: { photos: true, user: { select: { name: true } } }
    });

    if (!album || !album.isShared) return res.status(404).json({ message: 'Not found' });
    res.json(album);
  } catch (e) {
    prismaError(res, e, 'Failed to load shared album');
  }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));