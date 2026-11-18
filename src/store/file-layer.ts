import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

export interface FileLayer {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
  writeFile(path: string, contents: string, encoding: 'utf8'): Promise<void>;
}

export const nodeFileLayer: FileLayer = {
  mkdir: async (path, options) => mkdir(path, options),
  readFile: async (path, encoding) => readFile(path, encoding),
  rename: async (source, destination) => rename(source, destination),
  rm: async (path, options) => rm(path, options),
  writeFile: async (path, contents, encoding) => writeFile(path, contents, encoding),
};
