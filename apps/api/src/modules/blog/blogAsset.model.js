import mongoose from 'mongoose';

const blogAssetSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true },
    key: { type: String, required: true },
    driver: { type: String, enum: ['local', 's3', 'r2'], required: true },
    contentType: { type: String, required: true },
  },
  { timestamps: true },
);

export const BlogAsset = mongoose.model('BlogAsset', blogAssetSchema);
