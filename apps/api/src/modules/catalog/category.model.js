import mongoose from 'mongoose';

// Platform catalog taxonomy. parentId null = root. depth 0 = category,
// 1 = subcategory, 2 = child category. Deeper rows are allowed.
// Name and slug are unique per parent so "Others" can exist under several parents.
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    depth: { type: Number, default: 0, min: 0 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

categorySchema.index({ parentId: 1, name: 1 }, { unique: true });
categorySchema.index({ parentId: 1, slug: 1 }, { unique: true });
categorySchema.index({ parentId: 1, sortOrder: 1 });
categorySchema.index({ depth: 1 });

export const Category = mongoose.model('Category', categorySchema);
