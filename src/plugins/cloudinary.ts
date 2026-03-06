// src/plugins/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

export const uploadToCloudinary = async (file: Buffer) => {
  return new Promise((resolve, reject) => {

    cloudinary.uploader
      .upload_stream(
        {
          folder: "cbrixi_products"
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      )
      .end(file);

  });
};

export const deleteFromCloudinary = async (publicId: string) => {
  return cloudinary.uploader.destroy(publicId);
};