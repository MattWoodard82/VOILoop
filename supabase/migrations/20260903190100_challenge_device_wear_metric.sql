-- Add device-wear consistency as a supported challenge metric type.
-- FR-13 (Issue #66) defines "device-wear consistency" as the % of days in a
-- trailing window with valid sleep+recovery data. This migration lets
-- challenges use that same signal (valid days with recovery_score AND
-- sleep_perf present in daily_wellness) instead of only counting workouts.
alter type challenge_metric_type add value if not exists 'device_wear_consistency';
