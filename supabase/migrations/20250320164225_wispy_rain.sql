/*
  # Initial Schema for Maintenance Management System

  1. New Tables
    - `equipment_hierarchy` - Stores the equipment tree structure
      - `id` (uuid, primary key)
      - `name` (text)
      - `type` (text) - Planta, Area, Linha, etc.
      - `parent_id` (uuid, self-referential foreign key)
      - `created_at` (timestamp)

    - `maintenance_tags` - Stores maintenance request tags
      - `id` (uuid, primary key)
      - `tag_number` (text, unique)
      - `date` (timestamp)
      - `requester` (text)
      - `equipment_id` (uuid, references equipment_hierarchy)
      - `criticality` (text) - A, B, C
      - `status` (text) - Pendente, Programada, Confirmada
      - `created_at` (timestamp)

    - `maintenance_orders` - Stores maintenance work orders
      - `id` (uuid, primary key)
      - `order_number` (text, unique)
      - `tag_id` (uuid, references maintenance_tags)
      - `executor` (text)
      - `description` (text)
      - `execution_date` (timestamp)
      - `execution_description` (text)
      - `created_at` (timestamp)

    - `order_materials` - Stores materials needed for maintenance orders
      - `id` (uuid, primary key)
      - `order_id` (uuid, references maintenance_orders)
      - `material_name` (text)
      - `quantity` (numeric)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Equipment Hierarchy
CREATE TABLE equipment_hierarchy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('Planta', 'Area', 'Linha', 'Maquina', 'Conjunto', 'Equipamento', 'Componente')),
  parent_id uuid REFERENCES equipment_hierarchy(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE equipment_hierarchy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to authenticated users"
  ON equipment_hierarchy
  FOR ALL
  TO authenticated
  USING (true);

-- Maintenance Tags
CREATE TABLE maintenance_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_number text UNIQUE NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  requester text NOT NULL,
  equipment_id uuid REFERENCES equipment_hierarchy(id) NOT NULL,
  criticality text NOT NULL CHECK (criticality IN ('A', 'B', 'C')),
  status text NOT NULL CHECK (status IN ('Pendente', 'Programada', 'Confirmada')) DEFAULT 'Pendente',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE maintenance_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to authenticated users"
  ON maintenance_tags
  FOR ALL
  TO authenticated
  USING (true);

-- Maintenance Orders
CREATE TABLE maintenance_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  tag_id uuid REFERENCES maintenance_tags(id) NOT NULL,
  executor text NOT NULL,
  description text NOT NULL,
  execution_date timestamptz,
  execution_description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE maintenance_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to authenticated users"
  ON maintenance_orders
  FOR ALL
  TO authenticated
  USING (true);

-- Order Materials
CREATE TABLE order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES maintenance_orders(id) NOT NULL,
  material_name text NOT NULL,
  quantity numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to authenticated users"
  ON order_materials
  FOR ALL
  TO authenticated
  USING (true);

-- Create function to check materials count
CREATE OR REPLACE FUNCTION check_materials_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM order_materials
    WHERE order_id = NEW.order_id
  ) > 10 THEN
    RAISE EXCEPTION 'Maximum of 10 materials per order exceeded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce materials limit
CREATE TRIGGER enforce_materials_limit
  BEFORE INSERT OR UPDATE ON order_materials
  FOR EACH ROW
  EXECUTE FUNCTION check_materials_limit();

-- Create indexes for better performance
CREATE INDEX idx_equipment_hierarchy_parent_id ON equipment_hierarchy(parent_id);
CREATE INDEX idx_maintenance_tags_equipment_id ON maintenance_tags(equipment_id);
CREATE INDEX idx_maintenance_orders_tag_id ON maintenance_orders(tag_id);
CREATE INDEX idx_order_materials_order_id ON order_materials(order_id);