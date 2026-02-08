function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateRangeKeys(daysBack) {
  const keys = [];
  for (let i = daysBack - 1; i >= 0; i -= 1) {
    keys.push(toDateKey(daysAgo(i)));
  }
  return keys;
}

module.exports = {
  toDateKey,
  daysAgo,
  dateRangeKeys
};
