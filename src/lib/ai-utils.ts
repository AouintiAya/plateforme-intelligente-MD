
/**
 * Safely parses a JSON string from an AI response.
 * Handles potential markdown code blocks and provides better error reporting.
 */
export function safeJsonParse<T>(text: string | undefined, defaultValue: T): T {
  if (!text || text.trim() === "") {
    return defaultValue;
  }

  let cleanText = text.trim();
  
  // Remove markdown code blocks if present
  if (cleanText.startsWith("```")) {
    const lines = cleanText.split("\n");
    if (lines[0].startsWith("```")) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith("```")) {
      lines.pop();
    }
    cleanText = lines.join("\n").trim();
  }

  try {
    return JSON.parse(cleanText) as T;
  } catch (error) {
    // Attempt to fix truncated JSON if it looks like it's just missing closing characters
    if (error instanceof Error && (error.message.includes("Unterminated string") || error.message.includes("Unexpected end of JSON input"))) {
      try {
        // Very basic fix: try adding closing quotes and braces
        let fixedText = cleanText;
        if (fixedText.split('"').length % 2 === 0) fixedText += '"';
        
        const openBraces = (fixedText.match(/\{/g) || []).length;
        const closeBraces = (fixedText.match(/\}/g) || []).length;
        for (let i = 0; i < openBraces - closeBraces; i++) fixedText += '}';
        
        const openBrackets = (fixedText.match(/\[/g) || []).length;
        const closeBrackets = (fixedText.match(/\]/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixedText += ']';
        
        return JSON.parse(fixedText) as T;
      } catch (fixError) {
        // If fix fails, fall through to original error reporting
      }
    }

    console.error("JSON Parsing Error:", error);
    console.error("Text length:", cleanText.length);
    console.error("Text snippet (start):", cleanText.substring(0, 500));
    console.error("Text snippet (end):", cleanText.substring(Math.max(0, cleanText.length - 500)));
    
    if (error instanceof Error) {
      throw new Error(`Failed to parse AI response as JSON: ${error.message}. Text length: ${cleanText.length}`);
    }
    throw error;
  }
}

/**
 * Truncates long strings within an object to prevent excessively large prompts.
 */
export function truncateObjectStrings(obj: any, maxLength: number = 2000): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => truncateObjectStrings(item, maxLength));
  }

  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === "string" && value.length > maxLength) {
        newObj[key] = value.substring(0, maxLength) + "... [TRUNCATED]";
      } else if (typeof value === "object") {
        newObj[key] = truncateObjectStrings(value, maxLength);
      } else {
        newObj[key] = value;
      }
    }
  }
  return newObj;
}

/**
 * Removes undefined values from an object recursively.
 * Firestore does not support undefined values.
 */
export function cleanFirestoreData(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // Handle Firestore Timestamps or other special objects that shouldn't be recursed
  if (obj.constructor && obj.constructor.name === 'Timestamp') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item));
  }

  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        newObj[key] = cleanFirestoreData(value);
      }
    }
  }
  return newObj;
}
