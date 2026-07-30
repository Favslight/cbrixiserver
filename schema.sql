CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_user_id UUID UNIQUE,
    firstname VARCHAR(100),
    lastname VARCHAR(100),
    username VARCHAR(100) UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    cbrilliance_email VARCHAR(150),
    cbrilliance_email_verified BOOLEAN DEFAULT FALSE,
    cbrilliance_email_verified_at TIMESTAMP,
    referral_code VARCHAR(32),
    referred_by_user_id UUID REFERENCES users(id),
    referral_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE / BLOCKED
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(255),
    price NUMERIC(15,2) NOT NULL,
    discount_enabled BOOLEAN DEFAULT FALSE,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    discounted_price NUMERIC(15,2),
    specifications JSONB DEFAULT '[]'::JSONB,
    image_url TEXT,
    image_public_id TEXT,
    image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    image_public_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    installment_enabled BOOLEAN DEFAULT FALSE,
    minimum_deposit_percentage INTEGER DEFAULT 50,
    installment_duration_months INTEGER,
    in_stock BOOLEAN DEFAULT TRUE,
    display_order INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    specs JSONB DEFAULT '{}'::JSONB,
    sku VARCHAR(120),
    price NUMERIC(15,2) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    total_amount NUMERIC(15,2) NOT NULL,
    deposit_amount NUMERIC(15,2),
    remaining_balance NUMERIC(15,2),
    payment_mode VARCHAR(20) NOT NULL, -- FULL / INSTALLMENT
    status VARCHAR(30) NOT NULL, 
    external_email VARCHAR(150),
    installment_end_date TIMESTAMP,
    defaulted_at TIMESTAMP,
    fine_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity INTEGER NOT NULL,
    price_at_purchase NUMERIC(15,2) NOT NULL,
    product_name_snapshot VARCHAR(255),
    variant_name_snapshot VARCHAR(255),
    variant_specs_snapshot JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    due_date TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING / PAID / MISSED
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    installment_id UUID REFERENCES installments(id),
    user_id UUID REFERENCES users(id),
    amount NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL, -- WALLET / BANK
    reference VARCHAR(255),
    status VARCHAR(20) NOT NULL, -- SUCCESS / FAILED / PENDING
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE default_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE,
    user_id UUID,
    remaining_balance NUMERIC(15,2),
    fine_amount NUMERIC(15,2),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    order_id UUID,
    installment_id UUID,
    email_type VARCHAR(50),
    sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    api_key VARCHAR UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_sales_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_app_id UUID NOT NULL REFERENCES partner_apps(id),
    external_order_id VARCHAR NOT NULL,
    invoice_number VARCHAR,
    customer_name VARCHAR,
    customer_email VARCHAR,
    customer_phone VARCHAR,
    delivery_address TEXT,
    payment_status VARCHAR,
    order_status VARCHAR,
    total_amount NUMERIC(12,2),
    raw_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(partner_app_id, external_order_id)
);

