
function extractValue(labels, value) {
	let val;
	labels.forEach((label) => {
	  if (label.name.startsWith(value)) {
			val = label.name.substring(value.length + 1, label.name.length);
		}
	});
	return val;
}


function extractValues(labels, value) {
  return labels.reduce((acc, label) => {
	  if (label.name.startsWith(value)) {
			acc.push(label.name.substring(value.length + 1, label.name.length));
		}
		return acc;
  }, []);
}

function findLabel(labels, labelToFind) {
  return labels.find((label) => label.name === labelToFind);
}


module.exports = { findLabel, extractValue, extractValues }