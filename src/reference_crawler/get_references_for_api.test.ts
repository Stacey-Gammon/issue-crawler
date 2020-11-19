import { Project, SourceFile } from 'ts-morph';
import { getContractApi } from '../api_utils';
import { checkoutRepo } from '../git_utils';
import { getPluginInfoForRepo } from '../plugin_utils';
import { getReferencesForApi } from './get_references_for_api';

it('getReferencesForApi', async () => {
  const { repoPath } = await checkoutRepo('elastic/kibana', process.env.LOCAL_REPO_DIR);

  const project = new Project({ tsConfigFilePath: `${repoPath}/x-pack/tsconfig.json` });

  const plugins = getPluginInfoForRepo(repoPath);
  
  const sourceFiles = project.getSourceFiles();

  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('data/public/plugin.ts') >= 0));
  
  const apisForEmbedExamples = getContractApi(project, files, plugins);

  const api = Object.values(apisForEmbedExamples).find(api => api.name === 'search');

  const refs = getReferencesForApi({ apis: { 'search' : api! }, isStatic: false, plugins });

  // Last checked it was 33 references. If it goes below 20, something might be wrong!
  expect(refs.length).toBeGreaterThan(20);
});