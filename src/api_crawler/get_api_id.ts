import { ApiDoc } from "./api_doc";

interface ApiIdOpts {
  plugin: string;
  lifeCycle?: string;
  publicOrServer: string;
  name: string;
}

export function getApiId({ plugin, lifeCycle, publicOrServer, name } : ApiIdOpts) {
  return lifeCycle ? `${plugin}.${publicOrServer}.${lifeCycle}.${name}` : `${plugin}.${publicOrServer}.${name}`;
}

export function getApiDocId(commitHash: string, doc: ApiDoc) {
  return `${doc.id}.${commitHash}`;
}