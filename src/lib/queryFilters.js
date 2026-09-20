// Shared query architecture for every list endpoint in this API. Every list-style GET
// takes ONE JSON-encoded query param, `jsonQuery`, instead of separate params per option:
// ?jsonQuery={"filters":[{"key":"uploadedBy","operator":"eq","value":"..."}],"page":1,"limit":20}
const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'];

// Reads and validates req.query.jsonQuery. Returns { jsonQuery } or { error }.
function parseJsonQuery(req) {
  const raw = req.query.jsonQuery;

  if (!raw) return { jsonQuery: {} };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'jsonQuery must be a JSON-encoded object' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'jsonQuery must be a JSON object' };
  }

  if (parsed.filters !== undefined) {
    if (!Array.isArray(parsed.filters)) {
      return { error: 'jsonQuery.filters must be an array' };
    }
    for (const f of parsed.filters) {
      if (!f || typeof f.key !== 'string' || typeof f.operator !== 'string' || f.value === undefined) {
        return { error: 'each filter must have key, operator and value' };
      }
      if (!OPERATORS.includes(f.operator)) {
        return { error: `operator must be one of: ${OPERATORS.join(', ')}` };
      }
    }
  }

  return { jsonQuery: parsed };
}

// Applies parsed filters to a Supabase query. `allowedFields` maps the public filter key
// (what the caller sends) to the real DB column, so a request can only filter on columns
// the route explicitly opts in — never an arbitrary column name.
function applyFilters(query, filters, allowedFields) {
  for (const { key, operator, value } of filters || []) {
    const column = allowedFields[key];

    if (!column) throw { status: 400, message: `filtering by "${key}" is not supported` };

    switch (operator) {
      case 'eq': query = query.eq(column, value); break;
      case 'neq': query = query.neq(column, value); break;
      case 'gt': query = query.gt(column, value); break;
      case 'gte': query = query.gte(column, value); break;
      case 'lt': query = query.lt(column, value); break;
      case 'lte': query = query.lte(column, value); break;
      case 'in': query = query.in(column, Array.isArray(value) ? value : [value]); break;
    }
  }

  return query;
}

// Same filter architecture, applied to an already-fetched plain JS array instead of a
// Supabase query builder — for endpoints whose response is shaped/joined in JS (e.g.
// getTrips) rather than a straight single-table select.
function applyFiltersInMemory(items, filters, allowedFields) {
  return (filters || []).reduce((acc, { key, operator, value }) => {
    const field = allowedFields[key];

    if (!field) throw { status: 400, message: `filtering by "${key}" is not supported` };

    return acc.filter((item) => {
      const actual = item[field];
      switch (operator) {
        case 'eq': return actual === value;
        case 'neq': return actual !== value;
        case 'gt': return actual > value;
        case 'gte': return actual >= value;
        case 'lt': return actual < value;
        case 'lte': return actual <= value;
        case 'in': return Array.isArray(value) ? value.includes(actual) : actual === value;
        default: return true;
      }
    });
  }, items);
}

module.exports = { OPERATORS, parseJsonQuery, applyFilters, applyFiltersInMemory };
