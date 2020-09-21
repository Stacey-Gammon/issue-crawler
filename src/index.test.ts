
import { extractValues , extractVersionNumber, extractIssueNumber} from './utils';

it('extractValue', () => {
  const themes = extractValues([{ name: 'Dependency:SIEM' }, { name: 'Feature:Bi hoo' }], 'Feature');
  expect(themes).toEqual(['Bi hoo']);
})

it('extractIssueNumber', () => {
  const num = extractIssueNumber(
    'https://api.github.com/repos/elastic/kibana/issues/75780');
  expect(num).toEqual('75780');
})

it('extractVersionNumber', () => {
  const version = extractVersionNumber('Target: 7.9');
  expect(version).toEqual('7.9');

  expect(extractVersionNumber('Target: 7.')).toEqual(undefined);

  expect(extractVersionNumber('8.0')).toEqual('8.0');


  expect(extractVersionNumber('7.14 - tentative')).toEqual('7.14');
})