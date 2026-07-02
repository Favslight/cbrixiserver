// src/modules/products/product.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { calculateProductDiscount, createProduct, deleteProduct, getActiveProducts, getActiveProductsByCategory, getAllProducts, updateProduct } from "./product.service";
import { uploadToCloudinary } from "../../plugins/cloudinary";

const MAX_PRODUCT_IMAGES = 7;

type MultipartFieldValue = {
  value: string;
};

type ProductImageInput = {
  url: string;
  public_id?: string | null;
};

type UploadedProductImage = {
  secure_url: string;
  public_id: string;
};

const readFieldValue = (
  fields: Record<string, MultipartFieldValue | MultipartFieldValue[] | undefined>,
  key: string
) => {
  const field = fields[key];
  if (!field) return undefined;
  if (Array.isArray(field)) return field[0]?.value;
  return field.value;
};

const parseOptionalNumber = (value: string | undefined) => {
  if (value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const parseOptionalInteger = (value: string | undefined) => {
  if (value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isInteger(num) ? num : undefined;
};

const parseOptionalBoolean = (value: string | undefined) => {
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return null;
};

const parseNumberField = (value: string | undefined) => {
  if (value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const parseJsonArray = <T>(value: string | undefined): T[] | undefined => {
  if (value === undefined || value === "") return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : undefined;
  } catch {
    return undefined;
  }
};

const parseJsonArrayField = <T>(value: string | undefined, fieldName: string) => {
  if (value === undefined || value === "") {
    return { provided: false, value: undefined as T[] | undefined, error: undefined as string | undefined };
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { provided: true, value: undefined, error: `${fieldName} must be a JSON array` };
    }
    return { provided: true, value: parsed as T[], error: undefined };
  } catch {
    return { provided: true, value: undefined, error: `${fieldName} must be valid JSON` };
  }
};

const derivePriceAndStockFromVariants = (
  priceValue: string | undefined,
  stockValue: string | undefined,
  variants: any[] | undefined
) => {
  const activeVariants = (variants ?? []).filter((variant) => variant?.is_active !== false);
  const variantPrices = activeVariants.map((variant) => Number(variant?.price));
  const validPrices = variantPrices.filter((price) => Number.isFinite(price) && price >= 0);
  const variantStocks = activeVariants.map((variant) => Number(variant?.stock ?? 0));
  const validStocks = variantStocks.filter((stock) => Number.isInteger(stock) && stock >= 0);

  return {
    priceValue: priceValue ?? (validPrices.length ? String(Math.min(...validPrices)) : undefined),
    stockValue: stockValue ?? (validStocks.length === activeVariants.length
      ? String(validStocks.reduce((sum, stock) => sum + stock, 0))
      : undefined)
  };
};

const normalizeExistingImages = (
  imageManifest: ProductImageInput[] | undefined,
  imageUrls: string[] | undefined,
  imagePublicIds: (string | null | undefined)[] | undefined
) => {
  if (imageManifest) {
    return imageManifest
      .filter((image) => typeof image?.url === "string" && image.url.trim())
      .map((image) => ({
        url: image.url.trim(),
        public_id: typeof image.public_id === "string" && image.public_id.trim()
          ? image.public_id.trim()
          : null
      }));
  }

  if (!imageUrls) return [];

  return imageUrls
    .filter((url) => typeof url === "string" && url.trim())
    .map((url, index) => ({
      url: url.trim(),
      public_id: typeof imagePublicIds?.[index] === "string" && imagePublicIds[index]?.trim()
        ? imagePublicIds[index]!.trim()
        : null
    }));
};

const buildProductImagePayload = (
  images: { url: string; public_id: string | null }[],
  thumbnailIndex?: number,
  thumbnailUrl?: string | null
) => {
  if (images.length > MAX_PRODUCT_IMAGES) {
    throw new Error(`You can upload up to ${MAX_PRODUCT_IMAGES} images`);
  }

  if (!images.length) {
    throw new Error("At least 1 product image is required");
  }

  let selectedIndex = thumbnailIndex ?? 0;
  const normalizedThumbnailUrl = thumbnailUrl?.trim();

  if (normalizedThumbnailUrl) {
    const urlIndex = images.findIndex((image) => image.url === normalizedThumbnailUrl);
    if (urlIndex === -1) {
      throw new Error("Thumbnail image must be one of the product images");
    }
    selectedIndex = urlIndex;
  }

  if (selectedIndex < 0 || selectedIndex >= images.length) {
    throw new Error("thumbnail_index is out of range");
  }

  const thumbnail = images[selectedIndex];

  return {
    image_url: thumbnail.url,
    image_public_id: thumbnail.public_id,
    image_urls: images.map((image) => image.url),
    image_public_ids: images.map((image) => image.public_id ?? "")
  };
};

export const previewProductDiscountController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const priceValue = body.price !== undefined ? String(body.price) : undefined;
  const discountEnabledValue = body.discount_enabled !== undefined
    ? String(body.discount_enabled)
    : body.discountEnabled !== undefined
      ? String(body.discountEnabled)
      : undefined;
  const discountPercentageValue = body.discount_percentage !== undefined
    ? String(body.discount_percentage)
    : body.discountPercentage !== undefined
      ? String(body.discountPercentage)
      : undefined;

  const price = parseNumberField(priceValue);
  const parsedDiscountEnabled = parseOptionalBoolean(discountEnabledValue);
  const discountEnabled = parsedDiscountEnabled ?? false;
  const discountPercentage = parseNumberField(discountPercentageValue);

  if (price === undefined) {
    return reply.status(400).send({ message: "price is required" });
  }

  if (price === null) {
    return reply.status(400).send({ message: "price must be a valid number" });
  }

  if (parsedDiscountEnabled === null) {
    return reply.status(400).send({ message: "discount_enabled must be true or false" });
  }

  if (discountPercentage === null) {
    return reply.status(400).send({ message: "discount_percentage must be a valid number" });
  }

  try {
    const discount = calculateProductDiscount(price, discountEnabled, discountPercentage);
    return reply.send({ success: true, discount });
  } catch (error: any) {
    return reply.status(400).send({ message: error.message });
  }
};

export const createProductController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const parts = req.parts();
  const fields: Record<string, MultipartFieldValue | MultipartFieldValue[] | undefined> = {};
  const uploadResults: UploadedProductImage[] = [];

  for await (const part of parts) {
    if (part.type === "file") {
      if (!part.mimetype.startsWith("image/")) {
        return reply.status(400).send({ message: "Only image files are allowed" });
      }

      if (uploadResults.length >= MAX_PRODUCT_IMAGES) {
        return reply.status(400).send({ message: `You can upload up to ${MAX_PRODUCT_IMAGES} images` });
      }

      const buffer = await part.toBuffer();
      const upload = await uploadToCloudinary(buffer) as { secure_url: string; public_id: string };
      uploadResults.push(upload);
      continue;
    }

    fields[part.fieldname] = part.value
      ? ({ value: String(part.value) } as MultipartFieldValue)
      : undefined;
  }

  if (!uploadResults.length) {
    return reply.status(400).send({ message: "At least 1 product image is required" });
  }

  const name = readFieldValue(fields, "name");
  const priceValue = readFieldValue(fields, "price");
  const stockValue = readFieldValue(fields, "stock");
  const description = readFieldValue(fields, "description");
  const category = readFieldValue(fields, "category");
  const installmentEnabledValue = readFieldValue(fields, "installment_enabled");
  const minDepositValue = readFieldValue(fields, "minimum_deposit_percentage");
  const durationValue = readFieldValue(fields, "installment_duration_months");
  const fineValue = readFieldValue(fields, "fine_percentage_on_default");
  const minWalletValue = readFieldValue(fields, "minimum_wallet_balance_required");
  const gracePeriodValue = readFieldValue(fields, "grace_period_days");
  const discountEnabledValue = readFieldValue(fields, "discount_enabled") ?? readFieldValue(fields, "discountEnabled");
  const discountPercentageValue = readFieldValue(fields, "discount_percentage") ?? readFieldValue(fields, "discountPercentage");
  const variantsFieldValue = readFieldValue(fields, "variants") ?? readFieldValue(fields, "product_variants");
  const parsedVariants = parseJsonArrayField<any>(variantsFieldValue, "variants");
  const thumbnailIndex = parseOptionalInteger(
    readFieldValue(fields, "thumbnail_index") ?? readFieldValue(fields, "thumbnailIndex")
  );
  const thumbnailUrl = readFieldValue(fields, "thumbnail_url") ?? readFieldValue(fields, "thumbnailUrl");

  if (parsedVariants.error) {
    return reply.status(400).send({ message: parsedVariants.error });
  }

  const derived = derivePriceAndStockFromVariants(priceValue, stockValue, parsedVariants.value);
  const effectivePriceValue = derived.priceValue;
  const effectiveStockValue = derived.stockValue;

  if (!name || !effectivePriceValue || !effectiveStockValue) {
    return reply.status(400).send({
      message: "name, price and stock are required unless variants include price and stock"
    });
  }

  const price = Number(effectivePriceValue);
  const stock = Number(effectiveStockValue);
  if (Number.isNaN(price) || Number.isNaN(stock)) {
    return reply.status(400).send({
      message: "price and stock must be valid numbers"
    });
  }

  const parsedDiscountEnabled = parseOptionalBoolean(discountEnabledValue);
  const discountEnabled = parsedDiscountEnabled ?? false;
  const discountPercentage = parseNumberField(discountPercentageValue);

  if (parsedDiscountEnabled === null) {
    return reply.status(400).send({ message: "discount_enabled must be true or false" });
  }

  if (discountPercentage === null) {
    return reply.status(400).send({ message: "discount_percentage must be a valid number" });
  }

  try {
    calculateProductDiscount(price, discountEnabled, discountPercentage);
  } catch (error: any) {
    return reply.status(400).send({ message: error.message });
  }

  let imagePayload;
  try {
    imagePayload = buildProductImagePayload(
      uploadResults.map((upload) => ({
        url: upload.secure_url,
        public_id: upload.public_id
      })),
      thumbnailIndex,
      thumbnailUrl
    );
  } catch (error: any) {
    return reply.status(400).send({ message: error.message });
  }

  const productData = {
    name,
    description,
    category,
    price,
    ...imagePayload,
    stock,
    variants: parsedVariants.value,
    installment_enabled: installmentEnabledValue === "true",
    minimum_deposit_percentage: parseOptionalNumber(minDepositValue),
    installment_duration_months: parseOptionalNumber(durationValue),
    fine_percentage_on_default: parseOptionalNumber(fineValue),
    minimum_wallet_balance_required: parseOptionalNumber(minWalletValue),
    grace_period_days: parseOptionalNumber(gracePeriodValue),
    discount_enabled: discountEnabled,
    discount_percentage: discountPercentage
  };

  let product;
  try {
    product = await createProduct(productData);
  } catch (error: any) {
    if (
      error?.message === "variant price must be a valid non-negative number"
      || error?.message === "variant stock must be a valid non-negative integer"
      || error?.message === "At least one active product variant is required"
      || error?.message === "price must be a valid non-negative number"
      || error?.message === "discount_percentage must be greater than 0 and less than or equal to 100 when discount is active"
    ) {
      return reply.status(400).send({ message: error.message });
    }

    req.log.error(error);
    return reply.status(500).send({ message: "Failed to create product" });
  }

  return reply.send({
    success: true,
    product
  });

};

export const getProductsController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const products = await getAllProducts();

  return reply.send({
    success: true,
    products
  });

};

