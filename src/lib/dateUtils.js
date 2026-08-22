const { format, formatISO, getTime } = require('date-fns');

function dateStringFromEpoch(epochMs) {
  if (epochMs === undefined || epochMs === null || epochMs === '') return undefined;
  return format(new Date(Number(epochMs)), 'yyyy-MM-dd');
}

function timestampFromEpoch(epochMs) {
  if (epochMs === undefined || epochMs === null || epochMs === '') return undefined;
  return formatISO(new Date(Number(epochMs)));
}

function epochFromDate(value) {
  if (!value) return null;
  return getTime(new Date(value));
}

module.exports = { dateStringFromEpoch, timestampFromEpoch, epochFromDate };
