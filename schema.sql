CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_user_id UUID NOT NULL UNIQUE,
    firstname VARCHAR(100),
    lastname VARCHAR(100),
    email VARCHAR(150) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE / BLOCKED
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(15,2) NOT NULL,
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

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_default_events_processed ON default_events(processed);