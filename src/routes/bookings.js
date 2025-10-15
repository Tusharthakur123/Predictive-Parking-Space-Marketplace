const express = require('express');
const db = require('../db');
const Redis = require('ioredis');
const Redlock = require('redlock');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const redis = new Redis(process.env.REDIS_URL);
const redlock = new Redlock([redis], { driftFactor: 0.01 });

const HOLD_SECONDS = parseInt(process.env.RESERVATION_HOLD_SECONDS || '900', 10);

// middleware to fake-auth (replace with real JWT auth)
async function fakeAuth(req,res,next){
  // in prod decode JWT and set req.userId
  req.userId = req.headers['x-user-id'] || null;
  next();
}
router.use(fakeAuth);

// POST /api/bookings
router.post('/', async (req, res) => {
  const { lot_id, start_time, end_time } = req.body;
  const userId = req.userId || null;
  if (!userId) return res.status(401).json({ error: 'unauthenticated (use header x-user-id in dev)' });

  const timeslotKey = `lock:lot:${lot_id}:start:${start_time}:end:${end_time}`;
  let lock;
  try {
    lock = await redlock.acquire([timeslotKey], 2000); // 2s TTL for lock
  } catch (err) {
    return res.status(423).json({ error: 'could not acquire lock, try again' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Check capacity vs overlapping bookings
    const checkQ = `
      SELECT capacity,
        (SELECT COUNT(*) FROM bookings b WHERE b.lot_id = pl.id AND b.status IN ('CONFIRMED','PENDING')
         AND NOT (b.end_time <= $2 OR b.start_time >= $1)
        ) as reserved_count
      FROM parking_lots pl
      WHERE pl.id = $3
      FOR UPDATE
    `;
    const r = await client.query(checkQ, [start_time, end_time, lot_id]);
    if (r.rows.length === 0) {
      await client.query('ROLLBACK');
      await lock.release();
      return res.status(404).json({ error: 'lot not found' });
    }
    const { capacity, reserved_count } = r.rows[0];
    if (parseInt(reserved_count,10) >= capacity) {
      await client.query('ROLLBACK');
      await lock.release();
      return res.status(409).json({ error: 'no slots available' });
    }

    // Insert booking with status PENDING (simulate payment hold later)
    const bookingId = uuidv4();
    const insertQ = `
      INSERT INTO bookings (id, user_id, lot_id, start_time, end_time, status, price)
      VALUES ($1,$2,$3,$4,$5,'PENDING', 0) RETURNING *
    `;
    const ins = await client.query(insertQ, [bookingId, userId, lot_id, start_time, end_time]);
    await client.query('COMMIT');

    // Set a Redis key to automatically expire/cleanup pending bookings after HOLD_SECONDS
    await redis.set(`booking_hold:${bookingId}`, 'PENDING', 'EX', HOLD_SECONDS);

    await lock.release();
    res.json({ booking: ins.rows[0], hold_seconds: HOLD_SECONDS });
  } catch (err) {
    await client.query('ROLLBACK');
    try { await lock.release(); } catch(e){/* ignore */}
    console.error(err);
    res.status(500).json({ error: 'internal' });
  } finally {
    client.release();
  }
});

module.exports = router;
