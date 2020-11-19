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
  isStatic: boolean,
  plugins: Array<BasicPluginInfo>) {
  const refs: { [key: string]: ReferenceDoc } = {};
  const apiArray = Object.values(apis);
  apis = {}; // Travis ci is having js memory issues. See if this will help. Could be the node references??
  apiArray.forEach(api => {
    const sourcePlugin = getPluginForPath(api.file.path, plugins);

    if (sourcePlugin !== undefined) {
      const sourceInfo = {
        sourcePlugin,
        publicOrServer: getPublicOrServer(api.file.path), 
        sourceFile: api.file.path 
      }
      addExportReferences(api.node.findReferences(), api.name, sourceInfo, plugins, refs, isStatic);
      console.log(`Collected ${Object.values(refs).length} references...`);
    } else {
      console.log('WARN');
    }
    // Travis ci is having js memory issues. See if this will help. Could be the node references??
    api.node = { findReferences: () => []};
  });
  await indexRefDocs(client, commitHash, commitDate, Object.values(refs), indexAsLatest);
}
