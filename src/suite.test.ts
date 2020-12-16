import { SimpleGit } from 'simple-git/promise';
import { Project, SourceFile } from 'ts-morph';
import { getRefCnt } from './api_crawler/get_ref_cnt';
import { getContractApi, getStaticApi, getTsProject } from './api_utils';
import { checkoutRepo, checkoutRoundedDate, getCommitHash } from './git_utils';
import { BasicPluginInfo, getPluginForPath, getPluginInfoForRepo } from './plugin_utils';
import { getReferencesForApi } from './reference_crawler/get_references_for_api';
import { Client } from '@elastic/elasticsearch';
import { elasticsearchEnv } from './es_config';

let repoPath: string;
let project: Project;
let plugins: Array<BasicPluginInfo> = [];
let sourceFiles: Array<SourceFile> = [];
let currentGit: SimpleGit;
let commitHash: string;
let client: Client;

beforeAll(async () =>{
  const repo = await checkoutRepo('elastic/kibana', process.env.LOCAL_REPO_DIR);
  repoPath = repo.repoPath;
  currentGit = repo.currentGit;
  commitHash = await checkoutRoundedDate(repoPath, currentGit, '2020-11-19')
  project = getTsProject(repoPath);
  plugins = getPluginInfoForRepo(repoPath);
  sourceFiles = project.getSourceFiles();
  client = new Client(elasticsearchEnv);
});


it('src/core assigned right owner', () => {
  const plugin = getPluginForPath('/src/core', plugins);
  expect(plugin).toBeDefined();
  expect(plugin?.teamOwner).toBe('kibana-core');
})

it('getReferencesForApi explicit', async () => {
  jest.setTimeout(60000 * 5);

  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('data/public/plugin.ts') >= 0));
  
  const apis = getContractApi(project, files, plugins);

  const searchApi = Object.values(apis).find(api => api.id === 'data.public.start.search');

  const searchRefs = getReferencesForApi({ apis: [searchApi!], plugins });

  // Last checked it was 33 references. If it goes below 20, something might be wrong!
  expect(searchRefs.length).toBeGreaterThan(20);

  const embeddableRef = searchRefs.find(ref => ref.reference.plugin === 'embeddable');

  expect(embeddableRef).toBeUndefined();

  const discoverRef = searchRefs.find(ref => ref.reference.plugin === 'discover');

  expect(discoverRef).toBeDefined();

  // Make sure the full path is being stripped away, and it's just the relative path.
  expect(discoverRef?.reference.file.path.indexOf('src/plugins/discover')).toBe(0);
});

it('getApi for "core" plugin', async () => {
  jest.setTimeout(60000*2);
  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('src/core/public/index.ts') >= 0));
  
  const coreApis = Object.values(getStaticApi(files, plugins));

  expect(coreApis.length).toBeGreaterThan(10);

  const refCnt = await getRefCnt(client, `core.public.start.application`, commitHash);

  console.log('Hash is ' + commitHash);
  expect(refCnt).toBeGreaterThan(0);
});


it('getContractApi for example plugins works', async () => {
  jest.setTimeout(60000*2);
  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (v.getFilePath().indexOf('examples/embeddable_examples/public/plugin.ts') >= 0));
  
  const apis = Object.values(getContractApi(project, files, plugins));

  expect(apis.length).toBeGreaterThan(0);
});

it('data.server.start.indexPatterns has references (implicit contract API)', async () => {
  jest.setTimeout(60000*2);
  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('src/plugins/data/server/plugin.ts') >= 0
  ));
  
  const apis = Object.values(getContractApi(project, files, plugins));

  expect(apis.length).toBeGreaterThan(0);

  const api = Object.values(apis).find(api => api.id === 'data.server.start.indexPatterns');

  expect(api).toBeDefined();
  const refs = getReferencesForApi({ apis: [api!], plugins });

  expect(refs.length).toBeGreaterThan(0);

  expect(refs.find(r => r.reference.plugin === 'vis_type_timeseries')).toBeDefined();
});

it('data.public.start.actions and data.server.start.search has references', async () => {
  jest.setTimeout(60000*2);
  const files: Array<SourceFile> = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('src/plugins/data/server/plugin.ts') >= 0 ||
    v.getFilePath().indexOf('data/public/plugin.ts') >= 0 ||
    v.getFilePath().indexOf('vis_type_vislib/public/plugin.ts') >= 0
  ));

  expect(files.length).toBe(3);

  const apis = Object.values(getContractApi(project, files, plugins));

  expect(apis.length).toBeGreaterThan(0);

  const searchApi = Object.values(apis).find(api => api.id === 'data.server.start.search');

  expect(searchApi).toBeDefined();
  expect(searchApi?.lifecycle).toBe('start');
  expect(searchApi?.publicOrServer).toBe('server');
  const refs = getReferencesForApi({ apis: [searchApi!], plugins });

  expect(refs.length).toBeGreaterThan(0);


  const actionsApi = Object.values(apis).find(api => api.id === 'data.public.start.actions');

  expect(actionsApi).toBeDefined();

  const actionRefs = getReferencesForApi({ apis: [actionsApi!], plugins });

  expect(actionRefs.length).toBeGreaterThan(0);
  expect(actionRefs.find(r => r.reference.plugin === 'vis_type_vislib')).toBeDefined();
});