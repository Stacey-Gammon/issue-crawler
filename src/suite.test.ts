import { SimpleGit } from 'simple-git/promise';
import { Project, SourceFile } from 'ts-morph';
import { getRefCnt } from './api_crawler/get_ref_cnt';
import { getContractApi, getStaticApi } from './api_utils';
import { checkoutRepo, getCommitHash } from './git_utils';
import { BasicPluginInfo, getPluginForPath, getPluginInfoForRepo } from './plugin_utils';
import { getReferencesForApi } from './reference_crawler/get_references_for_api';
import elasticsearch from 'elasticsearch';
import { elasticsearchEnv } from './config';

let repoPath: string;
let project: Project;
let plugins: Array<BasicPluginInfo> = [];
let sourceFiles: Array<SourceFile> = [];
let currentGit: SimpleGit;
let commitHash: string;
let client: elasticsearch.Client;

beforeAll(async () =>{
  const repo = await checkoutRepo('elastic/kibana', process.env.LOCAL_REPO_DIR);
  repoPath = repo.repoPath;
  currentGit = repo.currentGit;
  commitHash = await getCommitHash(currentGit);
  project = new Project({ tsConfigFilePath: `${repoPath}/x-pack/tsconfig.json` });
  plugins = getPluginInfoForRepo(repoPath);
  sourceFiles = project.getSourceFiles();
  client = new elasticsearch.Client(elasticsearchEnv);
});


it('src/core assigned right owner', () => {
  const plugin = getPluginForPath('/src/core', plugins);
  expect(plugin).toBeDefined();
  expect(plugin?.teamOwner).toBe('kibana-core');
})

// it('getReferencesForApi explicit', async () => {
//   jest.setTimeout(60000*5);

//   const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('data/public/plugin.ts') >= 0));
  
//   const apis = getContractApi(project, files, plugins);

//   const searchApi = Object.values(apis).find(api => api.id === 'data.public.start.search');

//   const searchRefs = getReferencesForApi({ apis: [searchApi!], plugins });

//   // Last checked it was 33 references. If it goes below 20, something might be wrong!
//   expect(searchRefs.length).toBeGreaterThan(20);

//   const embeddableRef = searchRefs.find(ref => ref.reference.plugin === 'embeddable');

//   expect(embeddableRef).toBeUndefined();
// });

it('getApi for "core" plugin', async () => {
  jest.setTimeout(60000*2);
  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('src/core/public/index.ts') >= 0));
  
  const coreApis = Object.values(getStaticApi(files, plugins));

  expect(coreApis.length).toBeGreaterThan(10);

  const refCnt = await getRefCnt(client, `core.public.start.application`, commitHash);

  expect(refCnt).toBeGreaterThan(0);
});

