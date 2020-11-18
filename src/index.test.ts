import { extractValues , extractVersionNumber, extractIssueNumber, getRelativeKibanaPath } from './utils';
import { getPluginFromPath, getTeamOwner } from './plugin_utils';

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

it('getTeamOwner', () => {
  const owner = getTeamOwner('/blah/x-pack/legacy/plugins/beats_management/mm', [
    { path: '/x-pack/legacy/plugins/beats_management/', name: 'beats_management', teamOwner: 'beats', missingReadme: 0 }]);
  expect(owner).toBe('beats');
});

it('getRelativeKibanaPath', () => {
  let relativePath = getRelativeKibanaPath('/tmp/tmp-5631-rv2QP2a7ISWH/x-pack/plugins/server/authorization/ui');
  expect(relativePath).toBe('x-pack/plugins/server/authorization/ui');

  relativePath = getRelativeKibanaPath('/tmp/tmp-5631-rv2QP2a7ISWH/src/plugins/server/authorization/ui');
  expect(relativePath).toBe('src/plugins/server/authorization/ui');
})

it('getPluginFromPath', () => {
  expect(getPluginFromPath('/Users/gammon/Elastic/kibana/src/core/f/a')).toBe('core');
  expect(getPluginFromPath('/Users/gammon/Elastic/kibana/x-pack/plugins/alerts/public/index.ts')).toBe('alerts');
})

// it('extractPluginName', () => { 
//   expect(extractPluginNameAndPath('/x-pack/plugins/apm/asdjfklsa')!.pluginPath).toEqual('/x-pack/plugins/apm');
//   expect(extractPluginNameAndPath('/x-pack/plugins/apm/asdjfklsa')!.pluginName).toEqual('apm');
//   expect(extractPluginNameAndPath('/x-pack/plugins/apm')!.pluginName).toEqual('apm');
//   expect(extractPluginNameAndPath('/x-pack/plugins/apm')!.pluginPath).toEqual('/x-pack/plugins/apm');
// });