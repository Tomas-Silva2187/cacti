export interface ServerUrl {
  ip: string;
  port: number;
}

export enum RequestTarget {
  DB = "DB",
  SERVER = "SERVER"
}

export interface FetchData {
  infrastructureElement: RequestTarget;
  url?: ServerUrl;
}

