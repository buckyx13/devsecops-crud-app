/**
 * routes/items.js - CRUD REST endpoints for the Item resource (PostgreSQL).
 * Input validation via express-validator mitigates malformed/malicious input.
 * All DB access goes through models/itemModel.js, which uses parameterized
 * queries exclusively (SQL injection defense).
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const itemModel = require('../models/itemModel');

const router = express.Router();

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// CREATE
router.post(
  '/',
  [
    body('name').isString().trim().notEmpty().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('quantity').isInt({ min: 0 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const item = await itemModel.createItem({
        name: req.body.name,
        description: req.body.description || '',
        quantity: req.body.quantity,
      });
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }
);

// READ all
router.get('/', async (req, res, next) => {
  try {
    const items = await itemModel.getAllItems();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// READ one
router.get(
  '/:id',
  [param('id').isUUID()],
  handleValidation,
  async (req, res, next) => {
    try {
      const item = await itemModel.getItemById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

// UPDATE
router.put(
  '/:id',
  [
    param('id').isUUID(),
    body('name').optional().isString().trim().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('quantity').optional().isInt({ min: 0 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const fields = {};
      if (req.body.name !== undefined) fields.name = req.body.name;
      if (req.body.description !== undefined) fields.description = req.body.description;
      if (req.body.quantity !== undefined) fields.quantity = req.body.quantity;

      const item = await itemModel.updateItem(req.params.id, fields);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE
router.delete(
  '/:id',
  [param('id').isUUID()],
  handleValidation,
  async (req, res, next) => {
    try {
      const deleted = await itemModel.deleteItem(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Item not found' });
      res.json({ message: 'Item deleted', id: deleted.id });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
