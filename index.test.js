
const Utils =  require('./utils');

it('extractValue', () => {
  const themes = Utils.extractValues([{ name: 'Dependency:SIEM' }, { name: 'Feature:Bi hoo' }], 'Feature');
  expect(themes).toEqual(['Bi hoo']);
})