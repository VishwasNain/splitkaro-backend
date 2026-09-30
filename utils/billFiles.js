// Bill files live in MongoDB GridFS, not on disk: Render's free tier wipes the disk
// on every deploy/restart, which would silently delete every uploaded bill.
const mongoose = require('mongoose');

const ALLOWED = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
};

// Trust the file's own bytes, not the client-supplied mimetype.
function sniffMime(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'billFiles' });
const oid = (id) => new mongoose.Types.ObjectId(id);

function saveFile(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename, { contentType });
    up.on('error', reject);
    up.on('finish', () => resolve(String(up.id)));
    up.end(buffer);
  });
}

const openFile = (fileId) => bucket().openDownloadStream(oid(fileId));
const deleteFile = (fileId) => bucket().delete(oid(fileId)).catch(() => {});

module.exports = { ALLOWED, sniffMime, saveFile, openFile, deleteFile };
