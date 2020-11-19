import { Project, SourceFile } from 'ts-morph';
import { getContractApi } from './api_utils';
import { checkoutRepo } from './git_utils';
import { getPluginInfoForRepo } from './plugin_utils';


// This test will fail if the embeddable_examples public folder changes their exports.
it('getContractApi', async () => {
  const { repoPath } = await checkoutRepo('elastic/kibana', process.env.LOCAL_REPO_DIR);

  const project = new Project({ tsConfigFilePath: `${repoPath}/x-pack/tsconfig.json` });

  const plugins = getPluginInfoForRepo(repoPath);
  
  const sourceFiles = project.getSourceFiles();

  const files: Array<SourceFile> = sourceFiles.filter((v, i) => v.getFilePath().indexOf('embeddable_examples/public/plugin.ts') >= 0);
  
  const apis = getContractApi(project, files, plugins);
  
  const apisArray = Object.values(apis);
  expect(apisArray.length).toBe(2);
  expect(apisArray.find(api => api.name === 'createSampleData')).toBeDefined();
  expect(apisArray.find(api => api.id === 'embeddable_examples.public.start.createSampleData')).toBeDefined();
});

