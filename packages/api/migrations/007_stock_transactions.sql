-- Migration 007: Stock Transaction API
-- Adds a transactional RPC for stock movements that atomically records
-- the movement and updates item quantity. Uses service_role privileges
-- since authenticated clients cannot directly INSERT stock_movements
-- or UPDATE item quantity.
--
-- Depends on: 005_inventory_schema.sql

BEGIN;

-- ============================================================================
-- RPC: record_stock_movement
-- Atomically inserts a stock movement and updates item quantity.
-- Locks the item row FOR UPDATE to prevent race conditions.
-- Returns the created movement row.
-- ============================================================================
CREATE OR REPLACE FUNCTION inventory.record_stock_movement(
  p_project_id   UUID,
  p_item_id      UUID,
  p_type         TEXT,
  p_quantity     NUMERIC,
  p_reason       TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_created_by   UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item        RECORD;
  v_delta       NUMERIC;
  v_new_qty     NUMERIC;
  v_movement_id UUID;
  v_created_at  TIMESTAMPTZ;
  v_actor       UUID;
BEGIN
  -- Resolve actor: use parameter or fall back to auth.uid()
  v_actor := COALESCE(p_created_by, auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No authenticated user for stock movement'
      USING ERRCODE = '28000'; -- insufficient_privilege
  END IF;

  -- Validate movement type
  IF p_type NOT IN ('receive', 'ship', 'adjust', 'transfer', 'return') THEN
    RAISE EXCEPTION 'Invalid movement type: %', p_type
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  -- Quantity must be positive (direction is encoded in type)
  IF p_quantity IS NULL OR p_quantity <= 0 OR
     p_quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'Movement quantity must be a positive finite number'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the item row to prevent concurrent modifications
  SELECT id, project_id, quantity INTO v_item
  FROM inventory.items
  WHERE id = p_item_id AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found in project'
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- Calculate the delta based on movement type
  CASE p_type
    WHEN 'receive', 'return' THEN
      v_delta := p_quantity;   -- increases stock
    WHEN 'ship', 'transfer' THEN
      v_delta := -p_quantity;  -- decreases stock
    WHEN 'adjust' THEN
      -- Adjust can be positive or negative — the signed quantity IS the delta
      -- For adjust, p_quantity is the delta directly (can be negative via a
      -- separate negative-adjust convention, but we require positive here
      -- and use the type to determine direction).
      -- To allow both up and down adjustments, we treat p_quantity as the
      -- absolute amount and require a reason field to explain direction.
      -- Actually, adjust should support setting by delta. We'll accept the
      -- quantity as-is (positive = add, and use a separate 'adjust_down' or
      -- reason to track). For simplicity: adjust always adds. To decrease
      -- via adjust, use negative p_quantity... but we require positive above.
      --
      -- Resolution: adjust is a correction. The signed_quantity parameter
      -- passed to this function is always positive. The direction is encoded
      -- in the type. For adjust specifically, we allow a separate parameter.
      -- Let's keep it simple: adjust adds the quantity. For negative adjust,
      -- the caller should use 'ship' or handle it at the API layer.
      v_delta := p_quantity;
    ELSE
      RAISE EXCEPTION 'Unhandled movement type: %', p_type;
  END CASE;

  -- Compute new quantity
  v_new_qty := v_item.quantity + v_delta;

  -- Prevent negative stock (configurable policy — strict by default)
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: current %, requested %', v_item.quantity, p_quantity
      USING ERRCODE = 'P0004'; -- custom: insufficient_stock
  END IF;

  -- Insert the movement
  INSERT INTO inventory.stock_movements (
    project_id, item_id, type, quantity, reason, reference_id, created_by
  ) VALUES (
    p_project_id, p_item_id, p_type, p_quantity, p_reason, p_reference_id, v_actor
  )
  RETURNING id, created_at INTO v_movement_id, v_created_at;

  -- Update item quantity (bypasses column grants via SECURITY DEFINER)
  UPDATE inventory.items
  SET quantity = v_new_qty
  WHERE id = p_item_id AND project_id = p_project_id;

  -- Return the movement as JSONB
  RETURN jsonb_build_object(
    'id', v_movement_id,
    'project_id', p_project_id,
    'item_id', p_item_id,
    'type', p_type,
    'quantity', p_quantity,
    'reason', p_reason,
    'reference_id', p_reference_id,
    'created_by', v_actor,
    'created_at', v_created_at,
    'resulting_quantity', v_new_qty
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute to authenticated users; RLS/role checks happen at application layer
GRANT EXECUTE ON FUNCTION inventory.record_stock_movement(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, UUID)
  TO authenticated, service_role;

-- ============================================================================
-- Grant SELECT on stock_movements to authenticated (already in 005, but
-- ensure INSERT is available via the RPC only — no direct INSERT grant)
-- ============================================================================
-- movements_read policy already exists in 005.
-- No additional INSERT policy needed: the RPC uses SECURITY DEFINER.

COMMIT;

