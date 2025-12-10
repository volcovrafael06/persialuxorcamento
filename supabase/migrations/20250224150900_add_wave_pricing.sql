-- Create table for rail pricing configurations
CREATE TABLE IF NOT EXISTS rail_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rail_type VARCHAR NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial pricing configurations
INSERT INTO rail_pricing (rail_type, cost_price, sale_price) VALUES
('trilho_redondo_comando', 0.00, 0.00),      -- Trilho redondo com comando
('trilho_slim_comando', 0.00, 0.00),         -- Trilho Slim com comando
('trilho_quadrado_gancho', 0.00, 0.00),      -- Trilho quadrado com rodizio em gancho
('trilho_redondo_sem_comando', 0.00, 0.00),  -- Trilho redondo sem comando
('trilho_slim_sem_comando', 0.00, 0.00),     -- Trilho Slim sem comando
('trilho_motorizado', 0.00, 0.00);           -- Trilho Motorizado

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_rail_pricing_updated_at ON rail_pricing;

-- Create or replace function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_rail_pricing_updated_at
    BEFORE UPDATE ON rail_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
