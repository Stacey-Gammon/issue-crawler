import  elasticsearch from 'elasticsearch';
import { Api } from '../api_utils';
import { BasicPluginInfo, getPluginForPath } from '../plugin_utils';
import { getPublicOrServer } from '../utils';
import { addExportReferences } from './add_export_references';
import { indexRefDocs } from './index_references';
import { ReferenceDoc } from './reference_doc';

export async function indexApiReferences(
  client: elasticsearch.Client,
  apis: { [key: string]: Api },
  commitHash: string,
  commitDate: string,
  indexAsLatest: boolean,
  plugins: Array<BasicPluginInfo>) {
  const refs: { [key: string]: ReferenceDoc } = {};
  Object.values(apis).forEach(api => {
    const prevCnt = Object.values(refs).length;
    const sourcePlugin = getPluginForPath(api.file.path, plugins);

    if (sourcePlugin !== undefined) {
      const sourceInfo = {
        sourcePlugin,
        publicOrServer: getPublicOrServer(api.file.path), 
        sourceFile: api.file.path 
      }
      addExportReferences(api.node.findReferences(), api.name, sourceInfo, plugins, refs, false);
    } else {
      console.log('WARN');
    }
    console.log(`Found ${Object.values(refs).length - prevCnt} references for ${api.id}.`);
  });
  await indexRefDocs(client, commitHash, commitDate, Object.values(refs), indexAsLatest);
}