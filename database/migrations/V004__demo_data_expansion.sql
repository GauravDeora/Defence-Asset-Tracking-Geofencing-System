-- ====================================================================
-- V004: Demo Data Expansion
-- Defence Asset Tracking & Geofencing System
-- ====================================================================

-- Expand allowed asset types to include fixed radar stations used in demo data.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS chk_asset_type;
ALTER TABLE assets
    ADD CONSTRAINT chk_asset_type
    CHECK (asset_type IN ('vehicle', 'tank', 'drone', 'person', 'vessel', 'equipment', 'radar_station'));

-- Upsert a realistic demo fleet of 15 assets.
INSERT INTO assets (asset_name, asset_type, asset_code, description, status)
VALUES
    ('Vehicle-01', 'vehicle', 'VH-001', 'Armoured mobility vehicle assigned to western patrol route.', 'active'),
    ('Vehicle-02', 'vehicle', 'VH-002', 'Supply convoy escort vehicle for logistics corridor.', 'active'),
    ('Drone-01', 'drone', 'DR-001', 'Short-range ISR drone for perimeter reconnaissance.', 'active'),
    ('Personnel-01', 'person', 'PR-001', 'Rapid response field operative.', 'active'),
    ('Tank-01', 'tank', 'TK-001', 'Tracked heavy armour unit guarding restricted approach.', 'active'),
    ('Vehicle-03', 'vehicle', 'VH-003', 'Quick reaction vehicle assigned to command perimeter.', 'active'),
    ('Vehicle-04', 'vehicle', 'VH-004', 'Communications relay van for live command feeds.', 'active'),
    ('Vehicle-05', 'vehicle', 'VH-005', 'Forward refuelling support truck.', 'active'),
    ('Drone-02', 'drone', 'DR-002', 'Medium-altitude surveillance drone for logistics belt.', 'active'),
    ('Drone-03', 'drone', 'DR-003', 'High-speed tactical scout drone.', 'active'),
    ('Personnel-02', 'person', 'PR-002', 'Foot patrol lead for safe assembly sector.', 'active'),
    ('Personnel-03', 'person', 'PR-003', 'Signals intelligence specialist.', 'active'),
    ('Tank-02', 'tank', 'TK-002', 'Reserve heavy armour near radar perimeter.', 'active'),
    ('Radar-Station-01', 'radar_station', 'RS-001', 'Fixed radar station covering northern approach.', 'active'),
    ('Radar-Station-02', 'radar_station', 'RS-002', 'Forward radar station monitoring eastern corridor.', 'active')
ON CONFLICT (asset_code) DO UPDATE SET
    asset_name = EXCLUDED.asset_name,
    asset_type = EXCLUDED.asset_type,
    description = EXCLUDED.description,
    status = EXCLUDED.status;

-- Remove alerts from previous runs of this demo dataset.
DELETE FROM alerts
WHERE triggered_at BETWEEN TIMESTAMP '2026-06-25 09:00:00'
                        AND TIMESTAMP '2026-06-25 10:00:00';

-- Refresh only the four named demo geofence zones.
DELETE FROM geofence_zones
WHERE zone_name IN (
    'Zone-Charlie-Command-Warning',
    'Zone-Delta-Logistics-Monitored',
    'Zone-Echo-Radar-Restricted',
    'Zone-Foxtrot-Assembly-Safe'
);

DELETE FROM asset_positions ap
USING assets a
WHERE ap.asset_id = a.id
  AND a.asset_code IN (
      'VH-001', 'VH-002', 'VH-003', 'VH-004', 'VH-005',
      'DR-001', 'DR-002', 'DR-003',
      'PR-001', 'PR-002', 'PR-003',
      'TK-001', 'TK-002',
      'RS-001', 'RS-002'
  )
  AND ap.recorded_at BETWEEN TIMESTAMP '2026-06-25 08:00:00' AND TIMESTAMP '2026-06-25 08:45:00';



-- Prevent duplicate automatic alerts during demo-data insertion.
ALTER TABLE asset_positions DISABLE TRIGGER trg_geofence_check;

