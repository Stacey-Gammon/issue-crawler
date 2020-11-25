import { MethodDeclaration, Node, Project, ReferencedSymbol, SourceFile, SyntaxKind, Type } from "ts-morph";
import { getApiId } from "./api_crawler/get_api_id";
import { BasicPluginInfo, getPluginForNestedPath, getPluginForPath, getPluginNameFromPath, readmeExists } from "./plugin_utils";
import { getPublicOrServer } from "./utils";

export interface Api {
  id: string;
  plugin: string;
  file: { path: string };
  isStatic: boolean;
  type: string;
  name: string;
  node: { findReferences: () => ReferencedSymbol[] }
  team: string,
  lifecycle?: string;
}

export function getTsProject(repoPath: string) {
  const xpackTsConfig = `${repoPath}/x-pack/tsconfig.json`;
  const project = new Project({ tsConfigFilePath: xpackTsConfig });
  project.addSourceFilesAtPaths(`${repoPath}/examples/**/*{.d.ts,.ts}`);
  project.resolveSourceFileDependencies();
  return project;
}

export interface ImplicitApiOpts {
  returnType: Type;
  file: string;
  lifecycle: string;
  apis: { [key: string]: Api }
  plugin: BasicPluginInfo;
  project: Project;
}

export function getStaticApi(
  files: Array<SourceFile>,
  plugins: Array<BasicPluginInfo>): { [key: string]: Api } {
  const apis: { [key: string]: Api } = {};
  console.log(`Collecting static apis from ${files.length} files...`);

  collectApiInfoForFiles(
    files,
    plugins, 
    (source, plugin) => addStaticApis(source, plugin, apis));

  console.log(`Collected ${Object.values(apis).length} apis.`);
  return apis;
}

export function getContractApi(
    project: Project,
    files: Array<SourceFile>,
    plugins: Array<BasicPluginInfo>): { [key: string]: Api } {
  const apis: { [key: string]: Api } = {};

  console.log(`Collecting contract apis from ${files.length} files...`);

  collectApiInfoForFiles(
    files,
    plugins, 
    (source, plugin) => addContractApis(project, source, plugin, apis));

  console.log(`Plugin files expose ${Object.values(apis).length} apis`);

  return apis;
}


async function collectApiInfoForFiles(
  files: Array<SourceFile>,
  pluginInfo: Array<BasicPluginInfo>,
  getInfo: (sourceFile: SourceFile, plugin: BasicPluginInfo, apis: { [key: string]: Api }) => void) {
  const apis: { [key: string]: Api } = {};

  console.log(`Collecting API from ${files.length} files`);
  for (const source of files) {
    let plugin = getPluginForPath(source.getFilePath(), pluginInfo);

    console.log(`Collecting API for file ${source.getFilePath()}`);
    if (!plugin) {
      const path = getPluginForNestedPath(source.getFilePath());

      if (!path) {
        console.log(`WARN: No plugin path for file ${source.getFilePath()}`);
        continue;
      }
  
      plugin = {
        name: getPluginNameFromPath(path),
        missingReadme: readmeExists(path) ? 0 : 1,
        teamOwner: '',
        path,
      };

      pluginInfo.push(plugin);
    }

    getInfo(source, plugin, apis);
  };

  return apis;
}

