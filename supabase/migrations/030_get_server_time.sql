-- ============================================================
-- 030_get_server_time.sql
-- Expose server time to clients for clock synchronization
-- ============================================================

CREATE OR REPLACE FUNCTION get_server_time()
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN NOW();
END;
$$;
GRANT EXECUTE ON FUNCTION get_server_time() TO anon, authenticated, service_role;
