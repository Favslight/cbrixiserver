// src/modules/products/product.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { createProduct, deleteProduct, getActiveProducts, getAllProducts } from "./product.service";
import { uploadToCloudinary } from "../../plugins/cloudinary";

export const createProductController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const data = await req.file();

  if (!data) {
    return reply.status(400).send({ message: "Image is required" });
  }

  const buffer = await data.toBuffer();

  const upload: any = await uploadToCloudinary(buffer);

  const body: any = data.fields;

  const productData = {
    name: body.name.value,
    description: body.description?.value,
    category: body.category?.value,
    price: Number(body.price.value),
    image_url: upload.secure_url,
    image_public_id: upload.public_id,
    stock: Number(body.stock.value),
    installment_enabled: body.installment_enabled?.value === "true",
    minimum_deposit_percentage: Number(body.minimum_deposit_percentage?.value),
    installment_duration_months: Number(body.installment_duration_months?.value),
    fine_percentage_on_default: Number(body.fine_percentage_on_default?.value),
    minimum_wallet_balance_required: Number(body.minimum_wallet_balance_required?.value),
    grace_period_days: Number(body.grace_period_days?.value)
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