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
    image_url TEXT,
    image_public_id TEXT,
    image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    image_public_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    stock INTEGER DEFAULT 0,
    installment_enabled BOOLEAN DEFAULT FALSE,
    minimum_deposit_percentage INTEGER DEFAULT 50,
    installment_duration_months INTEGER,
    fine_percentage_on_default INTEGER DEFAULT 0,
    minimum_wallet_balance_required NUMERIC(15,2) DEFAULT 0,
    grace_period_days INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
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
    quantity INTEGER NOT NULL,
    price_at_purchase NUMERIC(15,2) NOT NULL,
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

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_external_email ON orders(external_email);
CREATE INDEX idx_users_reset_token ON users(reset_token);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_default_events_processed ON default_events(processed);

ALTER TABLE users
ALTER COLUMN external_user_id DROP NOT NULL,
ADD COLUMN IF NOT EXISTS username VARCHAR(100),
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
ON users(username)
WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_reset_token
ON users(reset_token);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS category VARCHAR(255),
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_public_id TEXT,
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS image_public_ids TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS external_email VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_orders_external_email ON orders(external_email);
