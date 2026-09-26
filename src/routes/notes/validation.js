const Joi = require('joi');

const createNoteSchema = Joi.object({
  content: Joi.string()
    .min(1)
    .max(20000)
    .required()
    .messages({
      'string.empty': 'Note content is required',
      'string.min': 'Note content is required',
      'string.max': 'Note is too long',
      'any.required': 'Note content is required',
    }),
  is_pinned: Joi.boolean().messages({ 'boolean.base': 'Pinned must be true or false' }),
});

const updateNoteSchema = Joi.object({
  content: Joi.string().min(1).max(20000).messages({
    'string.empty': 'Note content is required',
    'string.min': 'Note content is required',
    'string.max': 'Note is too long',
  }),
  is_pinned: Joi.boolean().messages({ 'boolean.base': 'Pinned must be true or false' }),
})
  .min(1)
  .messages({ 'object.min': 'Please provide at least one field to update' });

function validateBody(schema, body) {
  const { error, value } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (!error) return { value };
  return { error: error.details.map((d) => d.message).join(' ') };
}

module.exports = { createNoteSchema, updateNoteSchema, validateBody };
