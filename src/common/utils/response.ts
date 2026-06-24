import { FastifyReply } from "fastify";

export const successResponse = (
  reply: FastifyReply,
  statusCode: number,
  message: string,
  data: Record<string, unknown> = {}
) => {
  return reply.code(statusCode).send({
    success: true,
    message,
    ...data
  });
};

export const errorResponse = (
  reply: FastifyReply,
  statusCode: number,
  message: string,
  errors?: unknown
) => {
  return reply.code(statusCode).send({
    success: false,
    message,
    ...(errors === undefined ? {} : { errors })
  });
};
