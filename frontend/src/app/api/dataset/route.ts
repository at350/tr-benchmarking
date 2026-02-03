
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export async function GET() {
    try {
        const csvPath = path.join(process.cwd(), '../datasets/SuperGPQA Law Data.csv');

        if (!fs.existsSync(csvPath)) {
            console.error('CSV file not found at:', csvPath);
            // Fallback for dev environment or if path resolution differs
            const altPath = path.join(process.cwd(), 'datasets/SuperGPQA Law Data.csv'); // If run from root? No, process.cwd in Next is project root.
            // Actually, process.cwd() in Next.js is usually the directory containing package.json (frontend).
            // So ../datasets is correct relative to frontend.

            if (!fs.existsSync(csvPath)) {
                return NextResponse.json({ error: 'Dataset file not found' }, { status: 404 });
            }
        }

        const fileContent = fs.readFileSync(csvPath, 'utf-8');

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            relax_quotes: true, // Handle potential quote issues
        });

        // Normalize data
        const normalizedData = records.map((record: any) => {
            let choices: string[] = [];
            try {
                // The options column looks like python list string: "['A', 'B']"
                // We can try to parse it. 
                // Often these strings use single quotes which JSON.parse doesn't like.
                // Let's replace single quotes with double quotes or use a safer evaluation
                const cleaned = record.options.replace(/'/g, '"'); // simplistic, might break if content has quotes
                // Better approach: use a regex or string manipulation if it's consistently simple
                // Or just treat it as a string to show in UI if parsing fails.

                // Let's try a slightly more robust parse or manual split if standard JSON fails
                // Python list representation: ['item 1', 'item 2']
                // We can interpret this.

                // Let's try to parse "['...']"
                // Remove brackets
                const content = record.options.slice(1, -1);
                // Split by "', '"
                // This is brittle but fast for a demo.
                // Regex for splitting: /', '/ or /', "/ etc.

                // Actually, let's just return the raw string if parsing is too hard, but 
                // for the UI we want array.

                // Hacky parse for demo speed:
                // 1. Swap outer quotes.
                // 2. JSON parse?

                // Let's use a function that tries to fix it up
                choices = parsePythonList(record.options);
            } catch (e) {
                console.error('Failed to parse options for id:', record.uuid, e);
                choices = [record.options]; // Fallback
            }

            return {
                id: record.uuid,
                question: record.question,
                choices: choices,
                answer: record.answer, // The text answer
                answer_letter: record.answer_letter, // A, B, C etc
                discipline: record.discipline,
                subfield: record.subfield,
                difficulty: record.difficulty,
            };
        });

        return NextResponse.json({ data: normalizedData });
    } catch (error) {
        console.error('Error loading dataset:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

function parsePythonList(str: string): string[] {
    // Basic normalization
    str = str.trim();
    if (str.startsWith('[') && str.endsWith(']')) {
        str = str.slice(1, -1);
    }

    // If empty
    if (!str) return [];

    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escape = false;

    // Manual state machine to parse: 'Option 1', "Option 2", ...
    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (escape) {
            current += char;
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            // Don't add backslash immediately? Usually we keep it if it's escaping a quote?
            // Python repr: 'It\'s' -> backslash is essentially part of the string until processed.
            // Let's keep it simple: consume the next char as literal.
            continue;
        }

        if (inQuote) {
            if (char === quoteChar) {
                inQuote = false;
                result.push(current);
                current = '';
                quoteChar = '';
            } else {
                current += char;
            }
        } else {
            if (char === "'" || char === '"') {
                inQuote = true;
                quoteChar = char;
            } else if (char === ',') {
                // Separator, ignore
            } else {
                // Whitespace or unquoted content? 
                // In a valid python list repr, content should be quoted.
                // But sometimes numbers or booleans are not.
                // We'll ignore whitespace between items.
            }
        }
    }

    // Fallback if regex/state machine failed to produce an array but we have string
    if (result.length === 0 && str.length > 0) {
        // Try simple split if it looks like just commas
        if (!str.includes("'") && !str.includes('"')) {
            return str.split(',').map(s => s.trim());
        }
    }

    return result.length > 0 ? result : [str];
}
