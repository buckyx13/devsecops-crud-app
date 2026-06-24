/**
 * models/itemModel.js - Data access layer for the "items" table.
 * SECURITY: every query uses parameterized placeholders ($1, $2, ...) via
 * node-postgres — never string-concatenated SQL — which is the primary
 * defense against SQL injection for this resource.
 */
const { pool } = require('../db/pool');

async function createItem({ name, description, quantity }) {
  const { rows } = await pool.query(
    `INSERT INTO items (name, description, quantity)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, quantity, created_at, updated_at`,
    [name, description, quantity]
  );
  return rows[0];
}

async function getAllItems() {
  const { rows } = await pool.query(
    `SELECT id, name, description, quantity, created_at, updated_at
     FROM items
     ORDER BY created_at DESC`
  );
  return rows;
}

async function getItemById(id) {
  const { rows } = await pool.query(
    `SELECT id, name, description, quantity, created_at, updated_at
     FROM items WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function updateItem(id, fields) {
  // Build a dynamic but still fully parameterized SET clause.
  const keys = Object.keys(fields);
  if (keys.length === 0) return getItemById(id);

  const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`);
  const values = keys.map((key) => fields[key]);

  const { rows } = await pool.query(
    `UPDATE items SET ${setClauses.join(', ')}
     WHERE id = $${keys.length + 1}
     RETURNING id, name, description, quantity, created_at, updated_at`,
    [...values, id]
  );
  return rows[0] || null;
}

async function deleteItem(id) {
  const { rows } = await pool.query(
    `DELETE FROM items WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  createItem,
  getAllItems,
  getItemById,
  updateItem,
  deleteItem,
};
