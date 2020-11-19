import { Api } from '../api_utils';
import { BasicPluginInfo, getPluginForPath } from '../plugin_utils';
import { getPublicOrServer } from '../utils';
import { addExportReferences } from './add_export_references';
import { ReferenceDoc } from './reference_doc';

interface GetReferencesForApiOpts {
  apis: { [key: string]: Api },
  isStatic: boolean,
  plugins: Array<BasicPluginInfo>
}

export function getReferencesForApi({
  apis,
  isStatic,
  plugins}: GetReferencesForApiOpts): Array<ReferenceDoc> {
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
      addExportReferences({ referencesForApi: api.node.findReferences(), api, sourceInfo, plugins, allReferences: refs, isStatic });
      console.log(`Collected ${Object.values(refs).length} references...`);
    } else {
      console.log('WARN');
    }
    // Travis ci is having js memory issues. See if this will help. Could be the node references??
    api.node = { findReferences: () => []};
  });
  return Object.values(refs);
}
