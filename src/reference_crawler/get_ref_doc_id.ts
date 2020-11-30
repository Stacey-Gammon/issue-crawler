import { getRelativeKibanaPath } from "../utils";
import { ReferenceDoc } from "./reference_doc";

export function getRefDocId(commitHash: string, doc: ReferenceDoc) {
  const relativeRefFile = getRelativeKibanaPath(doc.reference.file.path);
  return `
    ${commitHash}.${doc.source.id}.${relativeRefFile.replace('/', '')}
  `
}