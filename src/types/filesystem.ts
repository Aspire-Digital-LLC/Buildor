export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
}

export interface LanguageStat {
  language: string;
  bytes: number;
  percentage: number;
  color: string;
}
