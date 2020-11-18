import { getRelativeKibanaPath } from "../utils";
import { ReferenceDoc } from "./reference_doc";

export function getRefDocId(commitHash: string, doc: ReferenceDoc) {
  const relativeRefFile = getRelativeKibanaPath(doc.source.file.path);
  return `
    ${commitHash}.${doc.source.id}.${doc.source.name}.${relativeRefFile.replace('/', '')}
  `
}