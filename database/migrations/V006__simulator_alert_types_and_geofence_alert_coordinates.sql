-- V006: Align alert constraints and trigger-generated alert coordinates
-- with the event types and fields used by the Java simulator.

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS chk_alert_type;
ALTER TABLE alerts
    ADD CONSTRAINT chk_alert_type
    CHECK (alert_type IN (
        'ENTER', 'EXIT', 'SOS', 'SPEED', 'OFFLINE', 'BATTERY', 'UNAUTHORIZED'
    ));

-- Backfill coordinates for any rows created by the original V002 trigger,
-- which populated geom but did not populate lat/lng.
UPDATE alerts
SET lat = ST_Y(geom),
    lng = ST_X(geom)
WHERE geom IS NOT NULL
  AND (lat IS NULL OR lng IS NULL);

-- Keep the database trigger, but populate the scalar coordinates expected
-- by AlertDAO as well as the PostGIS geometry column.
CREATE OR REPLACE FUNCTION trigger_geofence_check()
RETURNS TRIGGER AS $$
DECLARE
    breach RECORD;
BEGIN
    FOR breach IN
        SELECT gz.id AS zone_id, gz.zone_name, gz.zone_type
        FROM geofence_zones gz
        WHERE gz.is_active = TRUE
          AND gz.zone_type = 'restricted'
          AND ST_Contains(gz.geom, NEW.geom)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM alerts
            WHERE asset_id = NEW.asset_id
              AND zone_id = breach.zone_id
              AND alert_type = 'ENTER'
              AND acknowledged = FALSE
        ) THEN
            INSERT INTO alerts (
                asset_id, zone_id, alert_type, severity, lat, lng, geom
            )
            VALUES (
                NEW.asset_id,
                breach.zone_id,
                'ENTER',
                'HIGH',
                ST_Y(NEW.geom),
                ST_X(NEW.geom),
                NEW.geom
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
