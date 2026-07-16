// src/plugins/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

type CloudinaryUploadOptions = {
  folder?: string;
  resourceType?: "image" | "video" | "raw" | "auto";
};

export const uploadToCloudinary = async (
  file: Buffer,
  options: CloudinaryUploadOptions = {}
) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: options.folder ?? "cbrixi_products",
          resource_type: options.resourceType ?? "image"
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      )
      .end(file);
  });
};

export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "video" | "raw" | "auto" = "image"
) => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};
