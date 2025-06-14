export const api: typeof chrome = (typeof browser !== "undefined" ? browser : chrome) as any;
