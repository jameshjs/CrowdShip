-- "Circle an area" feedback: the outline a participant drew, in page pixels.
-- Shape: { x, y, w, h, pageW, pageH, points: [[x, y], ...] } (validated by the API).
alter table feedback add column region jsonb
  check (region is null or (jsonb_typeof(region) = 'object' and pg_column_size(region) <= 4096));
