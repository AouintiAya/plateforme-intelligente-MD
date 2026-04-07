import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Recursively removes undefined values from an object.
 * Firestore does not support undefined values.
 */
export function cleanData(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => (v && typeof v === 'object') ? cleanData(v) : v);
  }
  
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] === undefined) return;
    if (obj[key] && typeof obj[key] === 'object' && !(obj[key] instanceof Date)) {
      newObj[key] = cleanData(obj[key]);
    } else {
      newObj[key] = obj[key];
    }
  });
  return newObj;
}
