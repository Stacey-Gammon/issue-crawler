import { Project, SourceFile } from 'ts-morph';
import { getContractApi } from '../api_utils';
import { checkoutRepo } from '../git_utils';
import { getPluginInfoForRepo } from '../plugin_utils';
import { getReferencesForApi } from './get_references_for_api';

it('getReferencesForApi explicit', async () => {
  jest.setTimeout(60000*5);

  const { repoPath } = await checkoutRepo('elastic/kibana', process.env.LOCAL_REPO_DIR);

  const project = new Project({ tsConfigFilePath: `${repoPath}/x-pack/tsconfig.json` });

  const plugins = getPluginInfoForRepo(repoPath);
  
  const sourceFiles = project.getSourceFiles();

  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('data/public/plugin.ts') >= 0));
  
  const apisForEmbedExamples = getContractApi(project, files, plugins);

  const searchApi = Object.values(apisForEmbedExamples).find(api => api.name === 'search');

  const searchRefs = getReferencesForApi({ apis: { 'search' : searchApi! }, isStatic: false, plugins });

  // Last checked it was 33 references. If it goes below 20, something might be wrong!
  expect(searchRefs.length).toBeGreaterThan(20);

  const embeddableRef = searchRefs.find(ref => ref.reference.plugin === 'embeddable');

  expect(embeddableRef).toBeUndefined();

  // const autoCompleteApi = Object.values(apisForEmbedExamples).find(api => api.name === 'search');

  // const autoCompleteRefs = getReferencesForApi({ apis: { 'autocomplete' : autoCompleteApi! }, isStatic: false, plugins });

  // const embeddableRef = autoCompleteRefs.find(ref => ref.reference.plugin === 'embeddable');

  // expect(embeddableRef).toBeUndefined();
});