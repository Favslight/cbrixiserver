import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(max).optional()
  );

export const lockMarketplaceSchema = z.object({
  title: optionalText(150),
  message: optionalText(500)
});
