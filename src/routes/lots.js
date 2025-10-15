const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/lots?lat=&lng=&radius_km=
router.get('/', async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  // simple bounding box search (placeholder): return all lots for MVP
  const r = await db.query('SELECT id, name, lat, lng, capacity, address FROM parking_lots LIMIT 200');
  res.json(r.rows);
});

// GET /api/lots/:id/availability?start=&end=
router.get('/:id/availability', async (req, res) => {
  const lotId = req.params.id;
  const { start, end } = req.query; // ISO strings expected
  // For MVP we check bookings overlapping and return available slots = capacity - booked_count
  const q = `
    SELECT pl.capacity,
      (SELECT COUNT(*) FROM bookings b WHERE b.lot_id = pl.id AND b.status IN ('CONFIRMED','PENDING')
       AND NOT (b.end_time <= $2 OR b.start_time >= $1)
      ) as reserved_count
    FROM parking_lots pl
    WHERE pl.id = $3
  `;
  const r = await db.query(q, [start, end, lotId]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const { capacity, reserved_count } = r.rows[0];
  const available = capacity - parseInt(reserved_count, 10);
  res.json({ capacity, reserved_count: parseInt(reserved_count,10), available: Math.max(0, available) });
});

module.exports = router;
