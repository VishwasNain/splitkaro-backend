const mongoose = require('mongoose');

// One bill. groupId === null means it sits in the user's "Personal" bucket.
const billSchema = new mongoose.Schema(
  {
    _id: { type: String }, // client-generated id, same pattern as Group/Expense
    ownerId: { type: String, required: true, index: true }, // uploader's email
    groupId: { type: String, default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: 'Other' },
    dueDate: String,
    isPaid: { type: Boolean, default: false },
    paidAt: String,
    createdAt: String,
    // The uploaded image/PDF, stored in GridFS (see utils/billFiles.js).
    attachment: {
      fileId: String,
      type: { type: String, enum: ['image', 'pdf'] },
      mimeType: String,
      fileName: String,
      size: Number,
      source: { type: String, enum: ['camera', 'gallery', 'file'] },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        if (ret.attachment) delete ret.attachment.fileId; // internal only
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('Bill', billSchema);
