-- Defence GIS base schema
-- This file must run before migrations V002 through V006.
-- PostGIS is enabled by docker/postgres/init.sql or setup_database.ps1.

CREATE TABLE users (
    id           SERIAL PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name    VARCHAR(100),
    role         VARCHAR(20),
    email        VARCHAR(100) UNIQUE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    last_login   TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE assets (
    id          SERIAL PRIMARY KEY,
    asset_name  VARCHAR(100) NOT NULL,
    asset_type  VARCHAR(50)  NOT NULL,
    asset_code  VARCHAR(30)  NOT NULL UNIQUE,
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_positions (
    id          SERIAL PRIMARY KEY,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    geom        geometry(Point, 4326) NOT NULL,
    speed       DOUBLE PRECISION NOT NULL DEFAULT 0,
    heading     DOUBLE PRECISION NOT NULL DEFAULT 0,
    altitude    DOUBLE PRECISION NOT NULL DEFAULT 0,
    accuracy    DOUBLE PRECISION NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE geofence_zones (
    id          SERIAL PRIMARY KEY,
    zone_name   VARCHAR(100) NOT NULL UNIQUE,
    zone_type   VARCHAR(20) NOT NULL,
    description TEXT,
    color       VARCHAR(10) DEFAULT '#3388ff',
    geom        geometry(Polygon, 4326) NOT NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE alerts (
    id           SERIAL PRIMARY KEY,
    asset_id     INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    zone_id      INTEGER NOT NULL REFERENCES geofence_zones(id) ON DELETE RESTRICT,
    alert_type   VARCHAR(20) NOT NULL,
    severity     VARCHAR(20) NOT NULL,
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    ack_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ack_at       TIMESTAMP,
    triggered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    geom         geometry(Point, 4326)
);

-- TrackDAO reads the scalar summary fields. The documented path column
-- is retained for route geometry and future route rendering.
CREATE TABLE track_history (
    id         SERIAL PRIMARY KEY,
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    path       geometry(LineString, 4326),
    started_at TIMESTAMP NOT NULL,
    ended_at   TIMESTAMP,
    distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_speed  DOUBLE PRECISION NOT NULL DEFAULT 0,
    point_count INTEGER NOT NULL DEFAULT 0
);

-- Stable seed IDs are required because V003 inserts sample positions for
-- asset IDs 1, 2 and 3.
INSERT INTO assets (id, asset_name, asset_type, asset_code, description, status)
VALUES
    (1, 'Vehicle-01', 'vehicle', 'VH-001', 'Initial demo patrol vehicle.', 'active'),
    (2, 'Vehicle-02', 'vehicle', 'VH-002', 'Initial demo logistics vehicle.', 'active'),
    (3, 'Drone-01',   'drone',   'DR-001', 'Initial demo surveillance drone.', 'active');

SELECT setval(pg_get_serial_sequence('assets', 'id'),
              (SELECT MAX(id) FROM assets), TRUE);

-- V004 expects these two zones to exist when it inserts its demo alerts.
-- created_by is intentionally NULL; V003 creates users after this schema.
INSERT INTO geofence_zones
    (zone_name, zone_type, description, color, geom, created_by, is_active)
VALUES
(
    'Zone-Alpha-Restricted',
    'restricted',
    'Initial restricted demo perimeter.',
    '#D32F2F',
    ST_SetSRID(ST_GeomFromText(
        'POLYGON((73.028 26.241, 73.040 26.241, 73.040 26.253, 73.028 26.253, 73.028 26.241))'
    ), 4326),
    NULL,
    TRUE
),
(
    'Zone-Bravo-Safe',
    'safe',
    'Initial safe demo perimeter.',
    '#4CAF50',
    ST_SetSRID(ST_GeomFromText(
        'POLYGON((73.060 26.225, 73.083 26.225, 73.083 26.245, 73.060 26.245, 73.060 26.225))'
    ), 4326),
    NULL,
    TRUE
);

-- Spatial and lookup indexes used by the application.
CREATE INDEX idx_positions_geom ON asset_positions USING GIST (geom);
CREATE INDEX idx_positions_asset_time ON asset_positions (asset_id, recorded_at DESC);
CREATE INDEX idx_zones_geom ON geofence_zones USING GIST (geom);
CREATE INDEX idx_alerts_unack ON alerts (acknowledged) WHERE acknowledged = FALSE;
CREATE INDEX idx_alerts_asset_zone_type ON alerts (asset_id, zone_id, alert_type);
CREATE INDEX idx_track_geom ON track_history USING GIST (path);
CREATE INDEX idx_track_asset ON track_history (asset_id, started_at DESC);