CREATE TABLE IF NOT EXISTS partner_sales_record_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_record_id UUID NOT NULL REFERENCES partner_sales_records(id) ON DELETE CASCADE,
    product_id UUID,
    product_name_snapshot VARCHAR,
    unit_price_snapshot NUMERIC(12,2),
    quantity INT,
    total_price NUMERIC(12,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_enabled BOOLEAN DEFAULT FALSE,
    bonus_percentage NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referred_user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    payment_transaction_id UUID NOT NULL UNIQUE REFERENCES payment_transactions(id),
    purchase_amount NUMERIC(15,2) NOT NULL,
    bonus_percentage NUMERIC(5,2) NOT NULL,
    reward_amount NUMERIC(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'AVAILABLE',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(15,2) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    admin_id UUID,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE referral_rewards
ADD COLUMN IF NOT EXISTS payout_request_id UUID REFERENCES referral_payout_requests(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL DEFAULT 'USER',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(80) NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_external_email ON orders(external_email);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_one_default
ON product_variants(product_id)
WHERE is_default = TRUE;
CREATE INDEX idx_users_cbrilliance_email ON users(LOWER(cbrilliance_email)) WHERE cbrilliance_email IS NOT NULL;
CREATE INDEX idx_users_reset_token ON users(reset_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id ON users(referred_by_user_id);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_default_events_processed ON default_events(processed);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred_user_id ON referral_rewards(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_referral_payout_requests_user_id ON referral_payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_payout_requests_status ON referral_payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_type ON notifications(target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(target_type, user_id, is_read)
WHERE deleted_at IS NULL;

ALTER TABLE users
ALTER COLUMN external_user_id DROP NOT NULL,
ADD COLUMN IF NOT EXISTS username VARCHAR(100),
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP,
ADD COLUMN IF NOT EXISTS cbrilliance_email VARCHAR(150),
ADD COLUMN IF NOT EXISTS cbrilliance_email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cbrilliance_email_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32),
ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
ON users(username)
WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_reset_token
ON users(reset_token);

CREATE INDEX IF NOT EXISTS idx_users_cbrilliance_email
ON users(LOWER(cbrilliance_email))
WHERE cbrilliance_email IS NOT NULL;

UPDATE users
SET referral_code = UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 10))
WHERE referral_code IS NULL OR referral_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
ON users(referral_code)
WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id
ON users(referred_by_user_id);

INSERT INTO referral_settings (id, is_enabled, bonus_percentage)
VALUES (1, FALSE, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS category VARCHAR(255),
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_public_id TEXT,
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS image_public_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS discount_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discounted_price NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS installment_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS minimum_deposit_percentage INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS installment_duration_months INTEGER,
ADD COLUMN IF NOT EXISTS display_order INTEGER;

UPDATE products
SET
    discount_enabled = COALESCE(discount_enabled, FALSE),
    discount_percentage = CASE
        WHEN COALESCE(discount_enabled, FALSE) THEN COALESCE(discount_percentage, 0)
        ELSE 0
    END,
    discount_amount = CASE
        WHEN COALESCE(discount_enabled, FALSE) THEN ROUND((price * COALESCE(discount_percentage, 0)) / 100, 2)
        ELSE 0
    END,
    discounted_price = CASE
        WHEN COALESCE(discount_enabled, FALSE) THEN GREATEST(ROUND(price - ((price * COALESCE(discount_percentage, 0)) / 100), 2), 0)
        ELSE price
    END
WHERE discounted_price IS NULL
   OR discount_amount IS NULL
   OR discount_percentage IS NULL
   OR discount_enabled IS NULL;

UPDATE products
SET specifications = '[]'::JSONB
WHERE specifications IS NULL;

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    specs JSONB DEFAULT '{}'::JSONB,
    sku VARCHAR(120),
    price NUMERIC(15,2) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS sku VARCHAR(120),
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

INSERT INTO product_variants (product_id, name, specs, price, is_default, sort_order)
SELECT p.id, 'Default', '{}'::JSONB, p.price, TRUE, 0
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id
);

ALTER TABLE products
DROP COLUMN IF EXISTS fine_percentage_on_default,
DROP COLUMN IF EXISTS minimum_wallet_balance_required,
DROP COLUMN IF EXISTS grace_period_days;

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
ON product_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_products_display_order
ON products(display_order ASC, created_at DESC)
WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_one_default
ON product_variants(product_id)
WHERE is_default = TRUE;

ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);

UPDATE cart_items ci
SET variant_id = pv.id
FROM product_variants pv
WHERE ci.product_id = pv.product_id
  AND pv.is_default = TRUE
  AND ci.variant_id IS NULL;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id),
ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(255),
ADD COLUMN IF NOT EXISTS variant_name_snapshot VARCHAR(255),
ADD COLUMN IF NOT EXISTS variant_specs_snapshot JSONB DEFAULT '{}'::JSONB;

UPDATE order_items oi
SET
    variant_id = COALESCE(oi.variant_id, pv.id),
    product_name_snapshot = COALESCE(oi.product_name_snapshot, p.name),
    variant_name_snapshot = COALESCE(oi.variant_name_snapshot, pv.name),
    variant_specs_snapshot = COALESCE(oi.variant_specs_snapshot, pv.specs, '{}'::JSONB)
FROM products p
LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = TRUE
WHERE oi.product_id = p.id;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS external_email VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_orders_external_email ON orders(external_email);

-- Campaign & Announcement System
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    campaign_type VARCHAR(30) NOT NULL,
    placement VARCHAR(30) NOT NULL,
    media_url TEXT,
    thumbnail_url TEXT,
    media_public_id TEXT,
    thumbnail_public_id TEXT,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    popup_delay_seconds INTEGER NOT NULL DEFAULT 0,
    display_duration_seconds INTEGER NOT NULL DEFAULT 15,
    allow_skip_after_seconds INTEGER NOT NULL DEFAULT 5,
    priority INTEGER NOT NULL DEFAULT 0,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT campaigns_type_check CHECK (
        campaign_type IN ('IMAGE', 'VIDEO', 'TEXT', 'PROMOTED_PRODUCT')
    ),
    CONSTRAINT campaigns_placement_check CHECK (
        placement IN (
            'LANDING_POPUP',
            'HERO_BANNER',
            'TOP_BANNER',
            'BOTTOM_BANNER',
            'CATEGORY_PAGE',
            'PRODUCT_PAGE',
            'SIDEBAR',
            'FOOTER'
        )
    ),
    CONSTRAINT campaigns_dates_check CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS campaign_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255) NOT NULL,
    viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_active_dates
