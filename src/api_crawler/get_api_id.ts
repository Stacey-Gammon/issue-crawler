import { ApiDoc } from "./api_doc";

interface ApiIdOpts {
  plugin: string;
  lifecycle?: string;
  publicOrServer: string;
  name: string;
}

export function getApiId({ plugin, lifecycle, publicOrServer, name } : ApiIdOpts) {
  return lifecycle ? `${plugin}.${publicOrServer}.${lifecycle}.${name}` : `${plugin}.${publicOrServer}.${name}`;
}

export function getApiDocId(commitHash: string, doc: ApiDoc) {
  return `${doc.id}.${commitHash}`;
}