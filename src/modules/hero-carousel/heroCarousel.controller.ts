import { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse, successResponse } from "../../common/utils/response";
import { uploadToCloudinary } from "../../plugins/cloudinary";
import {
  createHeroSlide,
  deleteHeroSlide,
  getHeroSlideById,
  getPublicHeroSlides,
  listAdminHeroSlides,
  setHeroSlideActiveState,
  updateHeroSlide
} from "./heroCarousel.service";
import {
  adminHeroSlidesQuerySchema,
  createHeroSlideSchema,
  heroSlideIdParamsSchema,
  updateHeroSlideSchema
} from "./heroCarousel.validation";

const parseMultipartHeroSlide = async (req: FastifyRequest) => {
  const fields: Record<string, string> = {};
  let imageBuffer: Buffer | null = null;
  let imageMime: string | null = null;
  let mobileImageBuffer: Buffer | null = null;
  let mobileImageMime: string | null = null;

  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      if (part.fieldname === "image" || part.fieldname === "file") {
        imageBuffer = buffer;
        imageMime = part.mimetype;
      } else if (part.fieldname === "mobile_image") {
        mobileImageBuffer = buffer;
        mobileImageMime = part.mimetype;
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, imageBuffer, imageMime, mobileImageBuffer, mobileImageMime };
};

const uploadHeroImage = async (buffer: Buffer, mime: string | null) => {
  if (mime && !mime.startsWith("image/")) {
    throw new Error("Hero carousel uploads must be image files");
  }

  const upload = await uploadToCloudinary(buffer, {
    folder: "cbrixi_hero_carousel",
    resourceType: "image"
  }) as { secure_url: string; public_id: string };

  return {
    url: upload.secure_url,
    publicId: upload.public_id
  };
};

export const getPublicHeroSlidesController = async (
  _req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const slides = await getPublicHeroSlides();
    return successResponse(reply, 200, "Hero carousel slides retrieved successfully", { slides });
  } catch (error: any) {
    return errorResponse(reply, 400, error.message);
  }
};

export const listAdminHeroSlidesController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const query = adminHeroSlidesQuerySchema.parse(req.query);
    const result = await listAdminHeroSlides(query);
    return successResponse(reply, 200, "Hero carousel slides retrieved successfully", result);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid query parameters", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getHeroSlideByIdController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = heroSlideIdParamsSchema.parse(req.params);
    const slide = await getHeroSlideById(params.id);
    if (!slide) return errorResponse(reply, 404, "Hero carousel slide not found");
    return successResponse(reply, 200, "Hero carousel slide retrieved successfully", { slide });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid hero carousel slide id", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const createHeroSlideController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    let rawBody: Record<string, unknown> = {};
    let imageUpload: { url: string; publicId: string } | null = null;
    let mobileImageUpload: { url: string; publicId: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipartHeroSlide(req);
      rawBody = parsed.fields;
      if (parsed.imageBuffer) {
        imageUpload = await uploadHeroImage(parsed.imageBuffer, parsed.imageMime);
      }
      if (parsed.mobileImageBuffer) {
        mobileImageUpload = await uploadHeroImage(parsed.mobileImageBuffer, parsed.mobileImageMime);
      }
    } else {
      rawBody = (req.body ?? {}) as Record<string, unknown>;
    }

    const input = createHeroSlideSchema.parse(rawBody);
    const slide = await createHeroSlide(input, {
      createdBy: req.admin?.id ?? null,
      imageUrl: imageUpload?.url,
      imagePublicId: imageUpload?.publicId,
      mobileImageUrl: mobileImageUpload?.url,
      mobileImagePublicId: mobileImageUpload?.publicId
    });

    return successResponse(reply, 201, "Hero carousel slide created successfully", { slide });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid hero carousel slide payload", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const updateHeroSlideController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = heroSlideIdParamsSchema.parse(req.params);
    const contentType = String(req.headers["content-type"] ?? "");
    let rawBody: Record<string, unknown> = {};
    let imageUpload: { url: string; publicId: string } | null = null;
    let mobileImageUpload: { url: string; publicId: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipartHeroSlide(req);
      rawBody = parsed.fields;
      if (parsed.imageBuffer) {
        imageUpload = await uploadHeroImage(parsed.imageBuffer, parsed.imageMime);
      }
      if (parsed.mobileImageBuffer) {
        mobileImageUpload = await uploadHeroImage(parsed.mobileImageBuffer, parsed.mobileImageMime);
      }
    } else {
      rawBody = (req.body ?? {}) as Record<string, unknown>;
    }

    const input = updateHeroSlideSchema.parse(rawBody);
    const slide = await updateHeroSlide(params.id, input, {
      imageUrl: imageUpload?.url,
      imagePublicId: imageUpload?.publicId,
      mobileImageUrl: mobileImageUpload?.url,
      mobileImagePublicId: mobileImageUpload?.publicId
    });

    return successResponse(reply, 200, "Hero carousel slide updated successfully", { slide });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid hero carousel slide payload", error.issues);
    }
    if (error.message === "Hero carousel slide not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const deleteHeroSlideController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = heroSlideIdParamsSchema.parse(req.params);
    const slide = await deleteHeroSlide(params.id);
    return successResponse(reply, 200, "Hero carousel slide deleted successfully", {
      deleted_id: slide.id
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid hero carousel slide id", error.issues);
    }
    if (error.message === "Hero carousel slide not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const activateHeroSlideController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = heroSlideIdParamsSchema.parse(req.params);
    const slide = await setHeroSlideActiveState(params.id, true);
    return successResponse(reply, 200, "Hero carousel slide activated successfully", { slide });
  } catch (error: any) {
    if (error.message === "Hero carousel slide not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const deactivateHeroSlideController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = heroSlideIdParamsSchema.parse(req.params);
    const slide = await setHeroSlideActiveState(params.id, false);
    return successResponse(reply, 200, "Hero carousel slide deactivated successfully", { slide });
  } catch (error: any) {
    if (error.message === "Hero carousel slide not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};
