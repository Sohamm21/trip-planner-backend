const Joi = require('joi');

const STAY_CATEGORIES = ['hotel', 'flight', 'cab', 'train', 'bus', 'other'];

// Every field gets a friendly .label() (used by any Joi-generated message we didn't
// explicitly override below) plus explicit .messages() for the rules we expect to fire —
// these are shown directly in the UI, so no raw Joi/technical wording should reach it.
const HTTP_URL_MESSAGE = 'Please enter a valid link starting with http:// or https://';

// Joi's uri() does full URL-shape validation (scheme, host, path, query, etc.), not just
// "does new URL() throw" — rejects things like "http://a" or bare "localhost" that the
// native URL constructor alone would happily accept.
function httpUrl(label) {
  return Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .label(label)
    .messages({ 'string.uri': HTTP_URL_MESSAGE, 'string.uriCustomScheme': HTTP_URL_MESSAGE });
}

const expenseInputSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .required()
    .label('Amount')
    .messages({
      'number.base': 'Please enter a valid amount',
      'number.positive': 'Amount must be greater than 0',
      'any.required': 'Amount is required',
    }),
  participantIds: Joi.array()
    .items(Joi.string().guid().messages({ 'string.guid': 'One of the selected members is invalid' }))
    .min(1)
    .required()
    .label('Members to split with')
    .messages({
      'array.min': 'Select at least one member to split with',
      'any.required': 'Select at least one member to split with',
    }),
});

const createStaySchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .required()
    .label('Booking name')
    .messages({
      'string.empty': 'Booking name is required',
      'any.required': 'Booking name is required',
    }),
  category: Joi.string()
    .valid(...STAY_CATEGORIES)
    .required()
    .label('Category')
    .messages({
      'any.only': 'Please select a valid category',
      'any.required': 'Please select a category',
    }),
  start_date: Joi.number()
    .integer()
    .required()
    .label('Start date')
    .messages({
      'number.base': 'Please select a start date',
      'any.required': 'Please select a start date',
    }),
  end_date: Joi.number()
    .integer()
    .min(Joi.ref('start_date'))
    .required()
    .label('End date')
    .messages({
      'number.base': 'Please select an end date',
      'any.required': 'Please select an end date',
      'number.min': 'End date cannot be before the start date',
    }),
  booking_url: httpUrl('Booking URL').allow('', null),
  location_name: Joi.string().label('Location').allow('', null),
  location_url: httpUrl('Location URL').allow('', null),
  expense: expenseInputSchema,
});

// All fields optional (partial update), but at least one must be present. The
// start/end date cross-check only applies here when BOTH are given in the same request —
// comparing a lone end_date against the stay's already-stored start_date still has to
// happen after fetching the row, in the route handler itself.
const updateStaySchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .label('Booking name')
    .messages({ 'string.empty': 'Booking name cannot be empty' }),
  category: Joi.string()
    .valid(...STAY_CATEGORIES)
    .label('Category')
    .messages({ 'any.only': 'Please select a valid category' }),
  start_date: Joi.number().integer().label('Start date'),
  end_date: Joi.number().integer().label('End date'),
  booking_url: httpUrl('Booking URL').allow('', null),
  location_name: Joi.string().label('Location').allow('', null),
  location_url: httpUrl('Location URL').allow('', null),
  expense: expenseInputSchema,
  removeExpense: Joi.boolean(),
})
  .min(1)
  .messages({ 'object.min': 'Please provide at least one field to update' })
  .custom((value, helpers) => {
    if (value.start_date !== undefined && value.end_date !== undefined && value.end_date < value.start_date) {
      return helpers.message('End date cannot be before the start date');
    }
    return value;
  });

function validateBody(schema, body) {
  const { error, value } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (!error) return { value };
  // .join(' ') rather than a semicolon list — reads like one sentence when there's a
  // single problem (the common case), the overwhelmingly likely UI display scenario.
  return { error: error.details.map((d) => d.message).join(' ') };
}

module.exports = { STAY_CATEGORIES, createStaySchema, updateStaySchema, validateBody };
