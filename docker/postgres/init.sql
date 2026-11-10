\set ON_ERROR_STOP on

-- This script is mounted as /docker-entrypoint-initdb.d/01-init.sql.
-- docker-compose.yml must also mount ./database at
-- /docker-entrypoint-initdb.d/database (read-only).

CREATE EXTENSION IF NOT EXISTS postgis;

\i /docker-entrypoint-initdb.d/database/defence_gis.sql
\i /docker-entrypoint-initdb.d/database/migrations/V002__schema_fixes_and_geofencing.sql
\i /docker-entrypoint-initdb.d/database/migrations/V003__bcrypt_passwords_and_seed_data.sql
\i /docker-entrypoint-initdb.d/database/migrations/V004__demo_data_expansion.sql
\i /docker-entrypoint-initdb.d/database/migrations/V005__add_missing_geofence_fields.sql
\i /docker-entrypoint-initdb.d/database/migrations/V006__simulator_alert_types_and_geofence_alert_coordinates.sql

SELECT 'Defence GIS database initialization completed' AS status;