-- Insert 60 GPS position records with valid foreign keys.
WITH asset_refs AS (
    SELECT asset_code, id
    FROM assets
    WHERE asset_code IN (
        'VH-001', 'VH-002', 'VH-003', 'VH-004', 'VH-005',
        'DR-001', 'DR-002', 'DR-003',
        'PR-001', 'PR-002', 'PR-003',
        'TK-001', 'TK-002',
        'RS-001', 'RS-002'
    )
)
INSERT INTO asset_positions (
    asset_id,
    geom,
    speed,
    heading,
    altitude,
    accuracy,
    recorded_at,
    received_at
)
SELECT
    a.id,
    ST_SetSRID(ST_Point(v.lng, v.lat), 4326),
    v.speed,
    v.heading,
    v.altitude,
    v.accuracy,
    v.recorded_at,
    v.received_at
FROM (
    VALUES
        ('VH-001', 73.0210, 26.2360, 42.0,  88.0, 320.0, 5.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('VH-001', 73.0243, 26.2389, 45.0,  90.0, 321.0, 5.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('VH-001', 73.0281, 26.2411, 47.0,  94.0, 322.0, 4.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('VH-001', 73.0315, 26.2440, 44.0, 100.0, 323.0, 4.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('VH-002', 73.0165, 26.2338, 38.0, 110.0, 318.0, 6.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('VH-002', 73.0198, 26.2361, 40.0, 112.0, 319.0, 6.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('VH-002', 73.0231, 26.2384, 41.0, 115.0, 320.0, 5.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('VH-002', 73.0266, 26.2408, 39.0, 120.0, 321.0, 5.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('VH-003', 73.0650, 26.2290, 34.0,  70.0, 316.0, 5.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('VH-003', 73.0685, 26.2322, 36.0,  75.0, 316.0, 5.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('VH-003', 73.0720, 26.2354, 37.0,  82.0, 317.0, 4.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('VH-003', 73.0758, 26.2386, 35.0,  90.0, 317.0, 4.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('VH-004', 73.0745, 26.2550, 28.0, 150.0, 312.0, 5.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('VH-004', 73.0780, 26.2578, 29.0, 152.0, 313.0, 5.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('VH-004', 73.0816, 26.2605, 31.0, 158.0, 314.0, 4.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('VH-004', 73.0850, 26.2630, 30.0, 160.0, 314.0, 4.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('VH-005', 73.0980, 26.2595, 33.0, 205.0, 315.0, 5.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('VH-005', 73.1012, 26.2620, 35.0, 208.0, 315.0, 5.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('VH-005', 73.1045, 26.2642, 34.0, 210.0, 316.0, 4.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('VH-005', 73.1080, 26.2665, 32.0, 214.0, 316.0, 4.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('DR-001', 73.0630, 26.2270, 72.0,  35.0, 880.0, 3.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:02'),
        ('DR-001', 73.0680, 26.2320, 76.0,  48.0, 900.0, 3.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:02'),
        ('DR-001', 73.0740, 26.2380, 79.0,  60.0, 920.0, 3.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:02'),
        ('DR-001', 73.0800, 26.2440, 82.0,  70.0, 940.0, 3.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:02'),

        ('DR-002', 73.0380, 26.2070, 68.0, 120.0, 860.0, 3.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:02'),
        ('DR-002', 73.0420, 26.2110, 70.0, 128.0, 875.0, 3.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:02'),
        ('DR-002', 73.0460, 26.2150, 71.0, 135.0, 890.0, 3.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:02'),
        ('DR-002', 73.0500, 26.2190, 69.0, 142.0, 905.0, 3.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:02'),

        ('DR-003', 73.0960, 26.2590, 88.0, 250.0, 980.0, 3.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:02'),
        ('DR-003', 73.1000, 26.2630, 92.0, 255.0, 995.0, 3.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:02'),
        ('DR-003', 73.1040, 26.2670, 95.0, 260.0, 1010.0, 3.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:02'),
        ('DR-003', 73.1080, 26.2710, 91.0, 265.0, 1020.0, 3.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:02'),

        ('PR-001', 73.0185, 26.2345, 5.0,   45.0,   0.0, 6.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:04'),
        ('PR-001', 73.0200, 26.2360, 5.5,   48.0,   0.0, 6.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:04'),
        ('PR-001', 73.0215, 26.2374, 5.2,   50.0,   0.0, 5.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:04'),
        ('PR-001', 73.0230, 26.2388, 5.0,   55.0,   0.0, 5.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('PR-002', 73.1150, 26.2290, 4.0,  310.0,   0.0, 7.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:04'),
        ('PR-002', 73.1180, 26.2320, 4.2,  315.0,   0.0, 7.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:04'),
        ('PR-002', 73.1210, 26.2350, 4.1,  320.0,   0.0, 6.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:04'),
        ('PR-002', 73.1240, 26.2380, 4.0,  325.0,   0.0, 6.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('PR-003', 73.0380, 26.2080, 4.5,  180.0,   0.0, 6.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:04'),
        ('PR-003', 73.0400, 26.2105, 4.6,  188.0,   0.0, 6.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:04'),
        ('PR-003', 73.0422, 26.2130, 4.7,  192.0,   0.0, 5.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:04'),
        ('PR-003', 73.0445, 26.2158, 4.4,  198.0,   0.0, 5.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:04'),

        ('TK-001', 73.0270, 26.2425, 22.0, 100.0, 330.0, 4.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('TK-001', 73.0290, 26.2440, 23.0, 102.0, 331.0, 4.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('TK-001', 73.0310, 26.2455, 24.0, 104.0, 332.0, 4.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('TK-001', 73.0330, 26.2470, 22.0, 108.0, 333.0, 4.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:03'),

        ('TK-002', 73.0985, 26.2605, 20.0, 230.0, 334.0, 4.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:03'),
        ('TK-002', 73.1010, 26.2630, 21.0, 232.0, 334.0, 4.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:03'),
        ('TK-002', 73.1035, 26.2655, 22.0, 235.0, 335.0, 4.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:03'),
        ('TK-002', 73.1060, 26.2680, 21.0, 238.0, 335.0, 4.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:03'),

        ('RS-001', 73.1090, 26.2700,  0.0,   0.0,  18.0, 2.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:05'),
        ('RS-001', 73.1090, 26.2700,  0.0,   0.0,  18.0, 2.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:05'),
        ('RS-001', 73.1090, 26.2700,  0.0,   0.0,  18.0, 2.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:05'),
        ('RS-001', 73.1090, 26.2700,  0.0,   0.0,  18.0, 2.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:05'),

        ('RS-002', 73.1160, 26.2640,  0.0,   0.0,  20.0, 2.0, TIMESTAMP '2026-06-25 08:00:00', TIMESTAMP '2026-06-25 08:00:05'),
        ('RS-002', 73.1160, 26.2640,  0.0,   0.0,  20.0, 2.0, TIMESTAMP '2026-06-25 08:10:00', TIMESTAMP '2026-06-25 08:10:05'),
        ('RS-002', 73.1160, 26.2640,  0.0,   0.0,  20.0, 2.0, TIMESTAMP '2026-06-25 08:20:00', TIMESTAMP '2026-06-25 08:20:05'),
        ('RS-002', 73.1160, 26.2640,  0.0,   0.0,  20.0, 2.0, TIMESTAMP '2026-06-25 08:30:00', TIMESTAMP '2026-06-25 08:30:05')
) AS v(asset_code, lng, lat, speed, heading, altitude, accuracy, recorded_at, received_at)
JOIN asset_refs a ON a.asset_code = v.asset_code;

-- Restore automatic geofence alerts for normal application operation.
ALTER TABLE asset_positions ENABLE TRIGGER trg_geofence_check;

-- Insert 10 demo alerts with valid foreign keys and geometry.
WITH asset_refs AS (
    SELECT asset_code, id
    FROM assets
    WHERE asset_code IN ('VH-001','VH-003','VH-005','DR-002','DR-003','PR-001','PR-003','TK-001','TK-002','RS-002')
),
zone_refs AS (
    SELECT zone_name, id
    FROM geofence_zones
    WHERE zone_name IN (
        'Zone-Alpha-Restricted',
        'Zone-Bravo-Safe',
        'Zone-Charlie-Command-Warning',
        'Zone-Delta-Logistics-Monitored',
        'Zone-Echo-Radar-Restricted'
    )
),
user_refs AS (
    SELECT username, id
    FROM users
    WHERE username IN ('drdo', 'admin')
)
INSERT INTO alerts (
    asset_id,
    zone_id,
    alert_type,
    severity,
    lat,
    lng,
    geom,
    acknowledged,
    ack_by,
    ack_at,
    triggered_at
)
SELECT
    a.id,
    z.id,
    d.alert_type,
    d.severity,
    d.lat,
    d.lng,
    ST_SetSRID(ST_Point(d.lng, d.lat), 4326),
    d.acknowledged,
    u.id,
    d.ack_at,
    d.triggered_at
FROM (
    VALUES
        ('VH-001', 'Zone-Alpha-Restricted',        'ENTER',   'HIGH',     26.2440, 73.0315, FALSE, NULL,      NULL,                          TIMESTAMP '2026-06-25 09:00:00'),
        ('TK-001', 'Zone-Alpha-Restricted',        'ENTER',   'CRITICAL', 26.2470, 73.0330, FALSE, NULL,      NULL,                          TIMESTAMP '2026-06-25 09:05:00'),
        ('DR-003', 'Zone-Charlie-Command-Warning', 'SPEED',   'MEDIUM',   26.2670, 73.1040, TRUE,  'drdo',    TIMESTAMP '2026-06-25 09:17:00', TIMESTAMP '2026-06-25 09:10:00'),
        ('PR-001', 'Zone-Alpha-Restricted',        'EXIT',    'LOW',      26.2388, 73.0230, TRUE,  'admin',   TIMESTAMP '2026-06-25 09:22:00', TIMESTAMP '2026-06-25 09:15:00'),
        ('RS-002', 'Zone-Echo-Radar-Restricted',   'OFFLINE', 'HIGH',     26.2640, 73.1160, FALSE, NULL,      NULL,                          TIMESTAMP '2026-06-25 09:20:00'),
        ('DR-002', 'Zone-Charlie-Command-Warning', 'SOS',     'CRITICAL', 26.2150, 73.0460, FALSE, NULL,      NULL,                          TIMESTAMP '2026-06-25 09:25:00'),
        ('VH-005', 'Zone-Echo-Radar-Restricted',   'ENTER',   'HIGH',     26.2665, 73.1080, FALSE, NULL,      NULL,                          TIMESTAMP '2026-06-25 09:30:00'),
        ('PR-003', 'Zone-Delta-Logistics-Monitored','EXIT',   'LOW',      26.2158, 73.0445, TRUE,  'drdo',    TIMESTAMP '2026-06-25 09:37:00', TIMESTAMP '2026-06-25 09:35:00'),
        ('TK-002', 'Zone-Echo-Radar-Restricted',   'SPEED',   'HIGH',     26.2680, 73.1060, FALSE, NULL,      NULL,                          TIMESTAMP '2026-06-25 09:40:00'),
        ('VH-003', 'Zone-Bravo-Safe',              'OFFLINE', 'MEDIUM',   26.2386, 73.0758, TRUE,  'admin',   TIMESTAMP '2026-06-25 09:52:00', TIMESTAMP '2026-06-25 09:45:00')
) AS d(asset_code, zone_name, alert_type, severity, lat, lng, acknowledged, ack_user, ack_at, triggered_at)
JOIN asset_refs a ON a.asset_code = d.asset_code
JOIN zone_refs z ON z.zone_name = d.zone_name
LEFT JOIN user_refs u ON u.username = d.ack_user;

-- Verification snapshot for the expanded demo dataset.
SELECT COUNT(*) AS total_assets FROM assets;
SELECT COUNT(*) AS total_geofence_zones FROM geofence_zones;
SELECT COUNT(*) AS total_asset_positions FROM asset_positions;
SELECT COUNT(*) AS total_alerts FROM alerts;
