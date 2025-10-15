const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const q = `INSERT INTO users (name, email, hashed_password) VALUES ($1,$2,$3) RETURNING id, name, email`;
  const r = await db.query(q, [name, email, hashed]);
  const user = r.rows[0];
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ user, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const r = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: 'invalid' });
  const ok = await bcrypt.compare(password, user.hashed_password);
  if (!ok) return res.status(401).json({ error: 'invalid' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ token });
});

module.exports = router;
