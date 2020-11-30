import { SourceFile } from "ts-morph";
import { BasicPluginInfo } from "../plugin_utils";

export interface SourceInfo {
  sourcePlugin: BasicPluginInfo;
  sourceFile: string;
  publicOrServer: 'public' | 'server';
}