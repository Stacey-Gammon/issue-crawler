import  elasticsearch from '@elastic/elasticsearch';
import { getIndexName, indexDocs } from '../es_utils';
import { repo } from './config';
import { getRefDocId } from './get_ref_doc_id';
import { ReferenceDoc } from './reference_doc';


export async function indexRefDocs(
  client: elasticsearch.Client,
  commitHash: string,
  commitDate: string,
  refDocs: Array<ReferenceDoc>,
  indexAsLatest: boolean) {
console.log(`Indexing ${refDocs.length} reference docs`);
const refsIndexName = getIndexName('references', repo);
await indexDocs<ReferenceDoc>(
  client,
  refDocs,
  commitHash,
  commitDate,
  refsIndexName,
  (doc: ReferenceDoc) => getRefDocId(commitHash, doc));
if (indexAsLatest) {
  await indexDocs<ReferenceDoc>(
    client,
    refDocs,
    commitHash,
    commitDate,
    refsIndexName + '-latest',
    (doc: ReferenceDoc) => getRefDocId('', doc));
}
}