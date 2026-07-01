# Admin Product Image Integration

Use this file for the admin/super-admin product image UI.

## Limits

- Product images: maximum 7.
- Accepted files: image MIME types only.
- Display order is the order stored in `image_urls`.
- Thumbnail is stored in `image_url`.

## Admin Product Shape

`GET /admin/products` returns:

```ts
type AdminProduct = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: string | number;
  image_url?: string | null;
  image_public_id?: string | null;
  image_urls: string[];
  image_public_ids: string[];
  stock: number;
};
```

Render images in `image_urls` order. Use `image_url` as the thumbnail/primary image.

## Create Product

```ts
POST /admin/products
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

Fields:

```ts
name: string;
price: string;
stock: string;
description?: string;
category?: string;
thumbnail_index?: string; // zero-based index in uploaded file order, defaults to 0
images: File[]; // append up to 7 image files
```

Example:

```ts
const form = new FormData();
form.append("name", name);
form.append("price", String(price));
form.append("stock", String(stock));
form.append("thumbnail_index", "2");

for (const file of orderedFiles) {
  form.append("images", file);
}
```

## Edit Product Images

Use this endpoint for changing images, reordering existing images, removing images, adding new images, and choosing the thumbnail.

```ts
PUT /admin/products/:id
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

Fields:

```ts
images_manifest?: string; // JSON array of existing images to keep, in final display order
thumbnail_index?: string; // zero-based index in final image order
images?: File[]; // new files appended after images_manifest order
```

`images_manifest` format:

```ts
[
  {
    "url": "https://res.cloudinary.com/.../image-a.jpg",
    "public_id": "cbrixi_products/image-a"
  },
  {
    "url": "https://res.cloudinary.com/.../image-b.jpg",
    "public_id": "cbrixi_products/image-b"
  }
]
```

Rules:

- To reorder existing images, send `images_manifest` in the desired order.
- To remove an existing image, omit it from `images_manifest`.
- To add images, append new files as `images`.
- New files are appended after the manifest images.
- `thumbnail_index` points to the final array after existing images and new files are combined.
- Total final images must be 1 to 7.

Example:

```ts
const keptImages = reorderedImages.map((image) => ({
  url: image.url,
  public_id: image.public_id
}));

const form = new FormData();
form.append("name", name);
form.append("images_manifest", JSON.stringify(keptImages));
form.append("thumbnail_index", String(thumbnailIndex));

for (const file of newFiles) {
  form.append("images", file);
}
```

## JSON-Only Reorder

For reordering or thumbnail changes without uploading new files:

```ts
PUT /admin/products/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "images_manifest": [
    {
      "url": "https://res.cloudinary.com/.../image-b.jpg",
      "public_id": "cbrixi_products/image-b"
    },
    {
      "url": "https://res.cloudinary.com/.../image-a.jpg",
      "public_id": "cbrixi_products/image-a"
    }
  ],
  "thumbnail_index": 0
}
```

The response returns the updated product.
