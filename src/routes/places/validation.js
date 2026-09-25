const Joi = require('joi');

const PLACE_CATEGORIES = ['attraction', 'restaurant', 'cafe', 'hotel', 'shopping', 'other'];

const HTTP_URL_MESSAGE = 'Please enter a valid link starting with http:// or https://';

function httpUrl(label) {
  return Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .label(label)
    .messages({ 'string.uri': HTTP_URL_MESSAGE, 'string.uriCustomScheme': HTTP_URL_MESSAGE });
}

const createPlaceSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .required()
    .messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 2 characters',
      'any.required': 'Name is required',
    }),
  category: Joi.string()
    .valid(...PLACE_CATEGORIES)
    .required()
    .messages({
      'any.only': 'Please select a valid category',
      'any.required': 'Please select a category',
    }),
  location_url: httpUrl('Location URL')
    .required()
    .messages({ 'any.required': 'Location is required' }),
  lat: Joi.number().required().messages({
    'number.base': 'Location is required',
    'any.required': 'Location is required',
  }),
  lng: Joi.number().required().messages({
    'number.base': 'Location is required',
    'any.required': 'Location is required',
  }),
  photo_url: httpUrl('Photo URL').allow('', null),
  photo_attribution: Joi.string().allow('', null),
  notes: Joi.string().max(200).allow('', null).messages({
    'string.max': 'Notes must be 200 characters or fewer',
  }),
});

const updatePlaceSchema = Joi.object({
  name: Joi.string().trim().min(2).messages({
    'string.empty': 'Name cannot be empty',
    'string.min': 'Name must be at least 2 characters',
  }),
  category: Joi.string().valid(...PLACE_CATEGORIES).messages({ 'any.only': 'Please select a valid category' }),
  location_url: httpUrl('Location URL'),
  lat: Joi.number(),
  lng: Joi.number(),
  photo_url: httpUrl('Photo URL').allow('', null),
  photo_attribution: Joi.string().allow('', null),
  notes: Joi.string().max(200).allow('', null).messages({
    'string.max': 'Notes must be 200 characters or fewer',
  }),
})
  .min(1)
  .messages({ 'object.min': 'Please provide at least one field to update' });

function validateBody(schema, body) {
  const { error, value } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (!error) return { value };
  return { error: error.details.map((d) => d.message).join(' ') };
}

module.exports = { PLACE_CATEGORIES, createPlaceSchema, updatePlaceSchema, validateBody };