export const deleteProductController = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {

  const product = await deleteProduct(req.params.id);

  return reply.send({
    success: true,
    product
  });

};

export const updateProductController = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    const isMultipart = contentType.includes("multipart/form-data");

    let name: string | undefined;
    let description: string | undefined;
    let category: string | undefined;
    let priceValue: string | undefined;
    let stockValue: string | undefined;
    let installmentEnabledValue: string | undefined;
    let minDepositValue: string | undefined;
    let durationValue: string | undefined;
    let fineValue: string | undefined;
    let minWalletValue: string | undefined;
    let gracePeriodValue: string | undefined;
    let discountEnabledValue: string | undefined;
    let discountPercentageValue: string | undefined;
    let variantsValue: string | undefined;
    let variants: any[] | undefined;
    let variantsProvided = false;
    let imagesManifest: ProductImageInput[] | undefined;
    let existingImageUrls: string[] | undefined;
    let existingImagePublicIds: string[] | undefined;
    let thumbnailIndex: number | undefined;
    let thumbnailUrl: string | undefined;
    const uploadResults: UploadedProductImage[] = [];

    if (isMultipart) {
      const parts = req.parts();
      const fields: Record<string, MultipartFieldValue | MultipartFieldValue[] | undefined> = {};

      for await (const part of parts) {
        if (part.type === "file") {
          if (!part.mimetype.startsWith("image/")) {
            return reply.status(400).send({ message: "Only image files are allowed" });
          }

          if (uploadResults.length >= MAX_PRODUCT_IMAGES) {
            return reply.status(400).send({ message: `You can upload up to ${MAX_PRODUCT_IMAGES} images` });
          }

          const buffer = await part.toBuffer();
          const upload = (await uploadToCloudinary(buffer)) as { secure_url: string; public_id: string };
          uploadResults.push(upload);
          continue;
        }

        fields[part.fieldname] = part.value
          ? ({ value: String(part.value) } as MultipartFieldValue)
          : undefined;
      }

      name = readFieldValue(fields, "name");
      description = readFieldValue(fields, "description");
      category = readFieldValue(fields, "category");
      priceValue = readFieldValue(fields, "price");
      stockValue = readFieldValue(fields, "stock");
      installmentEnabledValue = readFieldValue(fields, "installment_enabled") ?? readFieldValue(fields, "installmentEnabled");
      minDepositValue = readFieldValue(fields, "minimum_deposit_percentage") ?? readFieldValue(fields, "minimumDepositPercentage");
      durationValue = readFieldValue(fields, "installment_duration_months") ?? readFieldValue(fields, "installmentDurationMonths");
      fineValue = readFieldValue(fields, "fine_percentage_on_default") ?? readFieldValue(fields, "finePercentageOnDefault");
      minWalletValue = readFieldValue(fields, "minimum_wallet_balance_required") ?? readFieldValue(fields, "minimumWalletBalanceRequired");
      gracePeriodValue = readFieldValue(fields, "grace_period_days") ?? readFieldValue(fields, "gracePeriodDays");
      discountEnabledValue = readFieldValue(fields, "discount_enabled") ?? readFieldValue(fields, "discountEnabled");
      discountPercentageValue = readFieldValue(fields, "discount_percentage") ?? readFieldValue(fields, "discountPercentage");
      variantsValue = readFieldValue(fields, "variants") ?? readFieldValue(fields, "product_variants");
      const parsedVariants = parseJsonArrayField<any>(variantsValue, "variants");
      if (parsedVariants.error) {
        return reply.status(400).send({ message: parsedVariants.error });
      }
      variantsProvided = parsedVariants.provided;
      variants = parsedVariants.value;
      imagesManifest = parseJsonArray<ProductImageInput>(
        readFieldValue(fields, "images_manifest") ?? readFieldValue(fields, "imagesManifest")
      );
      existingImageUrls = parseJsonArray<string>(
        readFieldValue(fields, "existing_image_urls") ?? readFieldValue(fields, "image_urls")
      );
      existingImagePublicIds = parseJsonArray<string>(
        readFieldValue(fields, "existing_image_public_ids") ?? readFieldValue(fields, "image_public_ids")
      );
      thumbnailIndex = parseOptionalInteger(
        readFieldValue(fields, "thumbnail_index") ?? readFieldValue(fields, "thumbnailIndex")
      );
      thumbnailUrl = readFieldValue(fields, "thumbnail_url") ?? readFieldValue(fields, "thumbnailUrl");
    } else {
      const body = (req.body ?? {}) as Record<string, unknown>;
      name = typeof body.name === "string" ? body.name : undefined;
      description = typeof body.description === "string" ? body.description : undefined;
      category = typeof body.category === "string" ? body.category : undefined;
      priceValue = body.price !== undefined ? String(body.price) : undefined;
      stockValue = body.stock !== undefined ? String(body.stock) : undefined;
      installmentEnabledValue = body.installment_enabled !== undefined
        ? String(body.installment_enabled)
        : body.installmentEnabled !== undefined
          ? String(body.installmentEnabled)
          : undefined;
      minDepositValue = body.minimum_deposit_percentage !== undefined
        ? String(body.minimum_deposit_percentage)
        : body.minimumDepositPercentage !== undefined
          ? String(body.minimumDepositPercentage)
          : undefined;
      durationValue = body.installment_duration_months !== undefined
        ? String(body.installment_duration_months)
        : body.installmentDurationMonths !== undefined
          ? String(body.installmentDurationMonths)
          : undefined;
      fineValue = body.fine_percentage_on_default !== undefined
        ? String(body.fine_percentage_on_default)
        : body.finePercentageOnDefault !== undefined
          ? String(body.finePercentageOnDefault)
          : undefined;
      minWalletValue = body.minimum_wallet_balance_required !== undefined
        ? String(body.minimum_wallet_balance_required)
        : body.minimumWalletBalanceRequired !== undefined
          ? String(body.minimumWalletBalanceRequired)
          : undefined;
      gracePeriodValue = body.grace_period_days !== undefined
        ? String(body.grace_period_days)
        : body.gracePeriodDays !== undefined
          ? String(body.gracePeriodDays)
          : undefined;
      discountEnabledValue = body.discount_enabled !== undefined
        ? String(body.discount_enabled)
        : body.discountEnabled !== undefined
          ? String(body.discountEnabled)
          : undefined;
      discountPercentageValue = body.discount_percentage !== undefined
        ? String(body.discount_percentage)
        : body.discountPercentage !== undefined
          ? String(body.discountPercentage)
          : undefined;
      if (Array.isArray(body.variants)) {
        variantsProvided = true;
        variants = body.variants as any[];
      } else if (Array.isArray(body.product_variants)) {
        variantsProvided = true;
        variants = body.product_variants as any[];
      } else if (body.variants !== undefined || body.product_variants !== undefined) {
        return reply.status(400).send({ message: "variants must be an array" });
      }
      imagesManifest = Array.isArray(body.images_manifest)
        ? body.images_manifest as ProductImageInput[]
        : Array.isArray(body.imagesManifest)
          ? body.imagesManifest as ProductImageInput[]
          : undefined;
      existingImageUrls = Array.isArray(body.existing_image_urls)
        ? body.existing_image_urls as string[]
        : Array.isArray(body.image_urls)
          ? body.image_urls as string[]
          : undefined;
      existingImagePublicIds = Array.isArray(body.existing_image_public_ids)
        ? body.existing_image_public_ids as string[]
        : Array.isArray(body.image_public_ids)
          ? body.image_public_ids as string[]
          : undefined;
      thumbnailIndex = typeof body.thumbnail_index === "number"
        ? body.thumbnail_index
        : typeof body.thumbnailIndex === "number"
          ? body.thumbnailIndex
          : parseOptionalInteger(
              body.thumbnail_index !== undefined
                ? String(body.thumbnail_index)
                : body.thumbnailIndex !== undefined
                  ? String(body.thumbnailIndex)
                  : undefined
            );
      thumbnailUrl = typeof body.thumbnail_url === "string"
        ? body.thumbnail_url
        : typeof body.thumbnailUrl === "string"
          ? body.thumbnailUrl
          : undefined;
    }

    const parsedPrice = priceValue !== undefined && priceValue !== "" ? Number(priceValue) : undefined;
    const parsedStock = stockValue !== undefined && stockValue !== "" ? Number(stockValue) : undefined;
    const parsedInstallmentEnabled = parseOptionalBoolean(installmentEnabledValue);
    const parsedMinDeposit = parseNumberField(minDepositValue);
    const parsedDuration = parseNumberField(durationValue);
    const parsedFine = parseNumberField(fineValue);
    const parsedMinWallet = parseNumberField(minWalletValue);
    const parsedGracePeriod = parseNumberField(gracePeriodValue);
    const parsedDiscountEnabled = parseOptionalBoolean(discountEnabledValue);
    const parsedDiscountPercentage = parseNumberField(discountPercentageValue);

    if (parsedPrice !== undefined && Number.isNaN(parsedPrice)) {
      return reply.status(400).send({ message: "price must be a valid number" });
    }

    if (parsedStock !== undefined && Number.isNaN(parsedStock)) {
      return reply.status(400).send({ message: "stock must be a valid number" });
    }

    if (parsedInstallmentEnabled === null) {
      return reply.status(400).send({ message: "installment_enabled must be true or false" });
    }

    if (parsedMinDeposit === null) {
      return reply.status(400).send({ message: "minimum_deposit_percentage must be a valid number" });
    }

    if (parsedDuration === null) {
      return reply.status(400).send({ message: "installment_duration_months must be a valid number" });
    }

    if (parsedFine === null) {
      return reply.status(400).send({ message: "fine_percentage_on_default must be a valid number" });
    }

    if (parsedMinWallet === null) {
      return reply.status(400).send({ message: "minimum_wallet_balance_required must be a valid number" });
    }

    if (parsedGracePeriod === null) {
      return reply.status(400).send({ message: "grace_period_days must be a valid number" });
    }

    if (parsedDiscountEnabled === null) {
      return reply.status(400).send({ message: "discount_enabled must be true or false" });
    }

    if (parsedDiscountPercentage === null) {
      return reply.status(400).send({ message: "discount_percentage must be a valid number" });
    }

    const updateData: any = {
      name,
      description,
      category,
      price: parsedPrice,
      stock: parsedStock,
      variants: variantsProvided ? variants : undefined,
      installment_enabled: parsedInstallmentEnabled,
      minimum_deposit_percentage: parsedMinDeposit,
      installment_duration_months: parsedDuration,
      fine_percentage_on_default: parsedFine,
      minimum_wallet_balance_required: parsedMinWallet,
      grace_period_days: parsedGracePeriod,
      discount_enabled: parsedDiscountEnabled,
      discount_percentage: parsedDiscountPercentage
    };

    const existingImages = normalizeExistingImages(
      imagesManifest,
      existingImageUrls,
      existingImagePublicIds
    );

    const shouldUpdateImages = Boolean(
      imagesManifest
      || existingImageUrls
      || uploadResults.length
      || thumbnailIndex !== undefined
      || thumbnailUrl
    );

    if (shouldUpdateImages) {
      const uploadedImages = uploadResults.map((upload) => ({
        url: upload.secure_url,
        public_id: upload.public_id
      }));

      const finalImages = existingImages.length || imagesManifest || existingImageUrls
        ? [...existingImages, ...uploadedImages]
        : uploadedImages;

      try {
        Object.assign(
          updateData,
          buildProductImagePayload(finalImages, thumbnailIndex, thumbnailUrl)
        );
      } catch (error: any) {
        return reply.status(400).send({ message: error.message });
      }
    }

    const product = await updateProduct(req.params.id, updateData);

    if (!product) {
      return reply.status(404).send({ message: "Product not found" });
    }

    return reply.send({ success: true, product });
  } catch (error: any) {
    if (error?.message === "No update fields provided") {
      return reply.status(400).send({ message: error.message });
    }
    if (error?.message === "Product id is required" || error?.message === "Update payload is required") {
      return reply.status(400).send({ message: error.message });
    }
    if (
      error?.message === "price must be a valid non-negative number"
      || error?.message === "discount_percentage must be greater than 0 and less than or equal to 100 when discount is active"
      || error?.message === "variant price must be a valid non-negative number"
      || error?.message === "variant stock must be a valid non-negative integer"
      || error?.message === "At least one active product variant is required"
    ) {
      return reply.status(400).send({ message: error.message });
    }

    req.log.error(error);
    return reply.status(500).send({ message: "Failed to update product" });
  }
};



export const getPublicProductsController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const products = await getActiveProducts();

  return reply.send({
    success: true,
    products
  });

};

export const getPublicProductsByCategoryController = async (
  req: FastifyRequest<{ Params: { category: string } }>,
  reply: FastifyReply
) => {
  try {
    const { category } = req.params;
    const products = await getActiveProductsByCategory(category);

    return reply.send({
      success: true,
      category,
      products
    });
  } catch (error: any) {
    if (error?.message === "Category is required") {
      return reply.status(400).send({ message: error.message });
    }

    req.log.error(error);
    return reply.status(500).send({ message: "Failed to fetch products by category" });
  }
};
