
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

type DatasetMode = 'supergpqa' | 'prbench';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const datasetParam = (searchParams.get('dataset') || 'supergpqa').toLowerCase();
        const dataset: DatasetMode = datasetParam === 'prbench' ? 'prbench' : 'supergpqa';

        if (dataset === 'prbench') {
            const csvPath = resolveDatasetPath([
                path.join(process.cwd(), '../datasets/prbench/legal-data.csv'),
                path.join(process.cwd(), 'datasets/prbench/legal-data.csv')
            ]);

            if (!csvPath) {
                return NextResponse.json({ error: 'Dataset file not found' }, { status: 404 });
            }

            const fileContent = fs.readFileSync(csvPath, 'utf-8');
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                relax_quotes: true,
            });

            const normalizedData = records.map((record: any, index: number) => {
                const turns = parseInt(record.turns, 10) || 0;
                const prompts: string[] = [];
                const responses: string[] = [];

                for (let i = 0; i < turns; i++) {
                    prompts.push(record[`prompt_${i}`] || '');
                    responses.push(record[`response_${i}`] || '');
                }

                return {
                    id: record.task || `${index}`,
                    turns,
                    field: record.field,
                    topic: record.topic,
                    rubric: record.rubric,
                    scratchpad: record.scratchpad,
                    prompts,
                    responses
                };
            });

            return NextResponse.json({ data: normalizedData });
        }

        const csvPath = resolveDatasetPath([
            path.join(process.cwd(), '../datasets/supergpqa/SuperGPQA Law Data.csv'),
            path.join(process.cwd(), '../datasets/SuperGPQA Law Data.csv'),
            path.join(process.cwd(), 'datasets/supergpqa/SuperGPQA Law Data.csv'),
            path.join(process.cwd(), 'datasets/SuperGPQA Law Data.csv')
        ]);

        if (!csvPath) {
            return NextResponse.json({ error: 'Dataset file not found' }, { status: 404 });
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

function resolveDatasetPath(paths: string[]): string | null {
    for (const candidate of paths) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function parsePythonList(str: string): string[] {
    str = str.trim();
    if (str.startsWith('[') && str.endsWith(']')) {
        str = str.slice(1, -1);
    }

    if (!str) return [];

    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escape = false;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (escape) {
            current += char;
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
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
                if (current.trim()) {
                    result.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }
    }

    if (current.trim()) {
        result.push(current.trim());
    }

    return result.length > 0 ? result : [str];
}

