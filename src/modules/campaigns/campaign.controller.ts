import { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse, successResponse } from "../../common/utils/response";
import { uploadToCloudinary } from "../../plugins/cloudinary";
import {
  createCampaign,
  deleteCampaign,
  getCampaignById,
  getCampaignStats,
  getHomepageCampaigns,
  listAdminCampaigns,
  recordCampaignView,
  setCampaignActiveState,
  updateCampaign
} from "./campaign.service";
import {
  adminCampaignsQuerySchema,
  campaignIdParamsSchema,
  createCampaignSchema,
  publicCampaignsQuerySchema,
  recordCampaignViewSchema,
  updateCampaignSchema
} from "./campaign.validation";

const parseMultipartCampaign = async (req: FastifyRequest) => {
  const fields: Record<string, string> = {};
  let mediaBuffer: Buffer | null = null;
  let mediaMime: string | null = null;
  let thumbnailBuffer: Buffer | null = null;
  let thumbnailMime: string | null = null;

  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      const fieldname = part.fieldname;

      if (fieldname === "media" || fieldname === "file" || fieldname === "image" || fieldname === "video") {
        mediaBuffer = buffer;
        mediaMime = part.mimetype;
      } else if (fieldname === "thumbnail") {
        thumbnailBuffer = buffer;
        thumbnailMime = part.mimetype;
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return {
    fields,
    mediaBuffer,
    mediaMime,
    thumbnailBuffer,
    thumbnailMime
  };
};

const uploadCampaignMedia = async (
  buffer: Buffer,
  mime: string | null
) => {
  const isVideo = Boolean(mime?.startsWith("video/"));
  const upload = await uploadToCloudinary(buffer, {
    folder: "cbrixi_campaigns",
    resourceType: isVideo ? "video" : "image"
  }) as { secure_url: string; public_id: string };

  return {
    url: upload.secure_url,
    publicId: upload.public_id,
    isVideo
  };
};

export const getHomepageCampaignsController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const query = publicCampaignsQuerySchema.parse(req.query);
    const campaigns = await getHomepageCampaigns(query.placement);
    return successResponse(reply, 200, "Campaigns retrieved successfully", { campaigns });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid query parameters", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const recordCampaignViewController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const body = recordCampaignViewSchema.parse(req.body);
    const view = await recordCampaignView(body);
    return successResponse(reply, 201, "Campaign view recorded", { view });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid request body", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const createCampaignController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    let rawBody: Record<string, unknown> = {};
    let mediaUpload: { url: string; publicId: string; isVideo: boolean } | null = null;
    let thumbnailUpload: { url: string; publicId: string; isVideo: boolean } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipartCampaign(req);
      rawBody = parsed.fields;

      if (parsed.mediaBuffer) {
        mediaUpload = await uploadCampaignMedia(parsed.mediaBuffer, parsed.mediaMime);
      }
      if (parsed.thumbnailBuffer) {
        thumbnailUpload = await uploadCampaignMedia(parsed.thumbnailBuffer, parsed.thumbnailMime);
      }
    } else {
      rawBody = (req.body ?? {}) as Record<string, unknown>;
    }

    const input = createCampaignSchema.parse(rawBody);

    if (input.campaign_type === "VIDEO" && mediaUpload && !mediaUpload.isVideo) {
      return errorResponse(reply, 400, "VIDEO campaigns require a video file upload");
    }

    if (input.campaign_type === "IMAGE" && mediaUpload && mediaUpload.isVideo) {
      return errorResponse(reply, 400, "IMAGE campaigns require an image file upload");
    }

    const campaign = await createCampaign(input, {
      createdBy: req.admin?.id ?? null,
      mediaUrl: mediaUpload?.url,
      thumbnailUrl: thumbnailUpload?.url,
      mediaPublicId: mediaUpload?.publicId,
      thumbnailPublicId: thumbnailUpload?.publicId
    });

    return successResponse(reply, 201, "Campaign created successfully", { campaign });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid campaign payload", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const listAdminCampaignsController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const query = adminCampaignsQuerySchema.parse(req.query);
    const result = await listAdminCampaigns(query);
    return successResponse(reply, 200, "Campaigns retrieved successfully", result);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid query parameters", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getCampaignByIdController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = campaignIdParamsSchema.parse(req.params);
    const campaign = await getCampaignById(params.id);
    if (!campaign) {
      return errorResponse(reply, 404, "Campaign not found");
    }
    return successResponse(reply, 200, "Campaign retrieved successfully", { campaign });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid campaign id", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const updateCampaignController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = campaignIdParamsSchema.parse(req.params);
    const contentType = String(req.headers["content-type"] ?? "");
    let rawBody: Record<string, unknown> = {};
    let mediaUpload: { url: string; publicId: string; isVideo: boolean } | null = null;
    let thumbnailUpload: { url: string; publicId: string; isVideo: boolean } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipartCampaign(req);
      rawBody = parsed.fields;
      if (parsed.mediaBuffer) {
        mediaUpload = await uploadCampaignMedia(parsed.mediaBuffer, parsed.mediaMime);
      }
      if (parsed.thumbnailBuffer) {
        thumbnailUpload = await uploadCampaignMedia(parsed.thumbnailBuffer, parsed.thumbnailMime);
      }
    } else {
      rawBody = (req.body ?? {}) as Record<string, unknown>;
    }

    const input = updateCampaignSchema.parse(rawBody);
    const campaign = await updateCampaign(params.id, input, {
      mediaUrl: mediaUpload?.url,
      thumbnailUrl: thumbnailUpload?.url,
      mediaPublicId: mediaUpload?.publicId,
      thumbnailPublicId: thumbnailUpload?.publicId
    });

    return successResponse(reply, 200, "Campaign updated successfully", { campaign });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid campaign payload", error.issues);
    }
    if (error.message === "Campaign not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const deleteCampaignController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = campaignIdParamsSchema.parse(req.params);
    const campaign = await deleteCampaign(params.id);
    return successResponse(reply, 200, "Campaign deleted successfully", {
      deleted_id: campaign.id
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid campaign id", error.issues);
    }
    if (error.message === "Campaign not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const activateCampaignController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = campaignIdParamsSchema.parse(req.params);
    const campaign = await setCampaignActiveState(params.id, true);
    return successResponse(reply, 200, "Campaign activated successfully", { campaign });
  } catch (error: any) {
    if (error.message === "Campaign not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const deactivateCampaignController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const params = campaignIdParamsSchema.parse(req.params);
    const campaign = await setCampaignActiveState(params.id, false);
    return successResponse(reply, 200, "Campaign deactivated successfully", { campaign });
  } catch (error: any) {
    if (error.message === "Campaign not found") {
      return errorResponse(reply, 404, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getCampaignStatsController = async (
  _req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const stats = await getCampaignStats();
    return successResponse(reply, 200, "Campaign stats retrieved successfully", { stats });
  } catch (error: any) {
    return errorResponse(reply, 400, error.message);
  }
};