ON campaigns(is_active, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_campaigns_placement_priority
ON campaigns(placement, priority DESC);

CREATE INDEX IF NOT EXISTS idx_campaigns_product_id
ON campaigns(product_id);

CREATE INDEX IF NOT EXISTS idx_campaign_views_campaign_id
ON campaign_views(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_views_viewed_at
ON campaign_views(viewed_at DESC);

CREATE TABLE IF NOT EXISTS hero_carousel_slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eyebrow VARCHAR(120),
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    description TEXT,
    image_url TEXT NOT NULL,
    image_public_id TEXT,
    mobile_image_url TEXT,
    mobile_image_public_id TEXT,
    alt_text VARCHAR(255),
    link_url TEXT,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    badge_text VARCHAR(120),
    accent_color VARCHAR(40),
    text_position VARCHAR(10) NOT NULL DEFAULT 'LEFT',
    display_order INTEGER NOT NULL DEFAULT 0,
    autoplay_seconds INTEGER NOT NULL DEFAULT 6,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT hero_carousel_text_position_check CHECK (text_position IN ('LEFT', 'CENTER', 'RIGHT')),
    CONSTRAINT hero_carousel_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT hero_carousel_autoplay_check CHECK (autoplay_seconds > 0)
);

CREATE INDEX IF NOT EXISTS idx_hero_carousel_active_dates
ON hero_carousel_slides(is_active, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_hero_carousel_order
ON hero_carousel_slides(display_order ASC, created_at DESC);

-- Receipt Management System
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(64) NOT NULL UNIQUE,
    invoice_number VARCHAR(255) NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL UNIQUE REFERENCES payment_transactions(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id),
    amount_paid NUMERIC(15,2) NOT NULL,
    remaining_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    order_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    delivery_fee NUMERIC(15,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL,
    generated_by UUID,
    generated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15,2) NOT NULL,
    subtotal NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_number_counters (
    day_key VARCHAR(8) PRIMARY KEY,
    last_value INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_receipts_order_id ON receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice_number ON receipts(invoice_number);
CREATE INDEX IF NOT EXISTS idx_receipts_generated_at ON receipts(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
