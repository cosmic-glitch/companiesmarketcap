/**
 * Custom CSV parser for handling malformed quotes in companiesmarketcap.com CSV exports
 *
 * The issue: Company names like 'Kuwait Financial Centre "Markaz"' have unescaped quotes
 * which break standard CSV parsers.
 *
 * The solution: Since ALL fields are consistently double-quoted, we can split on the
 * "," pattern (quote-comma-quote) which reliably identifies field boundaries.
 */

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

/**
 * Parse a CSV string with potentially malformed quotes and multi-line fields
 * @param csvData - Raw CSV string
 * @returns Parsed headers and rows
 */
export function parseCSVWithMalformedQuotes(csvData: string): ParsedCSV {
  // Split by newline but reassemble lines that are part of multi-line fields
  const lines = parseCSVLines(csvData);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows = lines.slice(1).map(line => parseCSVLine(line));

  return { headers, rows };
}

/**
 * Split CSV data into lines, handling multi-line quoted fields
 * @param csvData - Raw CSV string
 * @returns Array of complete CSV lines
 */
function parseCSVLines(csvData: string): string[] {
  const rawLines = csvData.split('\n');
  const completeLines: string[] = [];
  let currentLine = '';
  let insideQuotes = false;

  for (const rawLine of rawLines) {
    currentLine += (currentLine ? '\n' : '') + rawLine;

    // Count quotes in current accumulated line to determine if we're inside a field
    let quoteCount = 0;
    for (const char of currentLine) {
      if (char === '"') quoteCount++;
    }

    // If quote count is even, we're outside quotes (complete line)
    // If odd, we're inside a quoted field (need more lines)
    if (quoteCount % 2 === 0 && currentLine.trim()) {
      completeLines.push(currentLine);
      currentLine = '';
    }
  }

  // Add any remaining line
  if (currentLine.trim()) {
    completeLines.push(currentLine);
  }

  return completeLines;
}

/**
 * Parse a single CSV line by splitting on "," pattern
 * @param line - Single line from CSV
 * @returns Array of field values
 */
function parseCSVLine(line: string): string[] {
  const trimmed = line.trim();

  // Handle empty lines
  if (!trimmed) {
    return [];
  }

  // Check if line follows expected format (starts and ends with quotes)
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    console.warn(`Unexpected CSV format (missing quotes): ${trimmed.substring(0, 50)}...`);
    // Fallback: simple split and strip quotes
    return trimmed.split(',').map(f => f.replace(/^"|"$/g, ''));
  }

  // Split on "," pattern (quote-comma-quote delimiter)
  // This works because embedded quotes like "Markaz" don't have commas after them
  const fields = trimmed.split('","');

  // Remove leading quote from first field and trailing quote from last field
  if (fields.length > 0) {
    fields[0] = fields[0].replace(/^"/, '');
    fields[fields.length - 1] = fields[fields.length - 1].replace(/"$/, '');
  }

  // Clean up multi-line values by replacing newlines with spaces
  return fields.map(field => field.replace(/\n\s*/g, ' ').trim());
}

/**
 * Convert parsed CSV to array of objects (similar to csv-parse output)
 * @param parsed - Parsed CSV with headers and rows
 * @returns Array of objects where keys are column headers
 */
export function csvToObjects(parsed: ParsedCSV): Record<string, string>[] {
  return parsed.rows.map(row => {
    const obj: Record<string, string> = {};
    parsed.headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
}
