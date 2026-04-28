// src/modules/products/product.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { createProduct, deleteProduct, getActiveProducts, getAllProducts } from "./product.service";
import { uploadToCloudinary } from "../../plugins/cloudinary";

type MultipartFieldValue = {
  value: string;
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

export const createProductController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const parts = req.parts();
  const fields: Record<string, MultipartFieldValue | MultipartFieldValue[] | undefined> = {};
  const uploadResults: { secure_url: string; public_id: string }[] = [];

  for await (const part of parts) {
    if (part.type === "file") {
      if (!part.mimetype.startsWith("image/")) {
        return reply.status(400).send({ message: "Only image files are allowed" });
      }

      if (uploadResults.length >= 4) {
        return reply.status(400).send({ message: "You can upload up to 4 images" });
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

  if (!name || !priceValue || !stockValue) {
    return reply.status(400).send({
      message: "name, price and stock are required"
    });
  }

  const price = Number(priceValue);
  const stock = Number(stockValue);
  if (Number.isNaN(price) || Number.isNaN(stock)) {
    return reply.status(400).send({
      message: "price and stock must be valid numbers"
    });
  }

  const productData = {
    name,
    description,
    category,
    price,
    image_url: uploadResults[0].secure_url,
    image_public_id: uploadResults[0].public_id,
    image_urls: uploadResults.map((u) => u.secure_url),
    image_public_ids: uploadResults.map((u) => u.public_id),
    stock,
    installment_enabled: installmentEnabledValue === "true",
    minimum_deposit_percentage: parseOptionalNumber(minDepositValue),
    installment_duration_months: parseOptionalNumber(durationValue),
    fine_percentage_on_default: parseOptionalNumber(fineValue),
    minimum_wallet_balance_required: parseOptionalNumber(minWalletValue),
    grace_period_days: parseOptionalNumber(gracePeriodValue)
  };

  const product = await createProduct(productData);

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