function addImplicitApi({ file, returnType, plugin, lifecycle, apis, project }: ImplicitApiOpts) {
  try {
    const publicOrServer = getPublicOrServer(file);
    returnType.getProperties().forEach(p => {
      p.getDeclarations().forEach(d => {
         if (d.getKind() === SyntaxKind.PropertyAssignment ||
            d.getKind()=== SyntaxKind.ShorthandPropertyAssignment ||
            d.getKind() === SyntaxKind.PropertySignature ||
            d.getKind() === SyntaxKind.PropertyDeclaration ||
            d.getKind() === SyntaxKind.MethodDeclaration) {
          const pa = d as MethodDeclaration;
          if (pa.getName() === 'Symbol.toStringTag') {
            console.warn('WARN: Not ingesting API for Symbol.toStringTag. Information may be lost.');
            return;
          }
          if (pa.getName().trim() === '') {
            console.warn('WARN: Not ingesting empty tag. Information may be lost.');
            return;
          }
          const id = getApiId({ plugin: plugin.name, publicOrServer, lifecycle, name: pa.getName()});

          apis[id] = {
            plugin: plugin.name,
            file: { path: file },
            name: pa.getName(),
            type: d.getKindName(),
            team: plugin.teamOwner,
            isStatic: false,
            id,
            node: pa,
            lifecycle
          };
        } else {
          console.log(`p name: ${p.getName()} declaration of kind ${d.getKindName()}`, d.getText());
        }
      });
    });
  } catch (e) {
    console.error('\nERROR\n', e);
  }
}

export function addContractApis(
  project: Project,
  source: SourceFile,
  plugin: BasicPluginInfo,
  apis: { [key: string]: Api }) {
  const file = source.getFilePath();
  source.getClasses().forEach(c => {
    let hasTypeArgs = false;
    c.getImplements().forEach(i => {
      let index = 0;
      i.getType().getTypeArguments().forEach(ta1 => {
        hasTypeArgs = true;
        const lifecycle = index === 0 ? 'setup' : 'start';
        if (index < 2) { 
          addImplicitApi({ file, returnType: ta1, plugin, lifecycle, project, apis });
        }
        index++;
      });
    });
  });
}

function addApiFromNode(
  node: Node,
  plugin: BasicPluginInfo,
  file: string,
  lifecycle: string,
  apis: { [key: string]: Api }) {
  const publicOrServer = getPublicOrServer(file);
  const identifer = `${plugin.name}.${publicOrServer}.${lifecycle}`;  
  if (Node.isInterfaceDeclaration(node)) {
    if (node.getName() === 'Promise') {
      console.warn(`${identifer} return type is a Promise. Is information being lost? Text is`, node.getText());
      return [];
    }

    const properties = node.getProperties();
    properties.forEach(m => {
      const id = getApiId({ plugin: plugin.name, lifecycle, publicOrServer, name: m.getName() });
      apis[id] = {
        plugin: plugin.name,
        file: { path: file },
        name: m.getName(),
        team: plugin.teamOwner,
        type: m.getKindName(),
        isStatic: false,
        id,
        node: m,
        lifecycle
      };
    });
  }
}

function addRefsForPromiseType(
  project: Project,
  typeArgs: Type[],
  plugin: BasicPluginInfo,
  file: string,
  lifecycle: string,
  apis: { [key: string]: Api }) {
  typeArgs.forEach(tp => {
    addImplicitApi({ file, returnType: tp, plugin, lifecycle, apis, project});
  });
}

export async function addStaticApis(
  source: SourceFile,
  plugin: BasicPluginInfo,
  apis: { [key: string]: Api }) {
  const publicOrServer = getPublicOrServer(source.getFilePath());
  const exported = source.getExportedDeclarations();
  console.log(`Getting ${exported.size} static exports in file ${source.getFilePath()}`);
  exported.forEach(val => {
    val.forEach(ed => {
      // @ts-ignore
      let name: string = ed.getName ? ed.getName() : '';

      if (name === 'plugin' || name === 'config') {
        return;
      }

      if (name && name !== '') {

        // We need to do special handling to capture the core contract api and dig into these
        // exports further.
        if (plugin.name === 'core' && (name === 'CoreSetup' || name === 'CoreStart')) {
          addApiFromNode(ed, plugin, source.getFilePath(),  name === 'CoreSetup' ? 'setup' : 'start', apis);
        } else {
          const id = getApiId({ plugin: plugin.name, publicOrServer, name });
          apis[id] = {
            plugin: plugin.name,
            file: { path: source.getFilePath() },
            name,
            team: plugin.teamOwner,
            type: ed.getKindName(),
            isStatic: true,
            id,
            node: ed as any
          };
        }
      }
    });
  });
}
